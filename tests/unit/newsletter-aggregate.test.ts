/**
 * Regression tests for the newsletter calculation engine.
 *
 * These are pinned to the three real sample newsletters in `Sample/` and to the
 * real rows in `Sample/Follow-up sheet (Don't Delete).xlsm`. If a rule in
 * docs/SPEC.md changes, these fail first.
 *
 * Note on the elapsed-day figures: the supplied samples were assembled by hand
 * in PowerPoint over a day or two, so their "Elapsed Time" is 1–2 days ahead of
 * a clean footer-date calculation (CY-11 shows 72 where the arithmetic gives
 * 70). The duration and verdict figures below match the samples exactly; the
 * elapsed counts are asserted against the arithmetic, deliberately.
 */

import { describe, expect, it } from "vitest";
import { aggregateQuotations, verdictFor } from "@/lib/newsletter/aggregate";
import { areaOfConcernBullets } from "@/lib/newsletter/area-of-concern";
import { diffCalendarDays } from "@/lib/newsletter/dates";
import { suggestDisplayName, tidyZone } from "@/lib/newsletter/display-name";
import { stageForUnit, stageFromProjectStatus } from "@/lib/newsletter/stage";
import type { QuotationFigures } from "@/lib/newsletter/types";

/** A quotation with sensible blanks, so each test states only what it cares about. */
function quotation(overrides: Partial<QuotationFigures> = {}): QuotationFigures {
  return {
    quoteNumber: "00000",
    invoiceValue: 0,
    scopeOfWork: "Unit Extension",
    progress: 0,
    plannedStartDate: null,
    maxContractualDate: null,
    projectStatus: "In Progress",
    assignedPm: null,
    notes: null,
    ...overrides,
  };
}

const d = (iso: string) => new Date(`${iso}T00:00:00`);

// ── Real rows from the After Delivery Extra works tab ────────────────────────

/** Cyan 11 — the `CY-11 Newsletter` sample. */
const CY_11 = quotation({
  quoteNumber: "20411",
  invoiceValue: 1_940_879.63,
  scopeOfWork: "Unit Extension",
  progress: 1,
  plannedStartDate: d("2026-04-29"),
  maxContractualDate: d("2026-09-26"),
  projectStatus: "Completed",
  assignedPm: "Mariam Sobhy",
});

/** Phase 4 Villa 2B — the `Ph4-Villa-2B Newsletter` sample. */
const PH4_VILLA_2B = quotation({
  quoteNumber: "20408",
  invoiceValue: 9_391_861.96,
  scopeOfWork: "Unit Extension",
  progress: 0.9,
  plannedStartDate: d("2026-03-18"),
  maxContractualDate: d("2026-09-14"),
  projectStatus: "In Progress ", // the sheet really does carry a trailing space
  assignedPm: "Heba Kamal",
});

/** Ancient Hill 56 — three quotations, the `Photos Template` sample. */
const AH_56_SOG = quotation({
  quoteNumber: "20415",
  invoiceValue: 1_270_456.64,
  scopeOfWork: "SOG",
  progress: 0.4,
  plannedStartDate: d("2026-06-16"),
  maxContractualDate: d("2026-08-15"),
  projectStatus: "Hold",
  assignedPm: "Mariam Sobhy",
  notes: "Pending Client Scope",
});

const AH_56_LANDSCAPE = quotation({
  quoteNumber: "20423",
  invoiceValue: 154_030.98,
  scopeOfWork: "Landscape",
  progress: 0,
  plannedStartDate: d("2026-07-29"),
  maxContractualDate: d("2026-09-17"),
  projectStatus: "Hold",
  assignedPm: "Mariam Sobhy",
  notes: "Pending Client Scope",
});

const AH_56_PERGOLA = quotation({
  quoteNumber: "20431",
  invoiceValue: 250_914.36,
  scopeOfWork: "Pergola",
  progress: 0,
  plannedStartDate: d("2026-08-27"),
  maxContractualDate: d("2026-09-26"),
  projectStatus: "Not Started",
  assignedPm: "Mariam Sobhy",
});

describe("duration reproduces the supplied newsletters", () => {
  // The single strongest evidence that `Planned Start Date` and `Max
  // Contractual` are the right two columns: the day count between them equals
  // the Duration printed on all three samples, with no fudge factor.
  it.each([
    ["Cyan 11", CY_11, 150],
    ["Phase 4 Villa 2B", PH4_VILLA_2B, 180],
    ["Ancient Hill 56 (SOG only)", AH_56_SOG, 60],
  ])("%s shows %o → %i calendar days", (_label, q, expected) => {
    const figures = aggregateQuotations([q], d("2026-08-07"));
    expect(figures.durationDays).toBe(expected);
  });
});

