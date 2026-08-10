/**
 * Convert the browser-parsed workbook into the wire format the server action
 * validates.
 *
 * The only interesting part is the dates: they go across as "YYYY-MM-DD"
 * calendar strings via `toIsoDate`, never `toISOString()`, which would shift
 * every date back a day in Egypt's time zone (DECISIONS 0003).
 */

import type { ParsedSheet } from "@/lib/follow-up-sheet/parse";
import { toIsoDate } from "@/lib/newsletter/dates";
import type { ImportSheetInput, ImportedRow } from "./schema";

function isoOrNull(date: Date | null): string | null {
  return date ? toIsoDate(date) : null;
}

export function toImportedRows(parsed: ParsedSheet): ImportedRow[] {
  return parsed.accepted.map((row) => ({
    unitCode: row.unitCode,
    zone: row.zone,
    quoteNumber: row.quoteNumber,
    invoiceNumber: row.invoiceNumber,
    invoiceValue: row.invoiceValue,
    scopeOfWork: row.scopeOfWork,
    assignedPm: row.assignedPm,
    projectStatus: row.projectStatus,
    progress: row.progress,
    plannedStartDate: isoOrNull(row.plannedStartDate),
    maxContractualDate: isoOrNull(row.maxContractualDate),
    notes: row.notes,
    markedReadyInSheet: row.markedReadyInSheet,
    clientName: row.clientName,
  }));
}

export function toImportPayload(parsed: ParsedSheet, fileName: string): ImportSheetInput {
  return {
    fileName,
    sheetName: parsed.sheetName,
    delivery: "after_delivery",
    rows: toImportedRows(parsed),
    rejected: parsed.rejected,
    zoneAliases: parsed.zoneAliases,
  };
}
