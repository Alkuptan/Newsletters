/**
 * A newsletter edition: one dated cycle covering many units.
 *
 * The footer label is free text on purpose — the owner chose to decide "Weekly"
 * or "Bi-Weekly" per edition rather than have the tool impose a rhythm
 * (docs/SPEC.md).
 */

import { z } from "zod";
import type { Enums } from "@/lib/supabase/database.types";

export const EDITION_STATUSES = [
  "draft",
  "exported",
  "archived",
] as const satisfies readonly Enums<"edition_status">[];
export const editionStatusSchema = z.enum(EDITION_STATUSES);
export type EditionStatus = (typeof EDITION_STATUSES)[number];

const footerLabelField = z
  .string()
  .trim()
  .min(1, "The footer needs some wording, e.g. “Bi-Weekly Newsletter”.")
  .max(120, "That footer wording is too long — 120 characters at most.");

const footerDateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the date to print in the footer.");

export const createEditionSchema = z.object({
  footerLabel: footerLabelField,
  footerDate: footerDateField,
});
export type CreateEditionInput = z.infer<typeof createEditionSchema>;

export const updateEditionSchema = z.object({
  id: z.guid(),
  footerLabel: footerLabelField.optional(),
  footerDate: footerDateField.optional(),
  status: editionStatusSchema.optional(),
});
export type UpdateEditionInput = z.infer<typeof updateEditionSchema>;
