import "server-only";

/**
 * The dashboard's list, scored and filtered.
 *
 * Shared by the Units screen and by a unit's own page, because Next / Previous
 * only makes sense if it walks the SAME run the owner was looking at — arriving
 * from "needs a timeline" and then stepping through the whole programme would be
 * worse than no buttons at all.
 */

import { aggregateQuotations } from "@/lib/newsletter/aggregate";
import { findScheduleDrift } from "@/lib/newsletter/changes";
import { fromIsoDate } from "@/lib/newsletter/dates";
import {
  scheduleStateOf,
  type ScheduleState,
  type SchedulePlan,
} from "@/lib/newsletter/schedule-state";
import { rankBy, sortFromParams, sortRows } from "@/lib/sort";
import { UNIT_SORTS, type UnitSortField } from "./sorts";
import { toQuotationFigures } from "@/features/newsletters/to-view";
import { latestEdition, listUnits } from "./queries";

/** Everything the address bar can narrow the list by. */
export interface UnitListFilters {
  q?: string;
  zone?: string;
  pm?: string;
  state?: string;
  /** "1" keeps finished units in the list. */
  done?: string;
  /** "1" narrows to units that have not started. */
  zero?: string;
  timeline?: string;
  /** One of UNIT_SORTS. Anything else falls back to the default. */
  sort?: string;
  dir?: string;
  /** A patch name typed but not yet assigned to any unit. */
  newpatch?: string;
  /** Narrow to one patch — a Monday's worth of units. */
  patch?: string;
}

/** Worst first, which is what "sort by status" means to a person. */
const verdictRank = rankBy(["BEHIND", "ON TRACK", "AHEAD", "COMPLETED"] as const);
/** Most urgent first: a wrong page beats work not yet started. */
const timelineRank = rankBy([
  "out-of-date",
  "needs-timeline",
  "undecided",
  "has-timeline",
  "photos-only",
] as const);
/** Closest to being sendable first. */
const readinessRank = rankBy([
  "ready",
  "needs-photos",
  "needs-quotes",
  "not-started",
  "complete",
] as const);

/**
 * What a unit still needs before its newsletter can go out.
 *
 * `not-started` is deliberately its own state rather than a kind of "not ready".
 * Work at 0% has nothing to report, so the owner is never chased for it — see
 * `needsNewsletter` below.
 */
export type ReadinessState = "needs-quotes" | "complete" | "not-started" | "needs-photos" | "ready";

export type ScoredUnit = Awaited<ReturnType<typeof scoreUnits>>[number];

async function scoreUnits(filters: UnitListFilters) {
  const [matched, edition] = await Promise.all([
    listUnits({ zone: filters.zone, assignedPm: filters.pm, search: filters.q }),
    latestEdition(),
  ]);

  // Elapsed time is measured to the cycle's footer date, never to "now", so the
  // dashboard and the newsletter always agree.
  const asOf = edition ? (fromIsoDate(edition.footer_date) ?? new Date()) : new Date();

  return matched.map((unit) => {
    const included = unit.quotations.filter((q) => q.include_in_newsletter);
    const photos = unit.unit_photos.filter((p) => p.is_selected).length;
    const figures = aggregateQuotations(
      included.map((q) => toQuotationFigures(q, unit.assigned_pm)),
      asOf,
    );

    const drift = findScheduleDrift(
      included.map((q) => ({
        quoteNumber: q.quote_number,
        plannedStartDate: q.planned_start_date,
        maxContractualDate: q.max_contractual_date,
        schedule: q.gantt_schedules
          ? {
              sourceStartDate: q.gantt_schedules.source_start_date,
              sourceFinishDate: q.gantt_schedules.source_finish_date,
            }
          : null,
      })),
    );

    const state: ReadinessState =
      included.length === 0
        ? "needs-quotes"
        : figures.isComplete
          ? "complete"
          : figures.progressPercent === 0
            ? "not-started"
            : photos === 0
              ? "needs-photos"
              : "ready";

    /*
      When this unit last had a newsletter produced, and when one was last
      recorded as actually sent — across every cycle, not just the open one.
      Two different facts: exporting makes a file, sending is the owner saying it
      reached the client.
    */
    const links = unit.edition_units ?? [];
    const newest = (pick: (l: (typeof links)[number]) => string | null) => {
      const times = links.map(pick).filter((t): t is string => Boolean(t));
      return times.length > 0 ? times.reduce((a, b) => (a > b ? a : b)) : null;
    };
    const lastReleased = newest((l) => l.exported_at);
    const lastSent = newest((l) => l.sent_at);

    /*
      Whether the owner is on the hook for SENDING this unit.

      Only two states can produce a newsletter: one that is ready, and one that
      is ready except for photos. Finished work has nothing left to report, work
      at 0% has nothing yet to report, and a unit with no ticked quotation has
      nothing to put on a page at all. None of those should be chased for a
      send — that is the owner's explicit instruction about 0% units, and it
      applies equally to the other two.

      Note this is about being CHASED, not about being allowed: any unit can
      still be exported deliberately.
    */
    const needsNewsletter = state === "ready" || state === "needs-photos";

    const timeline: ScheduleState = scheduleStateOf({
      plan: (unit.schedule_plan as SchedulePlan) ?? null,
      schedulesBuilt: included.filter((q) => q.gantt_schedules).length,
      hasDrift: drift.length > 0,
    });

    return {
      unit,
      included,
      photos,
      figures,
      state,
      timeline,
      lastReleased,
      lastSent,
      needsNewsletter,
      edition,
    };
  });
}

