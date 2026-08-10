/**
 * Re-date a whole schedule so it starts on a new day.
 *
 * This is what makes a schedule reusable. A "Unit Extension" schedule built once
 * carries the shape of the work — how long mobilisation takes, that concrete
 * follows excavation, where the gaps are. Copying it to another unit should keep
 * that shape and simply move it in time: pick the new start date and every other
 * date follows. The owner then edits whatever does not fit.
 *
 * Pure and I/O-free, so it is trivially testable and can run on either side.
 */

import { addCalendarDays, diffCalendarDays, fromIsoDate, toIsoDate } from "./dates";

/** The minimum an activity needs for its dates to be shifted. */
export interface DatedActivity {
  startDate: string;
  finishDate: string;
}

/**
 * The earliest start date in a schedule, as an ISO calendar date.
 *
 * Uses the earliest rather than the first row's, because the owner can reorder
 * bars and the top one is not necessarily the one that starts soonest.
 */
export function earliestStart(activities: readonly DatedActivity[]): string | null {
  const starts = activities.map((a) => a.startDate).filter((s) => s.length > 0);
  if (starts.length === 0) return null;
  // ISO calendar dates sort correctly as plain strings.
  return starts.reduce((earliest, candidate) => (candidate < earliest ? candidate : earliest));
}

/**
 * Move every date so the schedule begins on `newStartIso`.
 *
 * Each activity keeps its own length and its distance from the schedule's start,
 * so durations and the gaps between activities are preserved exactly. Returns the
 * activities untouched if there is nothing to anchor on or the new date is
 * unreadable — silently mangling dates would be far worse than doing nothing.
 */
export function shiftActivityDates<T extends DatedActivity>(
  activities: readonly T[],
  newStartIso: string,
): T[] {
  const anchor = earliestStart(activities);
  const newStart = fromIsoDate(newStartIso);
  if (!anchor || !newStart) return [...activities];

  const anchorDate = fromIsoDate(anchor);
  if (!anchorDate) return [...activities];

  const offset = diffCalendarDays(anchorDate, newStart);
  if (offset === 0) return [...activities];

  return activities.map((activity) => {
    const start = fromIsoDate(activity.startDate);
    const finish = fromIsoDate(activity.finishDate);
    return {
      ...activity,
      startDate: start ? toIsoDate(addCalendarDays(start, offset)) : activity.startDate,
      finishDate: finish ? toIsoDate(addCalendarDays(finish, offset)) : activity.finishDate,
    };
  });
}

/** How many calendar days a schedule spans, start to finish. */
export function scheduleSpanDays(activities: readonly DatedActivity[]): number | null {
  const start = earliestStart(activities);
  if (!start) return null;
  const finishes = activities.map((a) => a.finishDate).filter((f) => f.length > 0);
  if (finishes.length === 0) return null;
  const latest = finishes.reduce((last, candidate) => (candidate > last ? candidate : last));

  const from = fromIsoDate(start);
  const to = fromIsoDate(latest);
  if (!from || !to) return null;
  return diffCalendarDays(from, to);
}
