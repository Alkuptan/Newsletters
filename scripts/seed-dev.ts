/**
 * Seed known-password dev users (admin@dev.local / member@dev.local,
 * password devpassword123) for LOCAL development and e2e tests.
 *   pnpm seed-dev
 *
 * HARD SAFETY GATE: this refuses to run against anything but a local Supabase
 * (127.0.0.1 / localhost). Known-password accounts must NEVER exist on a cloud
 * project that gets deployed to the internet. Real projects get their first
 * admin from `pnpm create-admin` (no password — the user sets it via the
 * forgot-password flow). This is normally redundant with `supabase/seed.sql`
 * (which the local `db:reset` runs automatically); it exists for the rare case
 * of seeding a local db that was migrated with `db:push` instead of reset.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY in .env.local");
  process.exit(1);
}

const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(url);
if (!isLocal) {
  console.error(
    `REFUSING to seed known-password dev users against a non-local project:\n  ${url}\n` +
      "Dev users are local-only. For a real project use `pnpm create-admin -- --email you@company.com`.",
  );
  process.exit(1);
}

const admin = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEV_USERS = [
  { email: "admin@dev.local", full_name: "Dev Admin", role: "admin" as const },
  { email: "member@dev.local", full_name: "Dev Member", role: "member" as const },
];

// Wrapped in an async function (not top-level await): tsx/esbuild transforms
// this script to CommonJS on some Node versions, where top-level await is a
// hard error. A plain async main() runs identically everywhere.
async function main() {
  for (const u of DEV_USERS) {
    const { error } = await admin.auth.admin.createUser({
      email: u.email,
      password: "devpassword123",
      email_confirm: true,
      user_metadata: { full_name: u.full_name },
    });
    if (error && error.code !== "email_exists") {
      console.error(`Failed to create ${u.email}:`, error.message);
      process.exit(1);
    }
    // The trigger creates every profile as 'member'; promote admins explicitly.
    if (u.role === "admin") {
      const { error: roleErr } = await admin
        .from("profiles")
        .update({ role: "admin" })
        .eq("email", u.email);
      if (roleErr) {
        console.error(`Failed to set role for ${u.email}:`, roleErr.message);
        process.exit(1);
      }
    }
    console.log(`✔ ${u.email} (${u.role})${error ? " — already existed" : ""}`);
  }

  console.log("Dev users ready (LOCAL only). Password: devpassword123");
}

void main();
