/**
 * Parses the REAL follow-up sheet in `Sample/`, not a fixture.
 *
 * The point of these tests is that the tool keeps working when the owner
 * refreshes the Power Query: if a column gets renamed, a tab disappears or the
 * header row moves, this fails loudly instead of producing blank newsletters.
 *
 * Two consequences of testing against live business data, both deliberate:
 *
 * 1. **The suite skips when the workbook is absent.** `Sample/` is gitignored —
 *    it holds every unit's contract value — so a clone (and therefore GitHub
 *    Actions) does not have it. Skipping keeps CI honest: it reports "skipped",
 *    not a false pass and not a failure nobody can fix.
 * 2. **Rows are found by unit code and scope, never by quote number, and no
 *    money is asserted.** A quotation reference and a contract value are the
 *    owner's commercial data, and this file is public. They also prove nothing
 *    that "the column was read and parsed" does not prove on its own.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AFTER_DELIVERY_SHEET, groupByUnit, parseFollowUpSheet } from "@/lib/follow-up-sheet/parse";
import { toIsoDate } from "@/lib/newsletter/dates";

const WORKBOOK = path.join(process.cwd(), "Sample", "Follow-up sheet (Don't Delete).xlsm");
const present = existsSync(WORKBOOK);

/* Skipped rather than failed when the sheet is not on this machine. */
const withSheet = describe.skipIf(!present);

const bytes = present ? new Uint8Array(readFileSync(WORKBOOK)) : new Uint8Array();
const parsed = present ? parseFollowUpSheet(bytes) : null;

/** One quotation, identified the way a person would point at it. */
function row(unitCode: string, scope: string) {
  return parsed!.accepted.find((r) => r.unitCode === unitCode && r.scopeOfWork === scope);
}

withSheet("reading the After Delivery tab", () => {
  it("finds the quotations below the row-2 header", () => {
    expect(parsed!.sheetName).toBe(AFTER_DELIVERY_SHEET);
    expect(parsed!.accepted.length).toBe(645);
    expect(parsed!.rejected).toEqual([]);
  });

  it("reads a known row exactly", () => {
    const cy11 = row("CY-11", "Unit Extension");
    expect(cy11).toBeDefined();
    expect(cy11).toMatchObject({
      zone: "Cyan",
      unitCode: "CY-11",
      scopeOfWork: "Unit Extension",
      projectStatus: "Completed",
      progress: 1,
    });

    // The value column is read and typed, but the figure itself is the owner's
    // commercial data and is not written down here.
    expect(typeof cy11!.invoiceValue).toBe("number");
    expect(cy11!.invoiceValue).toBeGreaterThan(0);

    // A quote number is read for every row, but which one is not asserted.
    expect(cy11!.quoteNumber).toMatch(/^\d+$/);

    // The PM's real name is not asserted either: what matters is that the
    // column is read and trimmed, not who is in it.
    expect(cy11!.assignedPm).toMatch(/^\S(.*\S)?$/);

    // toIsoDate, never toISOString: Egypt is ahead of UTC, so toISOString
    // would report 28 April for a cell Excel shows as 29 April.
    expect(toIsoDate(cy11!.plannedStartDate!)).toBe("2026-04-29");
    expect(toIsoDate(cy11!.maxContractualDate!)).toBe("2026-09-26");
  });

  it("keeps sheet dates on the calendar day Excel shows", () => {
    // The whole tool's duration arithmetic rests on this.
    const ah56Sog = row("AH-56", "SOG");
    expect(toIsoDate(ah56Sog!.plannedStartDate!)).toBe("2026-06-16");
    expect(toIsoDate(ah56Sog!.maxContractualDate!)).toBe("2026-08-15");
  });

  it('survives the trailing space in "Progress % Current "', () => {
    // A header-matching bug here would silently report every unit as 0% done,
    // which is the kind of failure nobody notices until a client does.
    const ph4 = row("Ph4-Villa-2B", "Unit Extension");
    expect(ph4?.progress).toBe(0.9);
  });

  it("reads the sheet's own Newsletter flag", () => {
    const ready = parsed!.accepted.filter((r) => r.markedReadyInSheet);
    expect(ready.length).toBe(3);
  });

  it("leaves Client Name blank until the owner adds it to the query", () => {
    // Documents today's reality. When the column arrives this assertion is the
    // one that has to change, which is exactly the reminder we want.
    expect(parsed!.accepted.every((r) => r.clientName === null)).toBe(true);
  });
});

withSheet("zone tidying", () => {
  it("treats differently-cased spellings as one zone", () => {
    const keys = new Set(parsed!.accepted.map((r) => r.zoneKey));
    const rawSpellings = new Set(parsed!.accepted.map((r) => r.zone));
    expect(keys.size).toBeLessThan(rawSpellings.size);
  });

  it("reports the near-duplicates for the owner to confirm", () => {
    const ancientHill = parsed!.zoneAliases.find((a) => a.zoneKey === "ancient hill");
    expect(ancientHill?.spellings).toEqual(["Ancient Hill", "Ancient hill"]);
  });
});

withSheet("grouping quotations into units", () => {
  it("puts a unit's several quotations together", () => {
    const units = groupByUnit(parsed!.accepted);
    const ah56 = units.get("ah-56");
    expect(ah56).toBeDefined();
    // Three separate scopes on one unit — the case the newsletter has to combine.
    expect(ah56?.map((q) => q.scopeOfWork).sort()).toEqual(["Landscape", "Pergola", "SOG"]);
  });

  it("produces fewer units than quotations", () => {
    const units = groupByUnit(parsed!.accepted);
    expect(units.size).toBeGreaterThan(0);
    expect(units.size).toBeLessThan(parsed!.accepted.length);
  });
});

withSheet("refusing the wrong file", () => {
  it("names the tabs it did find when the wanted one is missing", () => {
    expect(() => parseFollowUpSheet(bytes, "Nope")).toThrow(/no tab called "Nope"/);
  });

  it("refuses a tab that is not the follow-up sheet", () => {
    // "AD" is a pivot dashboard, not the query output.
    expect(() => parseFollowUpSheet(bytes, "AD")).toThrow(/does not look like the follow-up sheet/);
  });
});
