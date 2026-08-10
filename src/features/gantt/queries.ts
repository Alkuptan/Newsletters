import "server-only";

/**
 * Finding a schedule worth reusing.
 *
 * A "Unit Extension" schedule built once carries the shape of that work. Rather
 * than a fixed template the tool imposes, the owner picks a real schedule from a
 * unit they have already done and re-dates it — so the library grows out of their
 * own work and stays theirs to change.
 *
 * Runs through the RLS-scoped client, so a project manager can only reuse
 * schedules from units they can already see.
 */

import { createClient } from "@/lib/supabase/server";

export interface ReusableSchedule {
  quotationId: string;
  quoteNumber: string;
  scopeOfWork: string;
  unitId: string;
  unitDisplayName: string;
  rowLabel: string;
  activities: { name: string; startDate: string; finishDate: string; tone: "normal" | "attention" }[];
}

/**
 * Schedules that could be copied onto a quotation with one of `scopes`.
 *
 * @param scopes the scopes of work on the unit being edited
 * @param excludeUnitId the unit being edited — its own schedules are already on
 *   screen, so offering them back would only be confusing
 */
export async function listReusableSchedules(
  scopes: readonly string[],
  excludeUnitId: string,
): Promise<ReusableSchedule[]> {
  const wanted = [...new Set(scopes.map((s) => s.trim().toLocaleLowerCase()).filter(Boolean))];
  if (wanted.length === 0) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gantt_schedules")
    .select(
      `
      row_label,
      gantt_activities ( name, start_date, finish_date, tone, sort_order ),
      quotations!inner (
        id, quote_number, scope_of_work,
        units!inner ( id, display_name )
      )
    `,
    )
    // Newest first: the most recently built schedule is the likeliest template.
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw error;

  const candidates: ReusableSchedule[] = [];

  for (const schedule of data ?? []) {
    const quotation = schedule.quotations;
    const unit = quotation?.units;
    if (!quotation || !unit) continue;
    if (unit.id === excludeUnitId) continue;
    if (!wanted.includes(quotation.scope_of_work.trim().toLocaleLowerCase())) continue;

    const activities = (schedule.gantt_activities ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((activity) => ({
        name: activity.name,
        startDate: activity.start_date,
        finishDate: activity.finish_date,
        tone: activity.tone,
      }));
    // A schedule with no bars is nothing to copy.
    if (activities.length === 0) continue;

    candidates.push({
      quotationId: quotation.id,
      quoteNumber: quotation.quote_number,
      scopeOfWork: quotation.scope_of_work,
      unitId: unit.id,
      unitDisplayName: unit.display_name,
      rowLabel: schedule.row_label,
      activities,
    });
  }

  return candidates;
}
