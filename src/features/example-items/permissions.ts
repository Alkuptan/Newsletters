// ★ TEACHING FILE: ONE permission helper, used by BOTH the server action
// (before the mutation) and the page (to decide which controls to render).
// That way the button the user sees and the action they may call can never
// disagree. It also mirrors the RLS policy `example_items_update` (migration
// 0004) — keep the SQL policy and this function in sync, and test both.
import type { Profile } from "@/lib/supabase/dal"; // type-only: safe to import anywhere
import type { Tables } from "@/lib/supabase/database.types";

// Structural Pick<> parameters keep these helpers pure and trivially
// unit-testable — no Supabase, no mocks (see tests/unit/example-items-permissions.test.ts).
type Actor = Pick<Profile, "id" | "role" | "is_active">;

/** Creator or admin. Mirrors RLS `example_items_update`. */
export function canEditItem(
  user: Actor,
  item: Pick<Tables<"example_items">, "created_by">,
): boolean {
  // requireUser() already rejects deactivated users; checking again keeps the
  // helper safe wherever it is called from (defense in depth).
  if (!user.is_active) return false;
  return item.created_by === user.id || user.role === "admin";
}

/** Admins only. Mirrors RLS `example_items_delete` and requireRole("admin") in the action. */
export function canDeleteItem(user: Pick<Profile, "role" | "is_active">): boolean {
  return user.is_active && user.role === "admin";
}
