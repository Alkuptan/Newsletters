/**
 * Re-dating a reused schedule.
 *
 * The promise this makes to the owner: copy a schedule, choose a new start date,
 * and everything else moves with it — same activity lengths, same gaps. If that
 * is wrong, a copied schedule quietly misrepresents the work, so it is pinned
 * here in detail.
 */

import { describe, expect, it } from "vitest";
import { addCalendarDays, fromIsoDate, toIsoDate } from "@/lib/newsletter/dates";
import {
  earliestStart,
  scheduleSpanDays,
  shiftActivityDates,
} from "@/lib/newsletter/schedule-shift";

/** Cyan 11's real Unit Extension schedule, transcribed from the supplied slide. */
const CY_11_SCHEDULE = [
  { name: "Mobilization", startDate: "2026-03-30", finishDate: "2026-04-28" },
  { name: "Scaffolding/Dismantling", startDate: "2026-04-29", finishDate: "2026-05-26" },
  { name: "Excavation and Foundation", startDate: "2026-05-27", finishDate: "2026-06-23" },
  { name: "Concrete Works", startDate: "2026-06-24", finishDate: "2026-07-21" },
  { name: "Block Works", startDate: "2026-07-22", finishDate: "2026-08-20" },
  { name: "External Paint and Plaster", startDate: "2026-08-21", finishDate: "2026-09-17" },
  { name: "Handing Over", startDate: "2026-09-18", finishDate: "2026-09-24" },
];

/** Days between two ISO calendar dates. */
function days(fromIso: string, toIso: string): number {
  const from = fromIsoDate(fromIso)!;
  const to = fromIsoDate(toIso)!;
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

describe("finding the anchor", () => {
  it("takes the earliest start, not the top row", () => {
    // The owner can reorder bars, so the first row is not necessarily first.
    const reordered = [CY_11_SCHEDULE[3], CY_11_SCHEDULE[0], CY_11_SCHEDULE[1]];
    expect(earliestStart(reordered)).toBe("2026-03-30");
  });

  it("returns nothing for an empty schedule", () => {
    expect(earliestStart([])).toBeNull();
  });
});

describe("shifting a schedule to a new start date", () => {
  const shifted = shiftActivityDates(CY_11_SCHEDULE, "2027-01-11");

  it("starts on exactly the date asked for", () => {
    expect(shifted[0].startDate).toBe("2027-01-11");
  });

  it("keeps every activity the same length", () => {
    CY_11_SCHEDULE.forEach((original, index) => {
      expect(days(shifted[index].startDate, shifted[index].finishDate)).toBe(
        days(original.startDate, original.finishDate),
      );
    });
  });

  it("keeps the gaps between activities", () => {
    for (let i = 1; i < CY_11_SCHEDULE.length; i++) {
      expect(days(shifted[i - 1].finishDate, shifted[i].startDate)).toBe(
        days(CY_11_SCHEDULE[i - 1].finishDate, CY_11_SCHEDULE[i].startDate),
      );
    }
  });

  it("keeps the overall span identical", () => {
    expect(scheduleSpanDays(shifted)).toBe(scheduleSpanDays(CY_11_SCHEDULE));
    // Cyan 11: 30 Mar → 24 Sep.
    expect(scheduleSpanDays(CY_11_SCHEDULE)).toBe(178);
  });

  it("carries the activity names through untouched", () => {
    expect(shifted.map((a) => a.name)).toEqual(CY_11_SCHEDULE.map((a) => a.name));
  });

  it("shifts backwards just as happily", () => {
    const earlier = shiftActivityDates(CY_11_SCHEDULE, "2025-11-01");
    expect(earlier[0].startDate).toBe("2025-11-01");
    expect(scheduleSpanDays(earlier)).toBe(scheduleSpanDays(CY_11_SCHEDULE));
  });

  it("survives a leap day", () => {
    // 2028 is a leap year; a naive month-arithmetic shift drifts here.
    const leap = shiftActivityDates(CY_11_SCHEDULE, "2028-02-20");
    expect(leap[0].startDate).toBe("2028-02-20");
    expect(days(leap[0].startDate, leap[0].finishDate)).toBe(
      days(CY_11_SCHEDULE[0].startDate, CY_11_SCHEDULE[0].finishDate),
    );
    expect(scheduleSpanDays(leap)).toBe(178);
  });

  it("survives Egypt's daylight-saving change", () => {
    // Clocks move in late April; adding milliseconds would land a day early.
    const across = shiftActivityDates(
      [{ name: "x", startDate: "2026-04-20", finishDate: "2026-05-20" }],
      "2026-04-25",
    );
    expect(across[0].startDate).toBe("2026-04-25");
    expect(across[0].finishDate).toBe("2026-05-25");
  });

  it("shifts a reordered schedule by the same offset for every row", () => {
    const reordered = [CY_11_SCHEDULE[3], CY_11_SCHEDULE[0], CY_11_SCHEDULE[6]];
    const result = shiftActivityDates(reordered, "2027-01-11");
    const offset = days("2026-03-30", "2027-01-11");
    reordered.forEach((original, index) => {
      expect(result[index].startDate).toBe(
        toIsoDate(addCalendarDays(fromIsoDate(original.startDate)!, offset)),
      );
    });
  });
});

describe("refusing to mangle anything", () => {
  it("leaves the schedule alone when the new date is unreadable", () => {
    expect(shiftActivityDates(CY_11_SCHEDULE, "not-a-date")).toEqual(CY_11_SCHEDULE);
  });

  it("leaves the schedule alone when the date is unchanged", () => {
    expect(shiftActivityDates(CY_11_SCHEDULE, "2026-03-30")).toEqual(CY_11_SCHEDULE);
  });

  it("handles an empty schedule", () => {
    expect(shiftActivityDates([], "2027-01-11")).toEqual([]);
  });
});
