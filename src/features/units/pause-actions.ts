"use server";

/**
 * Pausing a unit until a date.
 *
 * Its own file because a `"use server"` module may only export async functions,
 * and the neighbouring patch actions already fill `patch-actions.ts`.
 *
 * The canonical envelope (docs/template/RULES.md rule 4), and the same permission
 * helper the page uses so a control someone can see and an action they may call
 * cannot disagree. RLS backstops it.
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
import { setPauseSchema } from "./schema";

export async function setUnitPause(input: unknown): Promise<Result<null>> {
  try {
    const parsed = setPauseSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues, parsed.error.issues[0]?.message);
    }
    const { unitId, pausedUntil } = parsed.data;

    const user = await requireUser();
    const supabase = await createClient();

    const { data: unit, error: findError } = await supabase
      .from("units")
      .select("id, assigned_pm")
      .eq("id", unitId)
      .maybeSingle();
    if (findError) throw findError;
    if (!unit) throw new NotFoundError("That unit no longer exists.");

    const aliases = await currentPmAliases();
    if (!canWriteUnit(user, unit, aliases)) throw new ForbiddenError();

    const { data: allowed, error: rateError } = await supabase.rpc("check_rate_limit", {
      p_scope: "unit-pause",
      p_max: 60,
      p_window_seconds: 60,
    });
    if (rateError) throw rateError;
    if (!allowed) throw new RateLimitedError();

    const { error } = await supabase
      .from("units")
      .update({ paused_until: pausedUntil })
      .eq("id", unitId);
    if (error) throw error;

    revalidatePath("/units");
    revalidatePath(`/units/${unitId}`);
    return toResult(null);
  } catch (err) {
    return fromError(err);
  }
}
