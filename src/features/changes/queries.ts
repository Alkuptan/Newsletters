import "server-only";

/**
 * What moved since the last cycle.
 *
 * The previous cycle's frozen snapshots are the "before"; the units as they
 * stand now are the "after". A project manager sees only their own units,
 * because both reads run under RLS.
 */

import { createClient } from "@/lib/supabase/server";
import { aggregateQuotations } from "@/lib/newsletter/aggregate";
import { areaOfConcernBullets } from "@/lib/newsletter/area-of-concern";
import {
  describeChanges,
  findScheduleDrift,
  type ComparableFigures,
  type UnitChange,
} from "@/lib/newsletter/changes";
import { fromIsoDate, toIsoDate } from "@/lib/newsletter/dates";
import { deserialiseNewsletter } from "@/lib/newsletter/snapshot";
import { toQuotationFigures } from "@/features/newsletters/to-view";
import { listEditions } from "@/features/editions/queries";
import { sortFromParams, sortRows, type SortOption, type SortState } from "@/lib/sort";

/** What a change card shows, and so what the list can be ordered by. */
export const CHANGE_SORTS = [
  { field: "action", label: "Needs action first", descendingFirst: true },
  { field: "name", label: "Unit name" },
  { field: "patch", label: "Patch" },
  { field: "pm", label: "Project manager" },
  { field: "count", label: "Number of changes", descendingFirst: true },
] as const satisfies readonly SortOption<string>[];

export type ChangeSortField = (typeof CHANGE_SORTS)[number]["field"];

export interface ChangedUnit {
  id: string;
  unitCode: string;
  displayName: string;
  assignedPm: string | null;
  patch: string | null;
  changes: UnitChange[];
  /** True when at least one change is something to do rather than to know. */
  needsAction: boolean;
}

export interface ChangesBoard {
  /** What "since" means, in the owner's words. */
  comparedWith: { label: string; date: string } | null;
  current: { label: string; date: string } | null;
  units: ChangedUnit[];
  /** Units looked at, so "nothing changed" can be said with confidence. */
  scanned: number;
  sort: SortState<ChangeSortField>;
}

export async function loadChanges(
  params: { sort?: string; dir?: string } = {},
): Promise<ChangesBoard> {
  const supabase = await createClient();

  // Newest first, so [0] is the cycle being worked on and [1] is what to
  // compare against. With only one cycle there is no "before" — everything is
  // reported as new, which is honest.
  const editions = await listEditions();
  const current = editions[0] ?? null;
  const previous = editions[1] ?? null;

  const { data, error } = await supabase
    .from("units")
    .select(
      `id, unit_code, display_name, assigned_pm, patch, concerns_override,
       quotations ( id, quote_number, include_in_newsletter, invoice_value, progress,
                    scope_of_work, planned_start_date, max_contractual_date,
                    project_status, notes,
                    gantt_schedules ( source_start_date, source_finish_date ) ),
       edition_units ( edition_id, snapshot )`,
    )
    .eq("delivery", "after_delivery")
    .order("display_name");
  if (error) throw error;

  // Elapsed time is measured to the cycle's date, exactly as the newsletter does.
  const asOf = current ? (fromIsoDate(current.footer_date) ?? new Date()) : new Date();

  const units: ChangedUnit[] = [];

  for (const row of data ?? []) {
    const ticked = row.quotations.filter((q) => q.include_in_newsletter);
    if (ticked.length === 0) continue;

    const figures = aggregateQuotations(
      ticked.map((q) => toQuotationFigures(q, row.assigned_pm)),
      asOf,
    );

    const now: ComparableFigures = {
      progressPercent: figures.progressPercent,
      verdict: figures.verdict,
      isComplete: figures.isComplete,
      startDate: figures.startDate ? toIsoDate(figures.startDate) : null,
      finishDate: figures.finishDate ? toIsoDate(figures.finishDate) : null,
      // Same cascade the newsletter itself uses: the owner's edit beats the
      // sheet's Notes column.
      concerns:
        (row.concerns_override as string[] | null) ??
        areaOfConcernBullets(ticked.map((q) => q.notes)),
    };

    const link = previous
      ? row.edition_units.find((entry) => entry.edition_id === previous.id)
      : undefined;
    const restored = link?.snapshot ? deserialiseNewsletter(link.snapshot) : null;
    const before: ComparableFigures | null = restored
      ? {
          progressPercent: restored.view.progressPercent,
          verdict: restored.view.verdict,
          isComplete: restored.view.isComplete,
          startDate: restored.view.startDate ? toIsoDate(restored.view.startDate) : null,
          finishDate: restored.view.finishDate ? toIsoDate(restored.view.finishDate) : null,
          concerns: restored.view.concerns,
        }
      : null;

    const drift = findScheduleDrift(
      ticked.map((q) => ({
        quoteNumber: q.quote_number,
        plannedStartDate: q.planned_start_date,
        maxContractualDate: q.max_contractual_date,
        // One schedule per quotation (unique on quotation_id), so this is an
        // object rather than a list.
        schedule: q.gantt_schedules
          ? {
              sourceStartDate: q.gantt_schedules.source_start_date,
              sourceFinishDate: q.gantt_schedules.source_finish_date,
            }
          : null,
      })),
    );

    // With no previous cycle at all, "no newsletter went out last cycle" is true
    // of every unit and is therefore not news — only genuinely wrong things
    // (a timeline the sheet has moved under) are worth showing.
    const changes = describeChanges(before, now, drift).filter(
      (change) => previous || change.kind !== "new",
    );
    if (changes.length === 0) continue;

    units.push({
      id: row.id,
      unitCode: row.unit_code,
      displayName: row.display_name,
      assignedPm: row.assigned_pm,
      patch: row.patch,
      changes,
      needsAction: changes.some((change) => change.needsAction),
    });
  }

  const sort = sortFromParams<ChangeSortField>(params, CHANGE_SORTS, {
    field: "action",
    direction: "desc",
  });

  // Anything to act on first by default; the rest is just news.
  const ordered = sortRows(
    units,
    (unit) => {
      switch (unit && sort.field) {
        case "name":
          return unit.displayName;
        case "patch":
          return unit.patch;
        case "pm":
          return unit.assignedPm;
        case "count":
          return unit.changes.length;
        default:
          return unit.needsAction;
      }
    },
    sort.direction,
    (unit) => unit.displayName,
  );

  return {
    comparedWith: previous
      ? { label: previous.footer_label, date: previous.footer_date }
      : null,
    current: current ? { label: current.footer_label, date: current.footer_date } : null,
    units: ordered,
    scanned: (data ?? []).length,
    sort,
  };
}
