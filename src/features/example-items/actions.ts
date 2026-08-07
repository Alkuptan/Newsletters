"use server";

// ★ THE CANONICAL SERVER-ACTION FILE — the single most-copied file in the
// org. Every mutation in every tool follows this envelope, in this order:
//
//   1. auth guard        requireUser() / requireRole()
//   2. rate limit        check_rate_limit RPC, where abuse is possible
//   3. validate          zod safeParse of the untyped input
//   4. permission check  the SAME helper the page uses (permissions.ts)
//   5. mutation          RLS-scoped server client (never admin, unless forced)
//   6. revalidatePath    every path that renders this data
//   7. return Result<T>  toResult(...) on success
//
// The whole body sits in try/catch → fromError(err): a server action NEVER
// throws to the client — it always returns a Result the UI can toast.

import { revalidatePath } from "next/cache";
import { requireRole, requireUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import {
  ForbiddenError,
  NotFoundError,
  RateLimitedError,
  ValidationError,
  fromError,
  toResult,
  type Result,
} from "@/lib/errors";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import {
  createItemSchema,
  deleteItemSchema,
  transitionItemSchema,
  updateItemSchema,
} from "./schema";
import { canEditItem } from "./permissions";
import { assertTransition } from "./status-machine";

export async function createItem(input: unknown): Promise<Result<{ id: string }>> {
  try {
    // 1. Auth — throws UnauthenticatedError for anonymous callers.
    const user = await requireUser();
    const supabase = await createClient();

    // 2. Rate limit BEFORE doing any real work. Key by feature + user so one
    //    user cannot exhaust anyone else's budget. 30/minute is generous for
    //    a human and stops a runaway script.
    const { data: allowed, error: rateError } = await supabase.rpc("check_rate_limit", {
      p_scope: "example-items",
      p_max: 30,
      p_window_seconds: 60,
    });
    if (rateError) throw rateError;
    if (!allowed) throw new RateLimitedError();

    // 3. Validate the untyped input — safeParse, never .parse, so WE choose
    //    the error that crosses the wire (zod field messages are user-safe).
    const parsed = createItemSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues, parsed.error.issues[0]?.message);
    }

    // 4./5. Insert. created_by comes from the SESSION, never from the client
    //    — and RLS (example_items_insert) would reject a forged value anyway.
    const { data, error } = await supabase
      .from("example_items")
      .insert({ ...parsed.data, created_by: user.id })
      .select("id")
      .single();
    if (error) throw error;

    // 6. Refresh every Server Component that renders this data.
    revalidatePath("/example-items");

    // 7. Typed success envelope.
    return toResult({ id: data.id });
  } catch (err) {
    return fromError(err); // never rethrow — the client gets a friendly Result
  }
}

export async function updateItem(input: unknown): Promise<Result<null>> {
  try {
    // 1. Auth.
    const user = await requireUser();

    // 3. Validate.
    const parsed = updateItemSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues, parsed.error.issues[0]?.message);
    }
    const { id, title, details } = parsed.data;

    // Fetch first so "missing" and "not yours" produce distinct, accurate
    // errors — RLS alone would report both as zero rows updated.
    const supabase = await createClient();
    const { data: row, error: fetchError } = await supabase
      .from("example_items")
      .select("id, created_by")
      .eq("id", id)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!row) throw new NotFoundError("That item no longer exists.");

    // 4. Permission — mirrors RLS `example_items_update` (creator or admin).
    //    Keep this TS check and the SQL policy in sync, and test both.
    if (!canEditItem(user, row)) throw new ForbiddenError();

    // 5. Update title/details ONLY — status changes go through
    //    transitionItem so the status machine can rule on them.
    const patch: TablesUpdate<"example_items"> = {};
    if (title !== undefined) patch.title = title;
    if (details !== undefined) patch.details = details; // null clears the column
    if (Object.keys(patch).length === 0) return toResult(null); // nothing to change

    const { error } = await supabase.from("example_items").update(patch).eq("id", id);
    if (error) throw error;

    // 6. The list AND the detail page render this row — refresh both.
    revalidatePath("/example-items");
    revalidatePath(`/example-items/${id}`);
    return toResult(null);
  } catch (err) {
    return fromError(err);
  }
}

export async function transitionItem(input: unknown): Promise<Result<null>> {
  try {
    // 1. Auth.
    const user = await requireUser();

    // 3. Validate — `to` is parsed through the shared status enum.
    const parsed = transitionItemSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues, parsed.error.issues[0]?.message);
    }
    const { id, to } = parsed.data;

    const supabase = await createClient();
    const { data: row, error: fetchError } = await supabase
      .from("example_items")
      .select("id, created_by, status")
      .eq("id", id)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!row) throw new NotFoundError("That item no longer exists.");

    // 4. Permission (WHO may write) — same helper as updateItem and the page.
    if (!canEditItem(user, row)) throw new ForbiddenError();

    // 4b. Legality (WHAT moves are allowed) — the status machine throws a
    //     friendly ValidationError for illegal moves, e.g. done → in_progress.
    assertTransition(row.status, to);

    // 5. Mutation.
    const { error } = await supabase.from("example_items").update({ status: to }).eq("id", id);
    if (error) throw error;

    // 6. Refresh list + detail.
    revalidatePath("/example-items");
    revalidatePath(`/example-items/${id}`);
    return toResult(null);
  } catch (err) {
    return fromError(err);
  }
}

export async function deleteItem(input: unknown): Promise<Result<null>> {
  try {
    // 1. Role guard at the top — and RLS `example_items_delete` restricts
    //    DELETE to admins as well. Defense in depth: neither layer trusts
    //    the other, so a bug in one is caught by the other.
    await requireRole("admin");

    // 3. Validate.
    const parsed = deleteItemSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues, parsed.error.issues[0]?.message);
    }

    // 5. Mutation. Deleting a missing row is a silent no-op by design —
    //    delete is idempotent, so a double-click never shows an error.
    const supabase = await createClient();
    const { error } = await supabase.from("example_items").delete().eq("id", parsed.data.id);
    if (error) throw error;

    // 6. The detail page is gone; the client navigates away after this.
    revalidatePath("/example-items");
    return toResult(null);
  } catch (err) {
    return fromError(err);
  }
}
