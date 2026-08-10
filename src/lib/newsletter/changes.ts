/**
 * What moved since the last cycle.
 *
 * Across 152 units, reading every newsletter to find the eleven that changed is
 * the job the tool should be doing. Exporting already freezes a snapshot of each
 * newsletter as it went out, so "what changed" is a comparison, not new data.
 *
 * Pure functions: no database, no dates of its own. Everything is decided from
 * the two sets of figures handed in, which is what makes it testable.
 */

import type { ScheduleVerdict } from "./types";

/** One thing that changed about a unit, in the owner's words. */
export interface UnitChange {
  kind:
    | "progress"
    | "verdict"
    | "completed"
    | "finish-date"
    | "start-date"
    | "concerns"
    | "schedule-stale"
    | "new";
  /** One line, ready to read. */
  summary: string;
  /**
   * True when this needs the owner to DO something rather than just know it —
   * a moved date under a timeline built to the old one, above all.
   */
  needsAction: boolean;
}

/** The figures being compared. Both the snapshot and the live unit reduce to this. */
export interface ComparableFigures {
  progressPercent: number;
  verdict: ScheduleVerdict | null;
  isComplete: boolean;
  /** ISO calendar dates, never timestamps. */
  startDate: string | null;
  finishDate: string | null;
  concerns: readonly string[];
}

/** A schedule that was built against dates the quotation no longer carries. */
export interface ScheduleDrift {
  /** The quotation's reference, for a message the owner can act on. */
  quoteNumber: string;
  builtStart: string | null;
  builtFinish: string | null;
  currentStart: string | null;
  currentFinish: string | null;
}

/** How much progress has to move before it is worth mentioning. */
const PROGRESS_NOISE = 1;

/**
 * Compare a unit against how it looked last cycle.
 *
 * `previous` is null for a unit that had no newsletter last time — reported as
 * new rather than as a pile of changes.
 */
export function describeChanges(
  previous: ComparableFigures | null,
  current: ComparableFigures,
  drift: readonly ScheduleDrift[] = [],
): UnitChange[] {
  const changes: UnitChange[] = [];

  // A timeline built against dates the sheet has since moved is the one thing
  // here that is silently WRONG on the page, so it is reported whether or not
  // there is anything to compare against.
  for (const stale of drift) {
    const moved: string[] = [];
    if (stale.builtStart && stale.currentStart && stale.builtStart !== stale.currentStart) {
      moved.push(`start ${stale.builtStart} → ${stale.currentStart}`);
    }
    if (stale.builtFinish && stale.currentFinish && stale.builtFinish !== stale.currentFinish) {
      moved.push(`finish ${stale.builtFinish} → ${stale.currentFinish}`);
    }
    if (moved.length > 0) {
      changes.push({
        kind: "schedule-stale",
        summary: `Quotation ${stale.quoteNumber}: the sheet moved its ${moved.join(" and ")}, but its timeline was built to the old dates — it needs editing.`,
        needsAction: true,
      });
    }
  }

  if (!previous) {
    changes.push({
      kind: "new",
      summary: "No newsletter went out for this unit last cycle.",
      needsAction: false,
    });
    return changes;
  }

  if (current.isComplete && !previous.isComplete) {
    changes.push({
      kind: "completed",
      summary: "Finished this cycle — every quotation is complete, cancelled or void.",
      needsAction: false,
    });
  }

  const progressMoved = current.progressPercent - previous.progressPercent;
  if (Math.abs(progressMoved) >= PROGRESS_NOISE) {
    changes.push({
      kind: "progress",
      summary: `Progress ${progressMoved > 0 ? "up" : "down"} ${Math.abs(progressMoved)} points — ${previous.progressPercent}% to ${current.progressPercent}%.`,
      // Progress going BACKWARDS is either a correction or a mistake, and either
      // way the owner should look before it reaches a client.
      needsAction: progressMoved < 0,
    });
  }

  if (previous.verdict !== current.verdict && !(current.isComplete && !previous.isComplete)) {
    changes.push({
      kind: "verdict",
      summary: `Status ${previous.verdict ?? "—"} → ${current.verdict ?? "—"}.`,
      needsAction: current.verdict === "BEHIND" && previous.verdict !== "BEHIND",
    });
  }

  if (previous.startDate !== current.startDate) {
    changes.push({
      kind: "start-date",
      summary: `Start date ${previous.startDate ?? "—"} → ${current.startDate ?? "—"}.`,
      needsAction: false,
    });
  }

  if (previous.finishDate !== current.finishDate) {
    changes.push({
      kind: "finish-date",
      summary: `Finish date ${previous.finishDate ?? "—"} → ${current.finishDate ?? "—"}.`,
      // Flagged only when no schedule already reported the same move, so the
      // owner is not told twice about one thing.
      needsAction: drift.length === 0,
    });
  }

  const concernsBefore = [...previous.concerns].sort();
  const concernsNow = [...current.concerns].sort();
  if (concernsBefore.join("|") !== concernsNow.join("|")) {
    const added = concernsNow.filter((c) => !concernsBefore.includes(c));
    const gone = concernsBefore.filter((c) => !concernsNow.includes(c));
    const parts: string[] = [];
    if (added.length > 0) parts.push(`added ${added.map((c) => `"${c}"`).join(", ")}`);
    if (gone.length > 0) parts.push(`cleared ${gone.map((c) => `"${c}"`).join(", ")}`);
    changes.push({
      kind: "concerns",
      summary: `Area of Concern ${parts.join("; ")}.`,
      needsAction: added.length > 0,
    });
  }

  return changes;
}

/** Work out which of a unit's schedules no longer match their quotation. */
export function findScheduleDrift(
  quotations: readonly {
    quoteNumber: string;
    plannedStartDate: string | null;
    maxContractualDate: string | null;
    schedule: { sourceStartDate: string | null; sourceFinishDate: string | null } | null;
  }[],
): ScheduleDrift[] {
  const drifted: ScheduleDrift[] = [];

  for (const quotation of quotations) {
    const schedule = quotation.schedule;
    // No schedule, or one built before the tool recorded what it was built
    // against: unknown is not the same as stale, and guessing would cry wolf on
    // every unit at once.
    if (!schedule) continue;
    if (!schedule.sourceStartDate && !schedule.sourceFinishDate) continue;

    const startMoved =
      Boolean(schedule.sourceStartDate) &&
      Boolean(quotation.plannedStartDate) &&
      schedule.sourceStartDate !== quotation.plannedStartDate;
    const finishMoved =
      Boolean(schedule.sourceFinishDate) &&
      Boolean(quotation.maxContractualDate) &&
      schedule.sourceFinishDate !== quotation.maxContractualDate;

    if (startMoved || finishMoved) {
      drifted.push({
        quoteNumber: quotation.quoteNumber,
        builtStart: schedule.sourceStartDate,
        builtFinish: schedule.sourceFinishDate,
        currentStart: quotation.plannedStartDate,
        currentFinish: quotation.maxContractualDate,
      });
    }
  }

  return drifted;
}
