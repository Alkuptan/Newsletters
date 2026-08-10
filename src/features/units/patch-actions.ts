"use server";

/**
 * Which patch a unit belongs to, and whether its newsletter has actually gone out.
 *
 * Two different facts, deliberately kept apart: EXPORTING produces a file,
 * SENDING is the owner telling the tool it reached the client. Only the second
 * means a unit is done for the cycle.
 */

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/dal";
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
import { canWriteUnit } from "./permissions";
import { currentPmAliases } from "./queries";
// A "use server" file may only export async functions, so the schemas live in
// schema.ts — where every other slice keeps them anyway.
import { setPatchSchema, setSentSchema } from "./schema";

async function assertCanWrite(unitId: string, scope: string) {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: unit, error } = await supabase
    .from("units")
    .select("id, assigned_pm")
    .eq("id", unitId)
    .maybeSingle();
  if (error) throw error;
  if (!unit) throw new NotFoundError("That unit no longer exists.");

  const aliases = await currentPmAliases();
  if (!canWriteUnit(user, unit, aliases)) throw new ForbiddenError();

  const { data: allowed, error: rateError } = await supabase.rpc("check_rate_limit", {
    p_scope: scope,
    p_max: 240,
    p_window_seconds: 60,
  });
  if (rateError) throw rateError;
  if (!allowed) throw new RateLimitedError();

  return { supabase, user };
}

/** Put a unit in a patch, or take it out of one. */
export async function setUnitPatch(input: unknown): Promise<Result<null>> {
  try {
    const parsed = setPatchSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues, parsed.error.issues[0]?.message);
    }
    const { unitId, patch } = parsed.data;

    const { supabase } = await assertCanWrite(unitId, "unit-patch");

    // `patch_changed_at` is maintained by a trigger, not here — see migration 0012.
    const { error } = await supabase
      .from("units")
      .update({ patch: patch === "" ? null : patch })
      .eq("id", unitId);
    if (error) throw error;

    revalidatePath("/units");
    revalidatePath(`/units/${unitId}`);
    return toResult(null);
  } catch (err) {
    return fromError(err);
  }
}

/**
 * Tick a unit as sent for this cycle, or untick it.
 *
 * Recorded per cycle, so next cycle every unit starts as not-yet-sent again.
 */
export async function setUnitSent(input: unknown): Promise<Result<null>> {
  try {
    const parsed = setSentSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues, parsed.error.issues[0]?.message);
    }
    const { editionId, unitId, sent } = parsed.data;

    const { supabase, user } = await assertCanWrite(unitId, "unit-sent");

    const { error } = await supabase.from("edition_units").upsert(
      {
        edition_id: editionId,
        unit_id: unitId,
        sent_at: sent ? new Date().toISOString() : null,
        sent_by: sent ? user.id : null,
      },
      { onConflict: "edition_id,unit_id" },
    );
    if (error) throw error;

    revalidatePath("/units");
    revalidatePath(`/units/${unitId}`);
    return toResult(null);
  } catch (err) {
    return fromError(err);
  }
}
