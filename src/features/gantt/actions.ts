"use server";

/**
 * Saving a quotation's Gantt schedule.
 *
 * The activity list is replaced wholesale rather than diffed: the editor hands
 * over the complete list the owner is looking at, and reordering, renaming and
 * deleting bars in one go is exactly what a diff would struggle with. The
 * schedule row itself is kept, so its id stays stable.
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
import { canWriteUnit } from "@/features/units/permissions";
import { currentPmAliases } from "@/features/units/queries";
import { deleteGanttScheduleSchema, saveGanttScheduleSchema } from "./schema";

/**
 * Confirm the caller may edit this quotation's unit, and return the unit id so
 * the right pages can be refreshed afterwards.
 */
async function assertCanEditQuotation(quotationId: string) {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: quotation, error } = await supabase
    .from("quotations")
    .select("id, unit_id, planned_start_date, max_contractual_date, units(id, assigned_pm)")
    .eq("id", quotationId)
    .maybeSingle();
  if (error) throw error;
  if (!quotation?.units) throw new NotFoundError("That quotation no longer exists.");

  const aliases = await currentPmAliases();
  if (!canWriteUnit(user, quotation.units, aliases)) throw new ForbiddenError();

  const { data: allowed, error: rateError } = await supabase.rpc("check_rate_limit", {
    p_scope: "gantt-edit",
    p_max: 60,
    p_window_seconds: 60,
  });
  if (rateError) throw rateError;
  if (!allowed) throw new RateLimitedError();

  return {
    supabase,
    unitId: quotation.unit_id,
    /*
      The dates this schedule is being built against. Stored with the schedule so
      that when the sheet later moves them, the tool can say the timeline no
      longer matches its quotation — the Gantt lives here and does not follow the
      sheet on its own.
    */
    sourceStart: quotation.planned_start_date,
    sourceFinish: quotation.max_contractual_date,
  };
}

/** Create or replace the schedule for one quotation. */
export async function saveGanttSchedule(input: unknown): Promise<Result<{ scheduleId: string }>> {
  try {
    const parsed = saveGanttScheduleSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues, parsed.error.issues[0]?.message);
    }
    const { quotationId, rowLabel, activities } = parsed.data;

    const { supabase, unitId, sourceStart, sourceFinish } =
      await assertCanEditQuotation(quotationId);

    // One schedule per quotation, so upsert on that and keep the same row.
    const { data: schedule, error: scheduleError } = await supabase
      .from("gantt_schedules")
      .upsert(
        {
          quotation_id: quotationId,
          row_label: rowLabel,
          // Saving means "this matches the quotation as it stands now", which is
          // what makes a later date change detectable.
          source_start_date: sourceStart,
          source_finish_date: sourceFinish,
        },
        { onConflict: "quotation_id" },
      )
      .select("id")
      .single();
    if (scheduleError) throw scheduleError;

    // Replace the bars. Deleting first means a removed or reordered activity
    // cannot linger.
    const { error: clearError } = await supabase
      .from("gantt_activities")
      .delete()
      .eq("schedule_id", schedule.id);
    if (clearError) throw clearError;

    if (activities.length > 0) {
      const { error: insertError } = await supabase.from("gantt_activities").insert(
        activities.map((activity, index) => ({
          schedule_id: schedule.id,
          name: activity.name,
          start_date: activity.startDate,
          finish_date: activity.finishDate,
          tone: activity.tone,
          // The order the owner arranged them in, top to bottom.
          sort_order: index,
        })),
      );
      if (insertError) throw insertError;
    }

    revalidatePath("/units");
    revalidatePath(`/units/${unitId}`);
    return toResult({ scheduleId: schedule.id });
  } catch (err) {
    return fromError(err);
  }
}

/**
 * Remove a quotation's schedule entirely.
 *
 * With no schedule left on any ticked quotation, the unit falls back to the
 * photo layout — which is the point: some quotations have no time schedule.
 */
export async function deleteGanttSchedule(input: unknown): Promise<Result<null>> {
  try {
    const parsed = deleteGanttScheduleSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues, parsed.error.issues[0]?.message);
    }
    const { quotationId } = parsed.data;

    const { supabase, unitId } = await assertCanEditQuotation(quotationId);

    // The activities go with it — the foreign key cascades.
    const { error } = await supabase
      .from("gantt_schedules")
      .delete()
      .eq("quotation_id", quotationId);
    if (error) throw error;

    revalidatePath("/units");
    revalidatePath(`/units/${unitId}`);
    return toResult(null);
  } catch (err) {
    return fromError(err);
  }
}
