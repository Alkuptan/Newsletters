/**
 * Freezing a newsletter as it was sent.
 *
 * The promise: reopening an old cycle shows what the client received, not what the
 * sheet says today. That only holds if a snapshot survives the round trip through
 * JSON exactly — and the dates are the part that breaks, because the obvious way
 * to serialise a Date shifts it a day in Egypt's time zone.
 */

import { describe, expect, it } from "vitest";
import { toIsoDate } from "@/lib/newsletter/dates";
import { DEFAULT_THEME, resolveTheme } from "@/lib/newsletter/theme";
import { deserialiseNewsletter, serialiseNewsletter } from "@/lib/newsletter/snapshot";
import { buildNewsletterView } from "@/lib/newsletter/view-model";
import type { QuotationFigures } from "@/lib/newsletter/types";

const d = (iso: string) => {
  const [y, m, day] = iso.split("-").map(Number);
  return new Date(y, m - 1, day);
};

const QUOTE: QuotationFigures = {
  quoteNumber: "20415",
  invoiceValue: 1_270_456.64,
  scopeOfWork: "SOG",
  progress: 0.4,
  plannedStartDate: d("2026-06-16"),
  maxContractualDate: d("2026-08-15"),
  projectStatus: "Hold",
  assignedPm: "Mariam Sobhy",
  notes: "Pending Client Scope",
};

const VIEW = buildNewsletterView({
  unit: { displayName: "Ancient Hill 56", clientName: "Mr. Adel Fahmy Girgis" },
  quotations: [QUOTE],
  ganttRows: [
    {
      label: "SOG",
      activities: [
        { name: "Mobilization", start: d("2026-06-16"), finish: d("2026-07-05"), tone: "normal" },
        {
          name: "Slab on Grade",
          start: d("2026-07-29"),
          finish: d("2026-08-15"),
          tone: "attention",
        },
      ],
    },
  ],
  photos: [{ url: "/photo/abc", description: "Site overview" }],
  footerLabel: "Bi-Weekly Newsletter",
  footerDate: d("2026-08-07"),
});

/** Exactly what the database does to a snapshot. */
const roundTrip = (value: unknown) => JSON.parse(JSON.stringify(value));

describe("a snapshot survives the trip through the database", () => {
  const restored = deserialiseNewsletter(roundTrip(serialiseNewsletter(VIEW, DEFAULT_THEME)));

  it("comes back at all", () => {
    expect(restored).not.toBeNull();
  });

  it("keeps every figure", () => {
    expect(restored!.view.quotationAmount).toBe(VIEW.quotationAmount);
    expect(restored!.view.progressPercent).toBe(VIEW.progressPercent);
    expect(restored!.view.elapsedDays).toBe(VIEW.elapsedDays);
    expect(restored!.view.durationDays).toBe(VIEW.durationDays);
    expect(restored!.view.verdict).toBe(VIEW.verdict);
    expect(restored!.view.quoteReferences).toBe(VIEW.quoteReferences);
  });

  it("keeps every date on the SAME calendar day", () => {
    // The whole reason this module exists. JSON.stringify on a Date would put
    // these a day earlier.
    expect(toIsoDate(restored!.view.startDate!)).toBe("2026-06-16");
    expect(toIsoDate(restored!.view.finishDate!)).toBe("2026-08-15");
    expect(toIsoDate(restored!.view.footerDate)).toBe("2026-08-07");
  });

  it("keeps the Gantt bars, their dates and their colour", () => {
    const bars = restored!.view.ganttRows[0].activities;
    expect(restored!.view.ganttRows[0].label).toBe("SOG");
    expect(bars).toHaveLength(2);
    expect(toIsoDate(bars[0].start)).toBe("2026-06-16");
    expect(toIsoDate(bars[1].finish)).toBe("2026-08-15");
    expect(bars[1].tone).toBe("attention");
  });

  it("keeps the text and the photos", () => {
    expect(restored!.view.displayName).toBe("Ancient Hill 56");
    expect(restored!.view.clientName).toBe("Mr. Adel Fahmy Girgis");
    expect(restored!.view.concerns).toEqual(VIEW.concerns);
    expect(restored!.view.photos).toEqual(VIEW.photos);
  });

  it("keeps the design the newsletter was sent with", () => {
    const custom = resolveTheme({ text: { unitName: 30 }, colours: { orange: "#1F7A4D" } });
    const back = deserialiseNewsletter(roundTrip(serialiseNewsletter(VIEW, custom)));
    expect(back!.theme.text.unitName).toBe(30);
    expect(back!.theme.colours.orange).toBe("#1F7A4D");
  });
});

describe("refusing to half-render something broken", () => {
  it.each([
    ["nothing", null],
    ["a string", "not a snapshot"],
    ["an empty object", {}],
    ["a future version", { version: 2, view: {}, theme: DEFAULT_THEME }],
    ["a missing theme", { version: 1, view: {} }],
  ])("returns nothing for %s", (_label, value) => {
    expect(deserialiseNewsletter(value)).toBeNull();
  });

  it("returns nothing when the footer date is unreadable", () => {
    const broken = serialiseNewsletter(VIEW, DEFAULT_THEME);
    broken.view.footerDate = "not-a-date";
    expect(deserialiseNewsletter(roundTrip(broken))).toBeNull();
  });

  it("drops a Gantt bar whose dates are unreadable rather than mis-drawing it", () => {
    const broken = serialiseNewsletter(VIEW, DEFAULT_THEME);
    broken.view.ganttRows[0].activities[0].start = "garbage";
    const back = deserialiseNewsletter(roundTrip(broken));
    expect(back!.view.ganttRows[0].activities).toHaveLength(1);
    expect(back!.view.ganttRows[0].activities[0].name).toBe("Slab on Grade");
  });
});
