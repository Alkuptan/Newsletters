/**
 * Turn database rows into the newsletter view model.
 *
 * The one place where stored rows meet the calculation engine. Kept free of
 * `server-only` so the unit page can pass the result straight into a client
 * component for the export buttons.
 *
 * Dates arrive from Postgres `date` columns as "YYYY-MM-DD" strings and are
 * parsed to local midnight — never through `new Date(string)` on its own, which
 * would treat them as UTC and shift them a day (DECISIONS 0003).
 */

import { fromIsoDate } from "@/lib/newsletter/dates";
import type { QuotationFigures, Stage } from "@/lib/newsletter/types";
import {
  buildNewsletterView,
  type GanttRow,
  type NewsletterPhoto,
  type NewsletterView,
} from "@/lib/newsletter/view-model";
import type { Tables } from "@/lib/supabase/database.types";
import type { UnitDetail } from "@/features/units/queries";

function toDate(iso: string | null): Date | null {
  return iso ? fromIsoDate(iso) : null;
}

/** One stored quotation as the calculation engine wants it. */
export function toQuotationFigures(
  quotation: Pick<
    Tables<"quotations">,
    | "quote_number"
    | "invoice_value"
    | "scope_of_work"
    | "progress"
    | "planned_start_date"
    | "max_contractual_date"
    | "project_status"
    | "notes"
  >,
  assignedPm: string | null,
): QuotationFigures {
  return {
    quoteNumber: quotation.quote_number,
    invoiceValue: Number(quotation.invoice_value),
    scopeOfWork: quotation.scope_of_work,
    // numeric(5,4) comes back as a string from PostgREST.
    progress: Number(quotation.progress),
    plannedStartDate: toDate(quotation.planned_start_date),
    maxContractualDate: toDate(quotation.max_contractual_date),
    projectStatus: quotation.project_status,
    assignedPm,
    notes: quotation.notes,
  };
}

/**
 * Which photos go on the page, in the owner's order.
 *
 * `photoUrl` builds the address the browser actually loads. Photos must be
 * served from this tool's own origin, because both exporters read their pixels
 * and the browser forbids that across origins (DECISIONS 0007).
 */
function toPhotos(
  photos: readonly Tables<"unit_photos">[],
  photoUrl: (photo: Tables<"unit_photos">) => string,
): NewsletterPhoto[] {
  return photos
    .filter((photo) => photo.is_selected)
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
    .map((photo) => ({ url: photoUrl(photo), description: photo.description }));
}

/** The Gantt rows, one per quotation that has a schedule with bars. */
function toGanttRows(unit: UnitDetail, includedQuoteIds: ReadonlySet<string>): GanttRow[] {
  const rows: GanttRow[] = [];

  for (const quotation of unit.quotations) {
    if (!includedQuoteIds.has(quotation.id)) continue;
    const schedule = quotation.gantt_schedules;
    if (!schedule) continue;

    const activities = schedule.gantt_activities
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .flatMap((activity) => {
        const start = toDate(activity.start_date);
        const finish = toDate(activity.finish_date);
        // A bar with an unreadable date cannot be drawn; skipping it is better
        // than rendering the chart at the wrong scale.
        if (!start || !finish) return [];
        return [{ name: activity.name, start, finish, tone: activity.tone }];
      });

    if (activities.length === 0) continue;
    rows.push({
      // Fall back to the scope of work, which is what the samples show on the band.
      label: schedule.row_label.trim() || quotation.scope_of_work,
      activities,
    });
  }

  return rows;
}

export interface ToViewOptions {
  /** The edition supplying the footer label and date. */
  footerLabel: string;
  footerDate: Date;
  /** How to turn a stored photo into a same-origin URL. */
  photoUrl: (photo: Tables<"unit_photos">) => string;
}

/**
 * Build the newsletter for one unit from its stored rows.
 *
 * Only the quotations the owner ticked take part — in the figures, in the
 * project summary, and in the Gantt.
 */
export function unitToNewsletterView(unit: UnitDetail, options: ToViewOptions): NewsletterView {
  const included = unit.quotations.filter((q) => q.include_in_newsletter);
  const includedIds = new Set(included.map((q) => q.id));

  return buildNewsletterView({
    unit: {
      displayName: unit.display_name,
      clientName: unit.client_name,
      concernsOverride: (unit.concerns_override as string[] | null) ?? null,
      stageOverride: (unit.stage_override as Stage | null) ?? null,
    },
    quotations: included.map((q) => toQuotationFigures(q, unit.assigned_pm)),
    ganttRows: toGanttRows(unit, includedIds),
    photos: toPhotos(unit.unit_photos, options.photoUrl),
    footerLabel: options.footerLabel,
    footerDate: options.footerDate,
  });
}
