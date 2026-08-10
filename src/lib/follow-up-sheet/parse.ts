/**
 * Read the follow-up sheet.
 *
 * Deliberately framework-free and I/O-free: hand it the bytes of
 * "Follow-up sheet (Don't Delete).xlsm" and it hands back clean rows. That lets
 * the upload page run it in the BROWSER, so the 1.5 MB workbook never crosses
 * the wire and the Cloudflare Worker never parses a spreadsheet — only clean
 * JSON rows reach the server action.
 *
 * Two facts about the real file that this module exists to absorb:
 *
 *   1. The header row is row TWO, not row one. Row one holds the tab's title.
 *   2. Several headers carry trailing spaces ("Progress % Current ", "Value of
 *      Agreement ") and the zone column is inconsistently capitalised
 *      ("Ancient Hill" and "Ancient hill" are the same place).
 */

import * as XLSX from "xlsx";
import { startOfLocalDay, toIsoDate } from "@/lib/newsletter/dates";

/** The tab holding the quotations this tool reports on. */
export const AFTER_DELIVERY_SHEET = "After Delivery Extra works";

/** The Before Delivery tab — read in a later version, see docs/SPEC.md. */
export const BEFORE_DELIVERY_SHEET = "Before Delivery Extra works";

/** The header row's position, 1-based as Excel shows it. */
const HEADER_ROW = 2;

/** One usable quotation from the sheet. */
export interface FollowUpRow {
  /** The zone exactly as the sheet spells it. */
  zone: string;
  /** Case-folded zone, so "Ancient Hill" and "Ancient hill" are one zone. */
  zoneKey: string;
  unitCode: string;
  quoteNumber: string;
  invoiceNumber: string | null;
  invoiceValue: number;
  scopeOfWork: string;
  assignedPm: string | null;
  projectStatus: string;
  plannedStartDate: Date | null;
  maxContractualDate: Date | null;
  /** `Progress % Current` as a fraction 0–1, exactly as the sheet stores it. */
  progress: number;
  notes: string | null;
  /** True when the sheet's `Newsletter` column says "Ready". */
  markedReadyInSheet: boolean;
  /** From the `Client Name` column the owner is adding to the Power Query. */
  clientName: string | null;
}

/** A row the tool could not use, with a reason the owner can act on. */
export interface RejectedRow {
  /** 1-based row number as Excel shows it, so the owner can go and look. */
  excelRow: number;
  reason: string;
}

/** A zone spelled more than one way in the same upload. */
export interface ZoneAlias {
  zoneKey: string;
  spellings: string[];
}

export interface ParsedSheet {
  sheetName: string;
  /** Data rows found below the header, including the ones rejected. */
  rowsRead: number;
  accepted: FollowUpRow[];
  rejected: RejectedRow[];
  /** Near-duplicate zone spellings for the owner to confirm on upload. */
  zoneAliases: ZoneAlias[];
}

/** Case-fold and collapse whitespace, for matching headers and zones. */
function fold(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function asText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return toIsoDate(value);
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = asText(value);
  if (text === null) return null;
  // Excel exports sometimes carry thousands separators when a cell is text.
  const cleaned = Number(text.replace(/,/g, ""));
  return Number.isFinite(cleaned) ? cleaned : null;
}

/**
 * A whole calendar day, in local terms.
 *
 * SheetJS hands back local midnight for a date cell, so local getters see the
 * day Excel shows. Anything with a stray time component is flattened.
 */
function asDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : startOfLocalDay(value);
  }
  const text = asText(value);
  if (text === null) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : startOfLocalDay(parsed);
}

/**
 * `Progress % Current` as a fraction.
 *
 * The sheet stores 0.9 for 90%. A value above 1 means somebody typed "90"
 * instead, so treat it as a percentage rather than reporting 9000% done.
 */
function asProgressFraction(value: unknown): number {
  const raw = asNumber(value);
  if (raw === null) return 0;
  const fraction = raw > 1 ? raw / 100 : raw;
  return Math.min(1, Math.max(0, fraction));
}

/**
 * Map each wanted column to the header the sheet actually uses.
 *
 * Matching is case- and whitespace-insensitive so a trailing space in
 * "Progress % Current " cannot silently blank out every progress figure.
 */
function resolveHeaders(headers: readonly string[]): Map<string, string> {
  const byFolded = new Map<string, string>();
  for (const header of headers) {
    byFolded.set(fold(header), header);
  }
  return byFolded;
}

function cell(row: Record<string, unknown>, headers: Map<string, string>, wanted: string): unknown {
  const actual = headers.get(fold(wanted));
  return actual === undefined ? undefined : row[actual];
}

