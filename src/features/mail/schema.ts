/**
 * Schemas for the covering email's wording and its CC rules.
 *
 * The editor, the actions and the tests all import these, so the browser and the
 * server can never disagree about what is valid.
 */

import { z } from "zod";

/**
 * One address per entry, validated here rather than at send time.
 *
 * There is no send time in this tool — a bad address would sit on a screen
 * looking correct until someone pasted it into Outlook — so the check has to
 * happen where it is typed.
 */
const emailField = z
  .string()
  .trim()
  .min(3)
  .max(320)
  .refine(
    (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v),
    "That does not look like an email address.",
  );

/** Limits match the CHECK constraints in migration 0015. */
export const saveMailSettingsSchema = z.object({
  subjectTemplate: z
    .string()
    .trim()
    .min(1, "The subject cannot be empty.")
    .max(300, "That subject is too long — 300 characters at most."),
  bodyTemplate: z
    .string()
    .trim()
    .min(1, "The message cannot be empty.")
    .max(8000, "That message is too long — 8000 characters at most."),
  alwaysCc: z
    .array(emailField)
    .max(50, "That is more than 50 people to copy on every unit.")
    .default([]),
  // Bounds match the CHECK constraint in migration 0016.
  imageWidthPx: z
    .number()
    .int()
    .min(200, "Below 200 the newsletter is unreadable in an email.")
    .max(1400, "Above 1400 it forces a sideways scroll in Outlook.")
    .default(500),
  // Empty is normal: many people would rather let Outlook sign it.
  signature: z
    .string()
    .max(4000, "That signature is too long — 4000 characters at most.")
    .default(""),
});
export type SaveMailSettingsInput = z.infer<typeof saveMailSettingsSchema>;

export const savePmRoutingSchema = z.object({
  pmName: z
    .string()
    .trim()
    .min(1, "Which project manager is this rule for?")
    .max(200, "That name is too long."),
  ccEmails: z
    .array(emailField)
    .max(20, "That is more than 20 addresses for one project manager.")
    .default([]),
});
export type SavePmRoutingInput = z.infer<typeof savePmRoutingSchema>;

export const deletePmRoutingSchema = z.object({ id: z.guid() });

/**
 * Split a textarea of addresses into entries.
 *
 * Shared by the editor and the actions so "one per line" and "several on a line,
 * comma separated" both behave the same way, whichever end validates it.
 */
export function splitAddresses(text: string): string[] {
  return text
    .split(/[;,\s\n\r]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}
