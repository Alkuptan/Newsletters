import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Privileged client for auth.admin.* calls (user invites, role changes).
 * BYPASSES RLS — that is why ESLint quarantines this module to
 * src/features/*\/actions.ts and scripts/. Never import it anywhere else,
 * and never pass its results to the client without a permission check.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getServerEnv("SUPABASE_SECRET_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
