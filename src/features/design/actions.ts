"use server";

/**
 * Saving the newsletter design.
 *
 * A master is admin-only, because one change moves every newsletter in the
 * programme. A unit's own design follows the same rule as its other typed-in
 * values: whoever may change the unit may change its design.
 */

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
import { log } from "@/lib/log";
import { canWriteUnit } from "@/features/units/permissions";
import { currentPmAliases } from "@/features/units/queries";
import { saveTemplateDesignSchema, saveUnitDesignSchema } from "./schema";

/** Change one of the three master designs. */
export async function saveTemplateDesign(input: unknown): Promise<Result<null>> {
  try {
    const user = await requireRole("admin");
    const supabase = await createClient();

    const { data: allowed, error: rateError } = await supabase.rpc("check_rate_limit", {
      p_scope: "design-master",
      p_max: 60,
      p_window_seconds: 60,
    });
    if (rateError) throw rateError;
    if (!allowed) throw new RateLimitedError();

    const parsed = saveTemplateDesignSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues, parsed.error.issues[0]?.message);
    }
    const { kind, overrides } = parsed.data;

    const { error } = await supabase
      .from("newsletter_templates")
      .update({ overrides, updated_by: user.id })
      .eq("kind", kind);
    if (error) throw error;

    log.info("master design changed", { kind });

    /*
      Every newsletter reads this, so every screen that renders one — INCLUDING
      each unit's own page. `revalidatePath("/units")` clears the list only; the
      dynamic children keep their cached copy, and a route pattern with type
      "page" is the documented way to clear them all.

      Getting this wrong is not subtle: the owner changed a master design, opened
      a unit, and the newsletter — and therefore the JPG, the PDF and the emailed
      copy — were all still the previous design.
    */
    revalidatePath("/design");
    revalidatePath("/units");
    revalidatePath("/units/[id]", "page");
    return toResult(null);
  } catch (err) {
    return fromError(err);
  }
}

/**
 * Change one unit's design, or clear it.
 *
 * Passing `null` is the reset: the unit goes back to following its master. The
 * change is stored on the unit, so — like its name and its ticked quotations — it
 * is still there next cycle.
 */
export async function saveUnitDesign(input: unknown): Promise<Result<null>> {
  try {
    const parsed = saveUnitDesignSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues, parsed.error.issues[0]?.message);
    }
    const { unitId, overrides } = parsed.data;

    const user = await requireUser();
    const supabase = await createClient();

    const { data: unit, error: fetchError } = await supabase
      .from("units")
      .select("id, assigned_pm")
      .eq("id", unitId)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!unit) throw new NotFoundError("That unit no longer exists.");

    const aliases = await currentPmAliases();
    if (!canWriteUnit(user, unit, aliases)) throw new ForbiddenError();

    const { data: allowed, error: rateError } = await supabase.rpc("check_rate_limit", {
      p_scope: "design-unit",
      p_max: 60,
      p_window_seconds: 60,
    });
    if (rateError) throw rateError;
    if (!allowed) throw new RateLimitedError();

    const { error } = await supabase
      .from("units")
      .update({ design_overrides: overrides })
      .eq("id", unitId);
    if (error) throw error;

    revalidatePath("/design");
    revalidatePath("/units");
    revalidatePath(`/units/${unitId}`);
    return toResult(null);
  } catch (err) {
    return fromError(err);
  }
}