/**
 * The list as the owner sees it: scored, then narrowed.
 *
 * `all` is everything they can see (for the "12 of 317" counter); `units` is
 * what survives the filters.
 */
export async function listFilteredUnits(filters: UnitListFilters) {
  const scored = await scoreUnits(filters);

  // Finished work is the bulk of the programme and needs no newsletter, so it is
  // out of the way unless asked for.
  const showFinished = filters.done === "1" || filters.state === "complete";

  const units = scored.filter((row) => {
    if (!showFinished && row.state === "complete") return false;
    if (filters.state && row.state !== filters.state) return false;
    if (filters.zero === "1" && row.figures.progressPercent !== 0) return false;
    if (filters.timeline && row.timeline !== filters.timeline) return false;
    if (filters.patch && (row.unit.patch ?? "") !== filters.patch) return false;
    return true;
  });

  const sort = sortFromParams<UnitSortField>(filters, UNIT_SORTS, {
    field: "name",
    direction: "asc",
  });

  // The name is the tie-break everywhere, so equal rows keep a stable, obvious
  // order instead of reshuffling on every reload.
  const sorted = sortRows(
    units,
    (row) => {
      switch (sort.field) {
        case "client":
          return row.unit.client_name;
        case "progress":
          return row.figures.progressPercent;
        case "verdict":
          return verdictRank(row.figures.verdict);
        case "elapsed":
          return row.figures.elapsedDays;
        case "duration":
          return row.figures.durationDays;
        case "zone":
          return row.unit.zone;
        case "pm":
          return row.unit.assigned_pm;
        case "quotes":
          return row.included.length;
        case "photos":
          return row.photos;
        case "readiness":
          return readinessRank(row.state);
        case "timeline":
          return timelineRank(row.timeline);
        case "patch":
          return row.unit.patch;
        case "released":
          return row.lastReleased;
        case "sent":
          return row.lastSent;
        default:
          return row.unit.display_name;
      }
    },
    sort.direction,
    (row) => row.unit.display_name,
  );

  return {
    units: sorted,
    all: scored,
    showFinished,
    sort,
    edition: scored[0]?.edition ?? null,
  };
}

/**
 * Where a unit sits in the current run, and what is either side of it.
 *
 * Returns null when the unit is not in the filtered list at all — opening a
 * finished unit from a link, say — because "3 of 152" would then be a lie.
 */
export async function unitNeighbours(unitId: string, filters: UnitListFilters) {
  const { units } = await listFilteredUnits(filters);
  const index = units.findIndex((row) => row.unit.id === unitId);
  if (index === -1) return null;

  const at = (i: number) =>
    i >= 0 && i < units.length
      ? { id: units[i].unit.id, displayName: units[i].unit.display_name }
      : null;

  return {
    previous: at(index - 1),
    next: at(index + 1),
    position: index + 1,
    total: units.length,
  };
}
