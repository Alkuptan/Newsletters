import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ForbiddenError, UnauthenticatedError } from "@/lib/errors";
import type { Database } from "@/lib/supabase/database.types";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Role = Database["public"]["Enums"]["app_role"];

/**
 * The single auth gate. Validates the JWT (getClaims verifies the signature)
 * and loads the caller's profile. Returns null for anonymous callers,
 * deactivated users, and auth users with no profile row.
 *
 * Wrapped in React cache() so a request that calls it from the layout, a
 * page, and an action only hits the database once.
 */
export const currentUser = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (!sub) return null;
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", sub).single();
  // Deactivated users keep a valid JWT for up to ~1 hour after an admin sets
  // is_active=false. Treating them as anonymous here forces the layout-level
  // redirect to /login, which cleanly terminates their session.
  if (!profile || !profile.is_active) return null;
  return profile;
});

/**
 * Guard for SERVER ACTIONS and queries: throws typed errors that fromError()
 * turns into a friendly Result<T>. Never redirects.
 */
export async function requireUser(): Promise<Profile> {
  const user = await currentUser();
  if (!user) throw new UnauthenticatedError();
  return user;
}

/** Role guard for server actions — roles are enforced here, never in the client. */
export async function requireRole(...roles: Role[]): Promise<Profile> {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw new ForbiddenError();
  return user;
}

/** Guard for PAGES: anonymous → /login. Use in layouts/pages, not actions. */
export async function requireSessionPage(): Promise<Profile> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/** Role guard for PAGES: wrong role → home. Use in pages, not actions. */
export async function requireRolePage(...roles: Role[]): Promise<Profile> {
  const user = await requireSessionPage();
  if (!roles.includes(user.role)) redirect("/");
  return user;
}
