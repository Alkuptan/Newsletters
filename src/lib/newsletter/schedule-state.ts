/**
 * Where a unit stands on having a timeline.
 *
 * Across 152 units, "has no schedule" and "is meant to have no schedule" look
 * identical, so the owner cannot tell the work still to do from the work they
 * deliberately decided against. The decision is recorded per unit; everything
 * else here is derived from it and from the schedules that exist.
 */

/** The owner's decision. Null means nobody has decided yet. */
export type SchedulePlan = "photos_only" | "timeline" | null;

export type ScheduleState =
  /** Every ticked quotation that should have a timeline has one, and it is current. */
  | "has-timeline"
  /** Marked as a photos-only unit. Nothing to build. */
  | "photos-only"
  /** Marked as needing a timeline, but none is built yet. */
  | "needs-timeline"
  /** No timeline and no decision — nobody has looked at this unit yet. */
  | "undecided"
  /** A timeline exists but the sheet has moved the dates under it. */
  | "out-of-date";

export const SCHEDULE_STATE_LABELS: Record<ScheduleState, string> = {
  "has-timeline": "Has a timeline",
  "photos-only": "Photos only",
  "needs-timeline": "Needs a timeline",
  undecided: "Not decided yet",
  "out-of-date": "Timeline out of date",
};

/**
 * Work out a unit's schedule state.
 *
 * Order matters: an out-of-date timeline is reported ahead of everything else,
 * because it is the only one of these that puts a WRONG page in front of a
 * client rather than simply leaving work undone.
 */
export function scheduleStateOf({
  plan,
  schedulesBuilt,
  hasDrift,
}: {
  plan: SchedulePlan;
  /** How many ticked quotations already have a timeline. */
  schedulesBuilt: number;
  /** At least one of those no longer matches its quotation's dates. */
  hasDrift: boolean;
}): ScheduleState {
  if (hasDrift) return "out-of-date";
  if (schedulesBuilt > 0) return "has-timeline";
  if (plan === "photos_only") return "photos-only";
  if (plan === "timeline") return "needs-timeline";
  return "undecided";
}
