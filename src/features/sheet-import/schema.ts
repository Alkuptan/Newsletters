/**
 * The wire format between the browser (which parses the workbook) and the
 * server action (which stores it).
 *
 * The `.xlsm` is parsed in the browser so the 1.5 MB file never crosses the wire
 * and the Worker never parses a spreadsheet. What crosses is this: clean,
 * validated JSON rows. Dates travel as `YYYY-MM-DD` calendar dates, never
 * timestamps — the whole tool depends on them staying on the day Excel shows
 * (DECISIONS 0003).
 */

import { z } from "zod";
import type { Enums } from "@/lib/supabase/database.types";

export const DELIVERY_KINDS = [
  "after_delivery",
  "before_delivery",
] as const satisfies readonly Enums<"delivery_kind">[];

export const deliveryKindSchema = z.enum(DELIVERY_KINDS);
export type DeliveryKind = (typeof DELIVERY_KINDS)[number];

/** A calendar date with no time zone, e.g. "2026-06-16". */
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must look like 2026-06-16.")
  .nullable();

/** Trim, and treat an empty cell as absent rather than as an empty string. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => (value === "" ? null : value));

/**
 * One quotation row as parsed from the sheet.
 *
 * Field limits match the CHECK constraints in migration 0006: Zod produces the
 * friendly message, the constraint is the backstop.
 */
export const importedRowSchema = z.object({
  unitCode: z.string().trim().min(1, "A row with no unit code cannot be used.").max(100),
  zone: z.string().trim().max(200).default(""),
  quoteNumber: z.string().trim().min(1, "A row with no quote number cannot be used.").max(100),
  invoiceNumber: optionalText(100),
  // Money. Negative would mean a credit note, which this report has no place
  // for; the sheet has never contained one.
  invoiceValue: z.number().finite().min(0).default(0),
  scopeOfWork: z.string().trim().max(500).default(""),
  assignedPm: optionalText(200),
  projectStatus: z.string().trim().max(200).default(""),
  // The sheet's own 0–1 fraction, not a percentage.
  progress: z.number().finite().min(0).max(1).default(0),
  plannedStartDate: calendarDate,
  maxContractualDate: calendarDate,
  notes: optionalText(4000),
  markedReadyInSheet: z.boolean().default(false),
  clientName: optionalText(300),
  // Several addresses in one cell, so this is longer than a single address.
  clientEmails: optionalText(2000),
});
export type ImportedRow = z.infer<typeof importedRowSchema>;

/** A row the browser could not use, carried through so the owner sees why. */
export const rejectedRowSchema = z.object({
  excelRow: z.number().int().positive(),
  reason: z.string().trim().min(1).max(500),
});
export type RejectedRow = z.infer<typeof rejectedRowSchema>;

/** A zone spelled more than one way in the same upload. */
export const zoneAliasSchema = z.object({
  zoneKey: z.string(),
  spellings: z.array(z.string()).min(2),
});

/**
 * The whole upload.
 *
 * The row cap is a deliberate safety valve rather than a guess: the real sheet
 * carries 645 After Delivery rows today, so 20,000 leaves enormous headroom
 * while still refusing a runaway payload.
 */
export const importSheetSchema = z.object({
  fileName: z.string().trim().min(1).max(400),
  sheetName: z.string().trim().min(1).max(200),
  delivery: deliveryKindSchema.default("after_delivery"),
  rows: z.array(importedRowSchema).min(1, "That sheet had no usable rows.").max(20_000),
  rejected: z.array(rejectedRowSchema).max(20_000).default([]),
  zoneAliases: z.array(zoneAliasSchema).max(500).default([]),
});
export type ImportSheetInput = z.infer<typeof importSheetSchema>;

/** What the upload screen reports back when it is done. */
export interface ImportSummary {
  uploadId: string;
  unitsCreated: number;
  unitsUpdated: number;
  quotationsCreated: number;
  quotationsUpdated: number;
  rowsRejected: number;
  /** Quotations that have disappeared from the sheet since the last upload. */
  quotationsMissing: number;
}
