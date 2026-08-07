"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  AppError,
  ForbiddenError,
  RateLimitedError,
  UnauthenticatedError,
  ValidationError,
  fromError,
  toResult,
  type Result,
} from "@/lib/errors";
import { log } from "@/lib/log";
import {
  requestPasswordResetSchema,
  signInSchema,
  updatePasswordSchema,
} from "@/features/auth/schema";

/**
 * Auth actions are the ONE exception to the "requireUser() first" envelope:
 * sign-in/reset run before a session exists. They also skip the
 * check_rate_limit RPC (it needs an authenticated session) — brute-force
 * protection here is Supabase Auth's built-in per-IP/per-email rate limiting.
 */

/** Canonical site URL for auth email links (reset password, invites). */
async function getSiteUrl(): Promise<string> {
  // Prefer the configured canonical URL — behind Cloudflare the forwarded
  // headers are trustworthy, but an explicit env var never surprises you.
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/+$/, "");
  const headerList = await headers();
  const origin = headerList.get("origin");
  if (origin) return origin;
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const proto = headerList.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export async function signIn(input: unknown): Promise<Result<null>> {
  try {
    const parsed = signInSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues, parsed.error.issues[0]?.message);
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error) {
      // Supabase Auth's built-in limiter is the brute-force guard — surface
      // it distinctly so users don't think their password is wrong.
      if (error.code === "over_request_rate_limit") throw new RateLimitedError();
      // One generic message for every other failure — never reveal whether
      // the email exists or the password was close.
      throw new AppError("unauthenticated", "Wrong email or password.");
    }

    // Deactivated users can still authenticate (auth.users outlives the
    // admin toggle) — kill the session immediately so no cookie lingers.
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_active")
      .eq("id", data.user.id)
      .single();
    if (!profile?.is_active) {
      await supabase.auth.signOut();
      throw new ForbiddenError("Your account is deactivated.");
    }

    // Bust every cached segment — the whole tree renders differently signed in.
    revalidatePath("/", "layout");
    return toResult(null);
  } catch (err) {
    return fromError(err);
  }
}

export async function signOut(): Promise<Result<null>> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    revalidatePath("/", "layout");
    return toResult(null);
  } catch (err) {
    return fromError(err);
  }
}

export async function requestPasswordReset(input: unknown): Promise<Result<null>> {
  // ANTI-ENUMERATION: every path out of this action returns success, so the
  // response never reveals whether an account exists. Failures are logged
  // for engineers, never surfaced to the caller.
  try {
    const parsed = requestPasswordResetSchema.safeParse(input);
    if (!parsed.success) return toResult(null);

    const supabase = await createClient();
    const siteUrl = await getSiteUrl();
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      // The callback route exchanges the code, then forwards to the form.
      redirectTo: `${siteUrl}/auth/callback?next=/reset-password`,
    });
    if (error) {
      log.warn("Password reset email failed", {
        code: error.code,
        message: error.message,
      });
    }
    return toResult(null);
  } catch (err) {
    log.error("requestPasswordReset failed", err);
    return toResult(null);
  }
}

export async function updatePassword(input: unknown): Promise<Result<null>> {
  try {
    // Not requireUser(): a recovery-link session is valid before the profile
    // gate matters — a bare verified JWT is the right bar for changing the
    // password that proves account ownership.
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    if (!data?.claims?.sub) throw new UnauthenticatedError();

    const parsed = updatePasswordSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues, parsed.error.issues[0]?.message);
    }

    const { error } = await supabase.auth.updateUser({
      password: parsed.data.password,
    });
    if (error) {
      if (error.code === "same_password") {
        throw new ValidationError(null, "New password must be different from your current one.");
      }
      throw error; // fromError() collapses this to friendly generic copy.
    }

    revalidatePath("/", "layout");
    return toResult(null);
  } catch (err) {
    return fromError(err);
  }
}
