/**
 * The three-layer design cascade.
 *
 * Original design → master for this layout → this unit's own changes. The promise
 * to the owner is that editing a master moves every newsletter, changing one unit
 * moves only that unit, and reset always works. If any of that is wrong the tool
 * quietly sends the wrong-looking page to a client, so it is pinned here.
 */

import { describe, expect, it } from "vitest";
import {
  BOX_HEIGHT_DEFAULTS,
  COLOUR_DEFAULTS,
  DEFAULT_THEME,
  FIELD_DEFAULTS,
  TEXT_DEFAULTS,
  boxRange,
  hasOwnDesign,
  leftColumnFits,
  resolveLeftColumn,
  resolveTheme,
  templateKindFor,
  textRange,
} from "@/lib/newsletter/theme";

describe("with nothing overridden", () => {
  it("returns the original design exactly", () => {
    const theme = resolveTheme();
    expect(theme.text).toEqual({ ...TEXT_DEFAULTS });
    expect(theme.fields).toEqual({ ...FIELD_DEFAULTS });
    expect(theme.boxes).toEqual({ ...BOX_HEIGHT_DEFAULTS });
    expect(theme.colours).toEqual({ ...COLOUR_DEFAULTS });
  });

  it("treats null and undefined the same as nothing — which is what reset means", () => {
    expect(resolveTheme(null, null)).toEqual(DEFAULT_THEME);
    expect(resolveTheme(undefined, undefined)).toEqual(DEFAULT_THEME);
    expect(resolveTheme({}, {})).toEqual(DEFAULT_THEME);
  });
});

describe("the master layer", () => {
  it("applies to a newsletter with no changes of its own", () => {
    const theme = resolveTheme({ text: { unitName: 26 } });
    expect(theme.text.unitName).toBe(26);
  });

  it("leaves everything it does not mention alone", () => {
    const theme = resolveTheme({ text: { unitName: 26 } });
    expect(theme.text.clientName).toBe(TEXT_DEFAULTS.clientName);
    expect(theme.colours.orange).toBe(COLOUR_DEFAULTS.orange);
  });

  it("can hide a line", () => {
    expect(resolveTheme({ fields: { projectSummary: false } }).fields.projectSummary).toBe(false);
    // …without hiding the others.
    expect(resolveTheme({ fields: { projectSummary: false } }).fields.clientName).toBe(true);
  });
});

describe("a unit's own changes", () => {
  it("win over the master", () => {
    const theme = resolveTheme({ text: { unitName: 26 } }, { text: { unitName: 18 } });
    expect(theme.text.unitName).toBe(18);
  });

  it("do not disturb the master's other values", () => {
    const master = { text: { unitName: 26, clientName: 16 } };
    const theme = resolveTheme(master, { text: { unitName: 18 } });
    expect(theme.text.unitName).toBe(18);
    expect(theme.text.clientName).toBe(16);
  });

  it("can turn a line back ON that the master hid", () => {
    const theme = resolveTheme(
      { fields: { clientName: false } },
      { fields: { clientName: true } },
    );
    expect(theme.fields.clientName).toBe(true);
  });

  it("are reported so a unit that differs can say so", () => {
    expect(hasOwnDesign(null)).toBe(false);
    expect(hasOwnDesign({})).toBe(false);
    expect(hasOwnDesign({ text: {} })).toBe(false);
    expect(hasOwnDesign({ text: { unitName: 18 } })).toBe(true);
    expect(hasOwnDesign({ fields: { clientName: false } })).toBe(true);
    expect(hasOwnDesign({ colours: { orange: "#123456" } })).toBe(true);
  });
});

