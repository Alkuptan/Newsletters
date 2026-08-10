/**
 * Schemas for changing a unit. The forms, the actions and the tests all import
 * these, so the browser and the server can never disagree about what is valid.
 */

import { z } from "zod";
import type { Enums } from "@/lib/supabase/database.types";
import { STAGES } from "@/lib/newsletter/types";
import { CLIENT_TITLES } from "@/lib/newsletter/clients";

// `satisfies` fails the build if a stage here is unknown to Postgres.
export const PROJECT_STAGES = STAGES satisfies readonly Enums<"project_stage">[];
export const projectStageSchema = z.enum(PROJECT_STAGES);

/** Limits match the CHECK constraints in migration 0006. */
const displayNameField = z
  .string()
  .trim()
  .min(1, "The unit needs a name for the newsletter's header.")
  .max(200, "That name is too long for the header — 200 characters at most.");

const clientNameField = z
  .string()
  .trim()
  .max(300, "That client name is too long — 300 characters at most.");

const onedriveUrlField = z
  .string()
  .trim()
  .max(2000, "That link is too long.")
  .refine(
    (value) => value === "" || /^https?:\/\//i.test(value),
    "A photo folder link should start with https://",
  );

/**
 * The owner's choices about a unit's clients.
 *
 * Keyed by client name rather than by position, so refreshing the sheet — which
 * may reorder or re-case the names — cannot revert a curated page. See
 * `src/lib/newsletter/clients.ts`.
 */
export const setUnitClientsSchema = z.object({
  id: z.guid(),
  /** Client name -> title. A name absent here simply has no title. */
  titles: z.record(z.string().trim().min(1).max(300), z.enum(CLIENT_TITLES)).default({}),
  /**
   * The names to print. An empty array is a real decision ("name none of
   * them"); `null` puts the unit back to showing every client.
   */
  shown: z.array(z.string().trim().min(1).max(300)).max(20).nullable(),
});
export type SetUnitClientsInput = z.infer<typeof setUnitClientsSchema>;

/** Editing the details the owner types once per unit. */
export const updateUnitSchema = z.object({
  id: z.guid(),
  // Absent means "leave unchanged"; an explicit empty string clears the column.
  displayName: displayNameField.optional(),
  clientName: clientNameField.transform((value) => (value === "" ? null : value)).optional(),
  onedriveFolderUrl: onedriveUrlField
    .transform((value) => (value === "" ? null : value))
    .optional(),
  // null puts the stage back to whatever the Project Status implies.
  stageOverride: projectStageSchema.nullable().optional(),
});
export type UpdateUnitInput = z.infer<typeof updateUnitSchema>;
export type UpdateUnitFormValues = z.input<typeof updateUnitSchema>;

/**
 * The Area of Concern box.
 *
 * An empty array is meaningful and must be stored: it means the owner emptied
 * the box on purpose. `null` means "go back to whatever the sheet's Notes say".
 */
export const setConcernsSchema = z.object({
  id: z.guid(),
  concerns: z
    .array(z.string().trim().min(1).max(500))
    .max(12, "Six bullets is about all the box will hold — twelve is the hard limit.")
    .nullable(),
});
export type SetConcernsInput = z.infer<typeof setConcernsSchema>;

/** Ticking or unticking one quotation. */
export const setQuotationIncludedSchema = z.object({
  quotationId: z.guid(),
  include: z.boolean(),
});
export type SetQuotationIncludedInput = z.infer<typeof setQuotationIncludedSchema>;

/** Which patch a unit belongs to. Null clears it — "no patch chosen yet". */
export const setPatchSchema = z.object({
  unitId: z.guid(),
  patch: z.string().trim().max(60, "A patch name must be 60 characters or fewer.").nullable(),
});

/** Whether a unit's newsletter has actually gone out, for one cycle. */
export const setSentSchema = z.object({
  editionId: z.guid(),
  unitId: z.guid(),
  sent: z.boolean(),
});

/** Whether a unit is meant to carry a timeline. Null puts it back to undecided. */
export const setSchedulePlanSchema = z.object({
  unitId: z.guid(),
  plan: z.enum(["photos_only", "timeline"]).nullable(),
});
