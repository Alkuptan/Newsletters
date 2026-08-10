"use server";

/**
 * Whether a unit is meant to have a timeline at all.
 *
 * A decision, not a fact derived from the data: some units carry photos only and
 * always will. Recording it is what lets "still needs a timeline" mean something
 * across 152 units.
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
import { setSchedulePlanSchema } from "./schema";

export async function setSchedulePlan(input: unknown): Promise<Result<null>> {
  try {
    const parsed = setSchedulePlanSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues, parsed.error.issues[0]?.message);
    }
    const { unitId, plan } = parsed.data;

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
      p_scope: "schedule-plan",
      p_max: 240,
      p_window_seconds: 60,
    });
    if (rateError) throw rateError;
    if (!allowed) throw new RateLimitedError();

    const { error: updateError } = await supabase
      .from("units")
      .update({ schedule_plan: plan })
      .eq("id", unitId);
    if (updateError) throw updateError;

    revalidatePath("/units");
    revalidatePath(`/units/${unitId}`);
    return toResult(null);
  } catch (err) {
    return fromError(err);
  }
}
