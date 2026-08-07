import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { log } from "@/lib/log";

/**
 * Auth landing for email links (password recovery, invites) — handles BOTH
 * Supabase flows, or those links dead-end:
 *   • PKCE:       ?code=…                    → exchangeCodeForSession
 *   • token-hash: ?token_hash=…&type=…       → verifyOtp
 * A browser-initiated reset uses PKCE; Supabase's default recovery/invite
 * emails and any admin-generated link (auth.admin.generateLink /
 * inviteUserByEmail) use the token-hash flow. On success we set the session
 * cookie and forward to ?next=.
 */
const OTP_TYPES = new Set<EmailOtpType>([
  "email",
  "recovery",
  "invite",
  "magiclink",
  "signup",
  "email_change",
]);

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const typeParam = url.searchParams.get("type");

  // Open-redirect guard: only same-origin relative paths. "//host" and
  // "/\host" are protocol-relative URLs in browsers, so they're rejected too.
  const nextParam = url.searchParams.get("next") ?? "/";
  const next =
    nextParam.startsWith("/") && !nextParam.startsWith("//") && !nextParam.startsWith("/\\")
      ? nextParam
      : "/";

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
    log.warn("Auth code exchange failed", { code: error.code, message: error.message });
  } else if (tokenHash && typeParam && OTP_TYPES.has(typeParam as EmailOtpType)) {
    const { error } = await supabase.auth.verifyOtp({
      type: typeParam as EmailOtpType,
      token_hash: tokenHash,
    });
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
    log.warn("Auth OTP verification failed", { code: error.code, message: error.message });
  }

  // Expired/reused/malformed links land here — send them back to start over.
  return NextResponse.redirect(new URL("/login", url.origin));
}