describe("limits, so no setting can ruin a page", () => {
  const { min, max } = textRange();

  it("refuses a text size of zero or a negative one", () => {
    expect(resolveTheme({ text: { unitName: 0 } }).text.unitName).toBe(min);
    expect(resolveTheme({ text: { unitName: -40 } }).text.unitName).toBe(min);
  });

  it("refuses an absurdly large text size", () => {
    expect(resolveTheme({ text: { unitName: 500 } }).text.unitName).toBe(max);
  });

  it("falls back to the original when handed nonsense", () => {
    // Overrides arrive as stored JSON, so a corrupt value has to be survivable.
    const theme = resolveTheme({ text: { unitName: Number.NaN } });
    expect(theme.text.unitName).toBe(TEXT_DEFAULTS.unitName);
    expect(resolveTheme({ text: { unitName: Infinity } }).text.unitName).toBe(
      TEXT_DEFAULTS.unitName,
    );
  });

  it("keeps a box within half and roughly double its original height", () => {
    const range = boxRange("infoBox");
    expect(resolveTheme({ boxes: { infoBox: 1 } }).boxes.infoBox).toBe(range.min);
    expect(resolveTheme({ boxes: { infoBox: 9999 } }).boxes.infoBox).toBe(range.max);
    expect(range.min).toBeLessThan(BOX_HEIGHT_DEFAULTS.infoBox);
    expect(range.max).toBeGreaterThan(BOX_HEIGHT_DEFAULTS.infoBox);
  });

  it("never lets a box grow past the page", () => {
    for (const key of Object.keys(BOX_HEIGHT_DEFAULTS) as (keyof typeof BOX_HEIGHT_DEFAULTS)[]) {
      expect(boxRange(key).max).toBeLessThanOrEqual(696);
    }
  });

  it("accepts a proper hex colour and ignores anything else", () => {
    expect(resolveTheme({ colours: { orange: "#12ab56" } }).colours.orange).toBe("#12AB56");
    for (const bad of ["red", "#12345", "#1234567", "", "rgb(1,2,3)", "  "]) {
      expect(resolveTheme({ colours: { orange: bad } }).colours.orange).toBe(
        COLOUR_DEFAULTS.orange,
      );
    }
  });

  it("keeps a non-boolean visibility at its original", () => {
    const theme = resolveTheme({
      // A corrupted stored value.
      fields: { clientName: "yes" as unknown as boolean },
    });
    expect(theme.fields.clientName).toBe(FIELD_DEFAULTS.clientName);
  });
});

