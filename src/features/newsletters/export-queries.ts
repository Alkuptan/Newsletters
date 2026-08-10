import "server-only";

/**
 * Everything needed to export a whole cycle in one go.
 *
 * Only READY units are fetched — at least one ticked quotation and at least one
 * chosen photo — and the join is filtered so each unit arrives carrying only its
 * ticked quotations and chosen photos. That keeps the payload to what the
 * newsletters actually render rather than the whole programme.
 */

import { createClient } from "@/lib/supabase/server";
import { fromIsoDate } from "@/lib/newsletter/dates";
import {
  resolveTheme,
  templateKindFor,
  type NewsletterTheme,
  type ThemeOverrides,
} from "@/lib/newsletter/theme";
import type { NewsletterView } from "@/lib/newsletter/view-model";
import { getTemplateOverrides } from "@/features/design/queries";
import { rankBy, sortFromParams, sortRows, type SortState } from "@/lib/sort";
import { EXPORT_SORTS, type ExportSortField } from "./export-sorts";
import { unitToNewsletterView } from "./to-view";
import type { UnitDetail } from "@/features/units/queries";
import { latestEdition } from "@/features/units/queries";

/** One newsletter ready to be written into a combined file. */
export interface ExportableNewsletter {
  unitId: string;
  unitCode: string;
  displayName: string;
  view: NewsletterView;
  theme: NewsletterTheme;
}

/**
 * How many newsletters one batch may cover.
 *
 * The owner works in patches of roughly sixty, so a hundred is comfortably above
 * a real batch while staying a number a laptop can finish. The newsletters are
 * rasterised a few at a time (see batch-export.tsx), so this is no longer a
 * memory ceiling — it is a "how long am I willing to wait" ceiling.
 */
export const BATCH_EXPORT_LIMIT = 100;

/**
 * How many rows the query itself will fetch.
 *
 * Deliberately far above BATCH_EXPORT_LIMIT: finished and already-sent units are
 * removed AFTER the rows arrive, so fetching only a batch's worth would silently
 * hide units further down the alphabet. Comfortably above the whole programme
 * (317 units), and still a hard stop.
 */
const QUERY_CEILING = 600;

const READY_SELECT = `
  id, unit_code, display_name, client_name, zone, assigned_pm, delivery,
  stage_override, concerns_override, design_overrides,
  onedrive_folder_url, created_at, updated_at, unit_key,
  patch,
  quotations!inner (
    *,
    gantt_schedules ( *, gantt_activities ( * ) )
  ),
  unit_photos!inner ( * ),
  edition_units ( edition_id, sent_at )
`;

/** What the Export screen can narrow the batch down to. */
export interface ExportFilters {
  zone?: string;
  assignedPm?: string;
  /** One patch, so a Monday's worth of units exports in one click. */
  patch?: string;
  /** Finished units are excluded unless this is on — none of them need sending. */
  includeComplete?: boolean;
  /** Leave out whatever has already been ticked as sent this cycle. */
  unsentOnly?: boolean;
  /** One of EXPORT_SORTS. */
  sort?: string;
  dir?: string;
}

/** Worst first, as on the dashboard. */
const verdictRank = rankBy(["BEHIND", "ON TRACK", "AHEAD", "COMPLETED"] as const);

export async function listReadyNewsletters(filters: ExportFilters = {}): Promise<{
  items: ExportableNewsletter[];
  cappedAt: number | null;
  sort: SortState<ExportSortField>;
}> {
  const supabase = await createClient();

  let query = supabase
    .from("units")
    .select(READY_SELECT)
    .eq("delivery", "after_delivery")
    // Ready = something to say AND something to show.
    .eq("quotations.include_in_newsletter", true)
    .eq("unit_photos.is_selected", true)
    .order("display_name")
    .limit(QUERY_CEILING);

  if (filters.zone) query = query.ilike("zone", filters.zone);
  if (filters.assignedPm) query = query.ilike("assigned_pm", filters.assignedPm);
  if (filters.patch) query = query.eq("patch", filters.patch);

  const [{ data, error }, edition, templates] = await Promise.all([
    query,
    latestEdition(),
    getTemplateOverrides(),
  ]);
  if (error) throw error;

  const footerLabel = edition?.footer_label ?? "Bi-Weekly Newsletter";
  const footerDate = edition ? fromIsoDate(edition.footer_date)! : new Date();

  // Already sent this cycle? Dropped before the cap is applied, so filtering
  // never costs the batch a unit that still needs sending.
  const rows = (data ?? []).filter((row) => {
    if (!filters.unsentOnly || !edition) return true;
    const links = (row as { edition_units?: { edition_id: string; sent_at: string | null }[] })
      .edition_units;
    return !links?.some((link) => link.edition_id === edition.id && link.sent_at !== null);
  });

  const built = rows.map((row) => {
    const unit = row as unknown as UnitDetail;
    const view = unitToNewsletterView(unit, {
      footerLabel,
      footerDate,
      photoUrl: (photo) => `/photo/${photo.id}`,
    });
    const kind = templateKindFor({
      hasSchedule: view.ganttRows.length > 0,
      delivery: unit.delivery,
    });
    return {
      unitId: unit.id,
      unitCode: unit.unit_code,
      displayName: unit.display_name,
      view,
      theme: resolveTheme(
        templates[kind],
        (unit.design_overrides as ThemeOverrides | null) ?? null,
      ),
    };
  });

  /*
    Out of the batch by default: finished work needs no newsletter, and neither
    does work at 0% — there is nothing to report yet, and the owner asked never
    to be prompted for it. Either can still be exported deliberately by ticking
    "include finished".
  */
  const wanted = filters.includeComplete
    ? built
    : built.filter((item) => !item.view.isComplete && item.view.progressPercent > 0);

  const sort = sortFromParams<ExportSortField>(filters, EXPORT_SORTS, {
    field: "name",
    direction: "asc",
  });
  const ordered = sortRows(
    wanted,
    (item) => {
      switch (sort.field) {
        case "progress":
          return item.view.progressPercent;
        case "verdict":
          return verdictRank(item.view.verdict);
        default:
          return item.displayName;
      }
    },
    sort.direction,
    (item) => item.displayName,
  );

  // The cap is applied AFTER ordering, so "the first 100" means the first 100 of
  // what the owner asked to see rather than the first 100 alphabetically.
  const cappedAt = ordered.length > BATCH_EXPORT_LIMIT ? BATCH_EXPORT_LIMIT : null;
  return { items: ordered.slice(0, BATCH_EXPORT_LIMIT), cappedAt, sort };
}
