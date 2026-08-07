/**
 * Mint a sign-in link for a colleague — the FREE-TIER-SAFE invite path.
 *   pnpm invite-link -- --email colleague@orascomhd.com --name "Full Name"
 *
 * Why this exists: on Supabase's free tier the built-in email service only
 * delivers to the project owner's own team addresses (and only 2/hour), so
 * the Users screen's email invite will NOT reach colleagues until custom
 * SMTP is configured (a graduation item). This script creates the user (as
 * 'member' — promote via the Users screen) and prints a one-time sign-in
 * link the admin forwards themselves (Teams/WhatsApp/etc). The link goes
 * through /auth/callback's token-hash flow and lands on the set-password
 * page.
 *
 * The printed URL is a one-time credential — send it only to the person it
 * is for, and generate a fresh one if it expires (~1 hour) or gets used.
 */
import { createClient } from "@supabase/supabase-js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const email = arg("email");
const name = arg("name") ?? email?.split("@")[0] ?? "";

if (!email) {
  console.error('Usage: pnpm invite-link -- --email colleague@company.com --name "Full Name"');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const site = process.env.NEXT_PUBLIC_SITE_URL;
if (!url || !secret) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY in .env.production.local");
  process.exit(1);
}
if (!site) {
  console.error(
    "Missing NEXT_PUBLIC_SITE_URL in .env.production.local — the link must point at the live app.",
  );
  process.exit(1);
}

const admin = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // New user → 'invite' creates them (profile arrives as 'member' via the
  // handle_new_user trigger — promote in the Users screen if needed).
  // Existing user → fall back to a 'recovery' (set-password) link.
  let linkType: "invite" | "recovery" = "invite";
  let { data, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email: email!,
    options: { data: { full_name: name } },
  });
  if (error && error.code === "email_exists") {
    linkType = "recovery";
    ({ data, error } = await admin.auth.admin.generateLink({ type: "recovery", email: email! }));
  }
  if (error || !data?.properties?.hashed_token) {
    console.error("Failed to generate link:", error?.message ?? "no token returned");
    process.exit(1);
  }

  const link =
    `${site!.replace(/\/+$/, "")}/auth/callback` +
    `?token_hash=${encodeURIComponent(data.properties.hashed_token)}` +
    `&type=${linkType}&next=/reset-password`;

  console.log(`✔ ${linkType === "invite" ? "Invited" : "Reset link for existing user"}: ${email}`);
  console.log("");
  console.log(link);
  console.log("");
  console.log("Forward this link to them directly. It is one-time and expires quickly (~1 hour);");
  console.log("run this again for a fresh one if needed.");
}

void main();
