"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { requireRole } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ForbiddenError,
  NotFoundError,
  RateLimitedError,
  ValidationError,
  fromError,
  toResult,
  type Result,
} from "@/lib/errors";
import { log } from "@/lib/log";
import {
  inviteUserSchema,
  setUserActiveSchema,
  setUserRoleSchema,
  type InviteUserInput,
  type SetUserActiveInput,
  type SetUserRoleInput,
} from "@/features/admin-users/schema";

// One shared budget for all admin mutations: 30 calls/minute per admin.
// The RPC keys off the caller's own id, so no userId argument is needed.
async function checkAdminRateLimit(): Promise<void> {
  const supabase = await createClient();
  const { data: allowed, error } = await supabase.rpc("check_rate_limit", {
    p_scope: "admin",
    p_max: 30,
    p_window_seconds: 60,
  });
  if (error) throw error;
  if (!allowed) throw new RateLimitedError();
}

// Invite links must point at THIS deployment. Prefer the configured site URL;
// fall back to the request's own origin for previews/local dev.
async function getSiteUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
}

export async function inviteUser(input: InviteUserInput): Promise<Result<null>> {
  try {
    const admin = await requireRole("admin");
    const parsed = inviteUserSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError(z.flattenError(parsed.error));
    await checkAdminRateLimit();

    // The ONLY legitimate admin-client use here: auth.admin.* has no
    // RLS-governed equivalent. The handle_new_user trigger creates the profile
    // as 'member' (it deliberately ignores client-supplied role — see
    // 0002_identity.sql). We set the requested role explicitly afterwards,
    // which is safe because requireRole('admin') gated this whole action.
    const adminClient = createAdminClient();
    const siteUrl = await getSiteUrl();
    const { data: invited, error } = await adminClient.auth.admin.inviteUserByEmail(
      parsed.data.email,
      {
        data: { full_name: parsed.data.fullName },
        redirectTo: `${siteUrl}/auth/callback?next=/reset-password`,
      },
    );
    if (error) throw error;

    if (parsed.data.role !== "member") {
      // Fails safe: if this update errored the user would remain a 'member',
      // never over-privileged.
      const { error: roleErr } = await adminClient
        .from("profiles")
        .update({ role: parsed.data.role })
        .eq("id", invited.user.id);
      if (roleErr) throw roleErr;
    }

    log.info("User invited", { email: parsed.data.email, role: parsed.data.role, by: admin.id });
    revalidatePath("/admin/users");
    return toResult(null);
  } catch (err) {
    return fromError(err);
  }
}

export async function setUserRole(input: SetUserRoleInput): Promise<Result<null>> {
  try {
    const admin = await requireRole("admin");
    const parsed = setUserRoleSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError(z.flattenError(parsed.error));
    await checkAdminRateLimit();

    // Guard: demoting yourself would lock the last admin out of this page.
    if (parsed.data.userId === admin.id) {
      throw new ForbiddenError("You cannot change your own role.");
    }

    // Normal (RLS) client on purpose: the profiles_admin_update policy
    // already allows admins to update any profile — no service role needed.
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("profiles")
      .update({ role: parsed.data.role })
      .eq("id", parsed.data.userId)
      .select("id");
    if (error) throw error;
    if (data.length === 0) throw new NotFoundError("User not found.");

    log.info("User role changed", {
      userId: parsed.data.userId,
      role: parsed.data.role,
      by: admin.id,
    });
    revalidatePath("/admin/users");
    return toResult(null);
  } catch (err) {
    return fromError(err);
  }
}

export async function setUserActive(input: SetUserActiveInput): Promise<Result<null>> {
  try {
    const admin = await requireRole("admin");
    const parsed = setUserActiveSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError(z.flattenError(parsed.error));
    await checkAdminRateLimit();

    // Guard: deactivating yourself would end your own session mid-flight.
    if (parsed.data.userId === admin.id && !parsed.data.isActive) {
      throw new ForbiddenError("You cannot deactivate your own account.");
    }

    // Normal (RLS) client — profiles_admin_update covers this update too.
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("profiles")
      .update({ is_active: parsed.data.isActive })
      .eq("id", parsed.data.userId)
      .select("id");
    if (error) throw error;
    if (data.length === 0) throw new NotFoundError("User not found.");

    log.info("User active flag changed", {
      userId: parsed.data.userId,
      isActive: parsed.data.isActive,
      by: admin.id,
    });
    revalidatePath("/admin/users");
    return toResult(null);
  } catch (err) {
    return fromError(err);
  }
}