describe("the Status pill reproduces the supplied newsletters", () => {
  // Fed the exact percentages printed on each sample card.
  it.each([
    ["Ancient Hill 56", 3, 0, "ON TRACK"],
    ["Cyan 11", 85, 48, "AHEAD"],
    ["Phase 4 Villa 2B", 90, 69, "AHEAD"],
  ])("%s: %i%% done against %i%% elapsed → %s", (_label, progress, expected, verdict) => {
    expect(verdictFor(progress, expected)).toBe(verdict);
  });

  it("treats the 5-point band as inclusive on both edges", () => {
    expect(verdictFor(55, 50)).toBe("ON TRACK");
    expect(verdictFor(45, 50)).toBe("ON TRACK");
    expect(verdictFor(55.1, 50)).toBe("AHEAD");
    expect(verdictFor(44.9, 50)).toBe("BEHIND");
  });
});

describe("combining several quotations into one unit newsletter", () => {
  const figures = aggregateQuotations([AH_56_SOG, AH_56_LANDSCAPE], d("2026-08-07"));

  it("lists every ticked quote number", () => {
    expect(figures.quoteReferences).toBe("20415, 20423");
  });

  it("adds the invoice values and rounds to whole LE", () => {
    // 1,270,456.64 + 154,030.98 = 1,424,487.62
    expect(figures.quotationAmount).toBe(1_424_488);
  });

  it("lists the distinct scopes as the project summary", () => {
    expect(figures.projectSummary).toBe("SOG, Landscape");
  });

  it("takes the earliest planned start and the latest contractual finish", () => {
    expect(figures.startDate).toEqual(d("2026-06-16"));
    expect(figures.finishDate).toEqual(d("2026-09-17"));
    expect(figures.durationDays).toBe(93);
  });

  it("weights progress by money, not by quotation count", () => {
    // A flat average of 40% and 0% would report 20%. Weighted by invoice value
    // the unit is 36% done, because the SOG quote carries 89% of the money.
    expect(figures.progressPercent).toBe(36);
  });

  it("measures elapsed time to the edition date, not to today", () => {
    expect(figures.elapsedDays).toBe(52); // 16 Jun → 7 Aug
    expect(figures.elapsedPercent).toBe(56);
    expect(figures.verdict).toBe("BEHIND");
  });

  it("changes its answer when the owner unticks a quotation", () => {
    const withPergola = aggregateQuotations(
      [AH_56_SOG, AH_56_LANDSCAPE, AH_56_PERGOLA],
      d("2026-08-07"),
    );
    expect(withPergola.quotationAmount).toBe(1_675_402);
    expect(withPergola.finishDate).toEqual(d("2026-09-26"));
    expect(withPergola.projectSummary).toBe("SOG, Landscape, Pergola");
  });
});

describe("aggregation edge cases", () => {
  it("returns empty figures when nothing is ticked", () => {
    const figures = aggregateQuotations([], d("2026-08-07"));
    expect(figures.quotationAmount).toBe(0);
    expect(figures.verdict).toBeNull();
    expect(figures.startDate).toBeNull();
  });

  it("never shows negative elapsed time for a unit that has not started", () => {
    // Ancient Hill 56's sample shows "00" — its start was still in the future.
    const figures = aggregateQuotations([AH_56_SOG], d("2026-06-14"));
    expect(figures.elapsedDays).toBe(0);
    expect(figures.elapsedPercent).toBe(0);
  });

  it("never shows more elapsed time than the duration for an overdue unit", () => {
    const figures = aggregateQuotations([AH_56_SOG], d("2027-01-01"));
    expect(figures.elapsedDays).toBe(60);
    expect(figures.elapsedPercent).toBe(100);
  });

  it("leaves the verdict empty when the sheet has no dates to judge against", () => {
    const figures = aggregateQuotations(
      [quotation({ invoiceValue: 500, progress: 0.5 })],
      d("2026-08-07"),
    );
    expect(figures.verdict).toBeNull();
    expect(figures.progressPercent).toBe(50);
  });

  it("names every project manager, the biggest share of the money first", () => {
    // Leaving a colleague off a page that covers their work is worse than a
    // slightly longer line.
    const figures = aggregateQuotations(
      [
        quotation({ invoiceValue: 100, assignedPm: "Omar Sherif" }),
        quotation({ invoiceValue: 9_000, assignedPm: "Mariam Sobhy" }),
      ],
      d("2026-08-07"),
    );
    expect(figures.projectManager).toBe("Mariam Sobhy, Omar Sherif");
  });

  it("names a shared PM only once", () => {
    const figures = aggregateQuotations(
      [
        quotation({ invoiceValue: 100, assignedPm: "Mariam Sobhy" }),
        quotation({ invoiceValue: 900, assignedPm: "Mariam Sobhy" }),
      ],
      d("2026-08-07"),
    );
    expect(figures.projectManager).toBe("Mariam Sobhy");
  });

  it("falls back to a flat average when the ticked quotations carry no value", () => {
    const figures = aggregateQuotations(
      [quotation({ progress: 0.2 }), quotation({ progress: 0.6 })],
      d("2026-08-07"),
    );
    expect(figures.progressPercent).toBe(40);
  });
});

