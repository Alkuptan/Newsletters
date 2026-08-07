import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";

/**
 * All profiles, oldest first. RLS (profiles_select) lets any signed-in user
 * read profiles; the /admin/users PAGE is what restricts this list to admins.
 */
export async function listProfiles(): Promise<Tables<"profiles">[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: true });
  // Queries THROW (unlike actions): a failed page read should hit the error
  // boundary, not silently render an empty list.
  if (error) throw error;
  return data;
}
