import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { log } from "@/lib/log";

/**
 * Auth landing for email links (password recovery, invites) — handles ALL THREE
 * Supabase flows, or those links dead-end:
 *   • PKCE:       ?code=…                    → exchangeCodeForSession
 *   • token-hash: ?token_hash=…&type=…       → verifyOtp
 *   • implicit:   #access_token=…            → handed to /auth/complete, because
 *                                              a fragment never reaches a server
 * A browser-initiated reset uses PKCE. A link built by hand around
 * `{{ .TokenHash }}` uses the token-hash flow. Supabase's DEFAULT recovery and
 * invite emails use NEITHER: they go through Supabase's own /verify endpoint,
 * which returns the session in the fragment. Assuming otherwise is what left an
 * invited colleague confirmed, signed in, and stranded on the login page with no
 * way to set a password. On success we set the session cookie and forward to
 * ?next=.
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

  /*
    No code and no token_hash. Before calling the link broken, consider the third
    possibility: Supabase's DEFAULT recovery and invite emails return the session
    in the URL fragment (#access_token=…), which by definition never reaches this
    server. Hand over to a page that runs in the browser and can read it.

    A redirect keeps the fragment: browsers re-apply it to the new location when
    the target has none of its own. If there genuinely was no fragment, that page
    says the link has expired — the same outcome as before, with a better message.
  */
  if (!code && !tokenHash) {
    const handoff = new URL("/auth/complete", url.origin);
    handoff.searchParams.set("next", next);
    return NextResponse.redirect(handoff);
  }

  // Expired/reused/malformed links land here — send them back to start over.
  return NextResponse.redirect(new URL("/login", url.origin));
}
