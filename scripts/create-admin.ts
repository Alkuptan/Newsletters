/**
 * Bootstrap the first admin on a LINKED (cloud) project.
 *   pnpm create-admin -- --email you@orascomhd.com --name "Your Name"
 *
 * Uses the service-role key from .env.production.local. The user receives no
 * password — they set one via the "Forgot password" flow on /login, so no
 * secret ever travels through chat or terminal history.
 */
import { createClient } from "@supabase/supabase-js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const email = arg("email");
const name = arg("name") ?? email?.split("@")[0] ?? "";

if (!email) {
  console.error('Usage: pnpm create-admin -- --email you@company.com --name "Full Name"');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY in .env.production.local");
  process.exit(1);
}

const admin = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Wrapped in an async function (not top-level await): tsx/esbuild transforms
// this script to CommonJS on some Node versions, where top-level await is a
// hard error. A plain async main() runs identically everywhere.
async function main() {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: name, role: "admin" },
  });

  if (error) {
    // Already exists → promote instead.
    if (error.code === "email_exists") {
      const { data: list } = await admin.auth.admin.listUsers();
      const existing = list.users.find((u) => u.email === email);
      if (existing) {
        const { error: updateErr } = await admin
          .from("profiles")
          .update({ role: "admin", is_active: true })
          .eq("id", existing.id);
        if (updateErr) {
          console.error("Failed to promote existing user:", updateErr.message);
          process.exit(1);
        }
        console.log(`✔ ${email} already existed — promoted to admin.`);
        process.exit(0);
      }
    }
    console.error("Failed to create admin:", error.message);
    process.exit(1);
  }

  // handle_new_user() created the profile as 'member' (it never trusts
  // client-supplied roles). Promote explicitly — this script IS the trusted path.
  const newUserId = data.user?.id;
  if (newUserId) {
    const { error: promoteErr } = await admin
      .from("profiles")
      .update({ role: "admin", is_active: true })
      .eq("id", newUserId);
    if (promoteErr) {
      console.error("User created but promotion to admin failed:", promoteErr.message);
      process.exit(1);
    }
  }

  console.log(`✔ Admin created: ${email} (id ${newUserId})`);
  console.log("  They set their password via 'Forgot password' on the login page.");
}

void main();
