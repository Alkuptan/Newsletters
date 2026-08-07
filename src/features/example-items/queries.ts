// ★ TEACHING FILE: reads live here — not in pages, and never in client
// components. `server-only` + the RLS-scoped server client means every query
// runs as the signed-in user. Server Components call these directly.
import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";
import type { ItemStatus } from "./schema";

/**
 * Row shape produced by the join below, typed explicitly so components can
 * `import type` it (type-only imports are erased, so this is safe even in
 * client files).
 */
export type ItemWithCreator = Tables<"example_items"> & {
  created_by_profile: Pick<Tables<"profiles">, "full_name"> | null;
};

// Embed the creator's name through the FK. The `!hint` pins the join to
// `example_items_created_by_fkey` (migration 0004) so PostgREST never has to
// guess which relationship to use if another profiles FK is added later.
const ITEM_WITH_CREATOR_SELECT =
  "*, created_by_profile:profiles!example_items_created_by_fkey(full_name)";

/** All items, newest first, optionally filtered by status. */
export async function listItems(filters: { status?: ItemStatus } = {}): Promise<ItemWithCreator[]> {
  const supabase = await createClient();
  let query = supabase
    .from("example_items")
    .select(ITEM_WITH_CREATOR_SELECT)
    .order("created_at", { ascending: false });
  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  const { data, error } = await query;
  // Queries THROW on failure (unlike actions, which return Result<T>) — the
  // nearest error boundary renders; actions that call them map via fromError.
  if (error) throw error;
  return data;
}

/** Single item or null — null (not an error) when the row does not exist. */
export async function getItem(id: string): Promise<ItemWithCreator | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("example_items")
    .select(ITEM_WITH_CREATOR_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}