/** Zone spellings that differ only by case or spacing. */
function findZoneAliases(rows: readonly FollowUpRow[]): ZoneAlias[] {
  const spellingsByKey = new Map<string, Set<string>>();
  for (const row of rows) {
    const set = spellingsByKey.get(row.zoneKey) ?? new Set<string>();
    set.add(row.zone);
    spellingsByKey.set(row.zoneKey, set);
  }
  return [...spellingsByKey.entries()]
    .filter(([, spellings]) => spellings.size > 1)
    .map(([zoneKey, spellings]) => ({ zoneKey, spellings: [...spellings].sort() }));
}

/**
 * Parse the After Delivery tab of the follow-up sheet.
 *
 * @param bytes the uploaded workbook
 * @param sheetName which tab to read; defaults to After Delivery
 */
export function parseFollowUpSheet(
  bytes: ArrayBuffer | Uint8Array,
  sheetName: string = AFTER_DELIVERY_SHEET,
): ParsedSheet {
  const workbook = XLSX.read(bytes, { type: "array", cellDates: true });
  const worksheet = workbook.Sheets[sheetName];

  if (!worksheet) {
    const available = workbook.SheetNames.join(", ");
    throw new Error(
      `This workbook has no tab called "${sheetName}". It contains: ${available}.`,
    );
  }

  // range: HEADER_ROW - 1 makes SheetJS treat row 2 as the header row and key
  // every object by those names.
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    range: HEADER_ROW - 1,
    defval: null,
    blankrows: false,
  });

  const headerRow = XLSX.utils.sheet_to_json<string[]>(worksheet, {
    header: 1,
    range: HEADER_ROW - 1,
    blankrows: false,
  })[0];
  const headers = resolveHeaders((headerRow ?? []).filter((h): h is string => typeof h === "string"));

  if (!headers.has(fold("Unit")) || !headers.has(fold("Quote #"))) {
    throw new Error(
      `The "${sheetName}" tab does not look like the follow-up sheet — it has no Unit or Quote # column on row ${HEADER_ROW}.`,
    );
  }

  const accepted: FollowUpRow[] = [];
  const rejected: RejectedRow[] = [];

  raw.forEach((row, index) => {
    // +1 for the header itself, +1 because Excel counts from one.
    const excelRow = HEADER_ROW + index + 1;

    const unitCode = asText(cell(row, headers, "Unit"));
    const quoteNumber = asText(cell(row, headers, "Quote #"));

    // A row with neither is the blank tail of the query output, not a mistake.
    if (unitCode === null && quoteNumber === null) return;

    if (unitCode === null) {
      rejected.push({ excelRow, reason: "No unit code, so there is nothing to report on." });
      return;
    }
    if (quoteNumber === null) {
      rejected.push({
        excelRow,
        reason: `Unit ${unitCode} has no quote number, so its value cannot be counted.`,
      });
      return;
    }

    const zone = asText(cell(row, headers, "Zone")) ?? "";

    accepted.push({
      zone,
      zoneKey: fold(zone),
      unitCode,
      quoteNumber,
      invoiceNumber: asText(cell(row, headers, "Invoice #")),
      invoiceValue: asNumber(cell(row, headers, "Value Of Invoice")) ?? 0,
      scopeOfWork: asText(cell(row, headers, "Scope of work")) ?? "",
      assignedPm: asText(cell(row, headers, "Assigned PM")),
      projectStatus: asText(cell(row, headers, "Project Status")) ?? "",
      plannedStartDate: asDate(cell(row, headers, "Planned Start Date")),
      maxContractualDate: asDate(cell(row, headers, "Max Contractual")),
      progress: asProgressFraction(cell(row, headers, "Progress % Current")),
      notes: asText(cell(row, headers, "Notes")),
      markedReadyInSheet: fold(asText(cell(row, headers, "Newsletter")) ?? "") === "ready",
      clientName: asText(cell(row, headers, "Client Name")),
    });
  });

  return {
    sheetName,
    rowsRead: accepted.length + rejected.length,
    accepted,
    rejected,
    zoneAliases: findZoneAliases(accepted),
  };
}

/** Group parsed rows by unit, so each unit becomes one newsletter. */
export function groupByUnit(rows: readonly FollowUpRow[]): Map<string, FollowUpRow[]> {
  const byUnit = new Map<string, FollowUpRow[]>();
  for (const row of rows) {
    const key = fold(row.unitCode);
    const existing = byUnit.get(key);
    if (existing) existing.push(row);
    else byUnit.set(key, [row]);
  }
  return byUnit;
}