describe("the left column, stacked from the box heights", () => {
  it("reproduces the original design exactly when nothing is overridden", () => {
    // The single most important property of this refactor: making the heights
    // adjustable must not move anything by so much as a pixel by default.
    const column = resolveLeftColumn(DEFAULT_THEME);
    expect(column.unitHeader).toEqual({ y: 30, height: 66 });
    expect(column.infoBox).toEqual({ y: 122, height: 84 });
    expect(column.amountBox).toEqual({ y: 250, height: 50 });
    expect(column.cardRow.y).toBe(324);
    expect(column.statusRow.y).toBe(404);
    expect(column.concern).toEqual({ y: 324, height: 152 });
    expect(column.metricsRow).toEqual({ y: 492, height: 156 });
  });

  it("pushes everything below a box down when that box grows", () => {
    // 100 is as tall as the info box can go before the column runs out of room.
    const taller = resolveLeftColumn(resolveTheme({ boxes: { infoBox: 100 } }));
    const original = resolveLeftColumn(DEFAULT_THEME);
    const grewBy = 100 - original.infoBox.height;

    expect(taller.infoBox.y).toBe(original.infoBox.y); // itself does not move
    expect(taller.amountBox.y).toBe(original.amountBox.y + grewBy);
    expect(taller.cardRow.y).toBe(original.cardRow.y + grewBy);
    expect(taller.statusRow.y).toBe(original.statusRow.y + grewBy);
    expect(taller.metricsRow.y).toBe(original.metricsRow.y + grewBy);
  });

  it("never lets two boxes overlap, whatever the heights", () => {
    const column = resolveLeftColumn(
      resolveTheme({
        boxes: { unitHeader: 120, infoBox: 140, amountBox: 90, concern: 40, metricsRow: 200 },
      }),
    );
    const stacked = [column.unitHeader, column.infoBox, column.amountBox];
    for (let i = 1; i < stacked.length; i++) {
      expect(stacked[i].y).toBeGreaterThanOrEqual(stacked[i - 1].y + stacked[i - 1].height);
    }
    expect(column.cardRow.y).toBeGreaterThanOrEqual(column.amountBox.y + column.amountBox.height);
    expect(column.statusRow.y).toBeGreaterThanOrEqual(column.cardRow.y + column.cardRow.height);
    // The metrics row clears BOTH the status row and Area of Concern beside it.
    expect(column.metricsRow.y).toBeGreaterThanOrEqual(
      column.statusRow.y + column.statusRow.height,
    );
    expect(column.metricsRow.y).toBeGreaterThanOrEqual(column.concern.y + column.concern.height);
  });

  it("follows Area of Concern down when it is the taller of the pair", () => {
    const column = resolveLeftColumn(resolveTheme({ boxes: { concern: 300 } }));
    expect(column.metricsRow.y).toBeGreaterThan(resolveLeftColumn(DEFAULT_THEME).metricsRow.y);
    expect(column.metricsRow.y).toBeGreaterThanOrEqual(column.concern.y + column.concern.height);
  });

  it("keeps the column clear of the footer even at the largest allowed heights", () => {
    // The worst case the editor can produce: every height at its own maximum.
    // Individually legal, together they stack far past the page — so the column
    // shrinks them together rather than letting the page break.
    const maxed = resolveTheme({
      boxes: Object.fromEntries(
        (Object.keys(BOX_HEIGHT_DEFAULTS) as (keyof typeof BOX_HEIGHT_DEFAULTS)[]).map((key) => [
          key,
          boxRange(key).max,
        ]),
      ),
    });
    const column = resolveLeftColumn(maxed);
    // Inside the page, clear of the footer bar at y=670.
    expect(column.bottom).toBeLessThanOrEqual(664);
    expect(column.metricsRow.y + column.metricsRow.height).toBeLessThan(670);
    // And the owner is told, rather than left wondering why a box came out small.
    expect(leftColumnFits(maxed)).toBe(false);
  });

  it("says so when the requested heights do fit", () => {
    expect(leftColumnFits(DEFAULT_THEME)).toBe(true);
    // The column already ends 22px above the footer, so this is the room there is.
    expect(leftColumnFits(resolveTheme({ boxes: { infoBox: 100 } }))).toBe(true);
    expect(leftColumnFits(resolveTheme({ boxes: { infoBox: 200 } }))).toBe(false);
  });

  it("honours a height exactly when it fits, without shrinking it", () => {
    const column = resolveLeftColumn(resolveTheme({ boxes: { infoBox: 100 } }));
    expect(column.infoBox.height).toBe(100);
  });

  it("lets one box grow when another gives up the room", () => {
    // The honest way to make a box bigger on a page that is already full.
    const theme = resolveTheme({ boxes: { infoBox: 124, metricsRow: 116 } });
    const column = resolveLeftColumn(theme);
    expect(leftColumnFits(theme)).toBe(true);
    expect(column.infoBox.height).toBe(124);
    expect(column.metricsRow.height).toBe(116);
  });
});

describe("choosing which master applies", () => {
  it("uses Timeline when the ticked quotations have a schedule", () => {
    expect(templateKindFor({ hasSchedule: true })).toBe("timeline");
  });

  it("uses Photos only when they do not", () => {
    expect(templateKindFor({ hasSchedule: false })).toBe("photos");
  });

  it("uses Before Delivery whatever the schedule says", () => {
    expect(templateKindFor({ hasSchedule: true, delivery: "before_delivery" })).toBe(
      "before_delivery",
    );
    expect(templateKindFor({ hasSchedule: false, delivery: "before_delivery" })).toBe(
      "before_delivery",
    );
  });
});