describe("finished work says so", () => {
  const done = (status: string, progress = 1) =>
    quotation({
      invoiceValue: 1_000,
      progress,
      projectStatus: status,
      plannedStartDate: d("2026-01-01"),
      maxContractualDate: d("2026-03-01"),
    });

  it.each([["Completed"], ["Cancelled"], ["VOID"]])(
    "reads COMPLETED when every ticked quotation is %s",
    (status) => {
      // "ON TRACK" on a finished unit reads as work still under way.
      expect(aggregateQuotations([done(status)], d("2026-02-01")).verdict).toBe("COMPLETED");
      expect(aggregateQuotations([done(status)], d("2026-02-01")).isComplete).toBe(true);
    },
  );

  it("counts a quotation at 100% as finished even if the status column lags", () => {
    expect(aggregateQuotations([done("In Progress", 1)], d("2026-02-01")).verdict).toBe(
      "COMPLETED",
    );
  });

  it("still judges the schedule when ANY quotation is unfinished", () => {
    const figures = aggregateQuotations(
      [done("Completed"), done("In Progress", 0)],
      d("2026-02-01"),
    );
    expect(figures.isComplete).toBe(false);
    expect(figures.verdict).not.toBe("COMPLETED");
  });
});

describe("running past the finish date", () => {
  const late = quotation({
    invoiceValue: 1_000,
    progress: 0.5,
    projectStatus: "In Progress",
    plannedStartDate: d("2026-06-16"),
    maxContractualDate: d("2026-08-15"), // 60 days
  });

  it("reports no overrun while still inside the duration", () => {
    expect(aggregateQuotations([late], d("2026-07-16")).overrunDays).toBe(0);
  });

  it("counts the days past the finish date", () => {
    // 15 Aug → 30 Aug is 15 days over.
    const figures = aggregateQuotations([late], d("2026-08-30"));
    expect(figures.overrunDays).toBe(15);
    // Elapsed itself stays capped, so the ring is full rather than over-full.
    expect(figures.elapsedDays).toBe(60);
    expect(figures.elapsedPercent).toBe(100);
  });

  it("reports no overrun for a unit with no dates", () => {
    expect(
      aggregateQuotations([quotation({ invoiceValue: 10 })], d("2026-08-30")).overrunDays,
    ).toBe(0);
  });
});

describe("calendar-day arithmetic", () => {
  it("counts the span between two dates, not an inclusive tally", () => {
    expect(diffCalendarDays(d("2026-06-16"), d("2026-08-15"))).toBe(60);
  });

  it("survives a daylight-saving boundary", () => {
    // Egypt moves its clocks in late April; a naive millisecond division here
    // would return 29.958 days and round to the wrong duration.
    expect(diffCalendarDays(d("2026-04-15"), d("2026-05-15"))).toBe(30);
  });
});

describe("the stage track", () => {
  it.each([
    ["Not Started", "quotation"],
    ["Grace", "quotation"],
    ["In Progress ", "construction"],
    ["Hold", "construction"], // Ancient Hill 56 is on Hold and shows Construction
    ["Completed", "handover"],
    ["something nobody has typed before", "construction"],
  ])("%s lights up %s", (status, stage) => {
    expect(stageFromProjectStatus(status)).toBe(stage);
  });

  it("takes the furthest-along stage across a unit's quotations", () => {
    expect(stageForUnit(["Not Started", "In Progress"])).toBe("construction");
    expect(stageForUnit(["Completed", "In Progress"])).toBe("handover");
  });

  it("lets the owner's override win", () => {
    expect(stageForUnit(["Completed"], "design")).toBe("design");
  });
});

describe("the Area of Concern box", () => {
  it("turns a comma-separated note into separate bullets", () => {
    expect(
      areaOfConcernBullets([
        "Hold by client until further notice, Waiting Reply's on queries by client , Client Rep changed, New design is in progress",
      ]),
    ).toEqual([
      "Hold by client until further notice",
      "Waiting Reply's on queries by client",
      "Client Rep changed",
      "New design is in progress",
    ]);
  });

  it("does not repeat a note shared by several quotations", () => {
    // Ancient Hill 56's SOG and Landscape quotes both say this.
    expect(areaOfConcernBullets(["Pending Client Scope", "Pending Client Scope"])).toEqual([
      "Pending Client Scope",
    ]);
  });

  it("ignores blank notes", () => {
    expect(areaOfConcernBullets([null, undefined, "   ", ""])).toEqual([]);
  });
});

describe("suggested unit display names", () => {
  it.each([
    ["CY-11", "Cyan", "Cyan 11"],
    ["AH-56", "Ancient hill", "Ancient Hill 56"], // sloppy casing tidied for the client
    ["Ph4-Villa-2B", "Phases", "Phase 4 Villa 2B"],
    ["FD-23", "Fanadir", "Fanadir 23"],
    ["NS-04", "New Sabina", "New Sabina 04"],
  ])("%s in %s → %s", (code, zone, expected) => {
    expect(suggestDisplayName(code, zone)).toBe(expected);
  });

  it("tidies zone capitalisation without shouting minor words", () => {
    expect(tidyZone("Ancient hill")).toBe("Ancient Hill");
    expect(tidyZone("cyan the range")).toBe("Cyan the Range");
  });
});
