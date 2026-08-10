import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";

export type EditionRow = Tables<"editions">;

/**
 * Every edition, newest first.
 *
 * The first row is the active cycle: the unit pages read the edition with the
 * latest footer date, so opening a new one moves the whole programme on.
 */
export async function listEditions(): Promise<EditionRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("editions")
    .select("*")
    .order("footer_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}
