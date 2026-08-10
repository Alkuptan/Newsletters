/**
 * The Gantt schedule for one quotation.
 *
 * Built by hand the first time, then saved, recalled every cycle and editable —
 * the owner's explicit choice (docs/SPEC.md, "Gantt schedule"). The form, the
 * action and the tests all import these schemas.
 */

import { z } from "zod";
import type { Enums } from "@/lib/supabase/database.types";

export const GANTT_TONES = ["normal", "attention"] as const satisfies readonly Enums<"gantt_tone">[];
export const ganttToneSchema = z.enum(GANTT_TONES);
export type GanttTone = (typeof GANTT_TONES)[number];

/** A calendar date, as an `<input type="date">` produces it. */
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date for every activity.");

export const ganttActivityInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Every activity needs a name.")
      .max(300, "That activity name is too long — 300 characters at most."),
    startDate: calendarDate,
    finishDate: calendarDate,
    tone: ganttToneSchema.default("normal"),
  })
  // Mirrors the CHECK constraint `gantt_activities_dates_ordered`: a bar that
  // ends before it starts would draw backwards.
  .refine((activity) => activity.finishDate >= activity.startDate, {
    message: "An activity cannot finish before it starts.",
    path: ["finishDate"],
  });
export type GanttActivityInput = z.infer<typeof ganttActivityInputSchema>;

export const saveGanttScheduleSchema = z.object({
  quotationId: z.guid(),
  /** The vertical band's text. Blank falls back to the scope of work. */
  rowLabel: z
    .string()
    .trim()
    .max(120, "That label is too long for the band — 120 characters at most.")
    .default(""),
  /**
   * The whole activity list, replacing whatever was there. An empty list is
   * meaningful: it clears the schedule, which switches the unit back to the
   * photo layout.
   */
  activities: z
    .array(ganttActivityInputSchema)
    .max(40, "Forty bars is more than the chart can show legibly."),
});
export type SaveGanttScheduleInput = z.infer<typeof saveGanttScheduleSchema>;

export const deleteGanttScheduleSchema = z.object({
  quotationId: z.guid(),
});
