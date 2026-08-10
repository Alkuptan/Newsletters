/**
 * Shared shapes for the newsletter calculation engine.
 *
 * Everything here is plain data — no Supabase types, no React. The renderer,
 * the exporters and the tests all consume these, so the numbers on screen, in
 * the JPG, in the PDF and in the PowerPoint can never drift apart.
 *
 * Business rules live in docs/SPEC.md under "How the newsletter numbers are
 * worked out". Change the spec first.
 */

/**
 * The verdict shown in the Status pill.
 *
 * COMPLETED is not a judgement about the schedule — it means there is nothing
 * left to judge. A unit whose every ticked quotation is finished should say so
 * rather than claim to be "ON TRACK", which reads as work still under way.
 */
export type ScheduleVerdict = "AHEAD" | "ON TRACK" | "BEHIND" | "COMPLETED";

/** The five icons along the stage track, in order. */
export const STAGES = ["initiation", "design", "quotation", "construction", "handover"] as const;

export type Stage = (typeof STAGES)[number];

/** Human labels for the stage track, matching the supplied templates. */
export const STAGE_LABELS: Record<Stage, string> = {
  initiation: "Initiation",
  design: "Design",
  quotation: "Quotation",
  construction: "Construction",
  handover: "Hand Over",
};

/**
 * One quotation as it arrives from the follow-up sheet, already cleaned.
 *
 * `progress` is the sheet's own 0–1 fraction (`Progress % Current`), NOT a
 * percentage — the sheet stores 0.9 for 90%.
 */
export interface QuotationFigures {
  quoteNumber: string;
  invoiceValue: number;
  scopeOfWork: string;
  progress: number;
  plannedStartDate: Date | null;
  /** The sheet's `Max Contractual` — the latest contractual finish date. */
  maxContractualDate: Date | null;
  projectStatus: string;
  assignedPm: string | null;
  notes: string | null;
}

/** Everything the dashboard needs, derived from the ticked quotations. */
export interface NewsletterFigures {
  /** `Quote #`s of the ticked quotations, comma separated, e.g. "20415, 20423". */
  quoteReferences: string;
  /** Sum of `Value Of Invoice`, rounded to whole LE. */
  quotationAmount: number;
  /** Distinct `Scope of work` values, comma separated. */
  projectSummary: string;
  /** The PM covering the most money, when the ticked quotations disagree. */
  projectManager: string | null;
  /** Earliest `Planned Start Date`. */
  startDate: Date | null;
  /** Latest `Max Contractual`. */
  finishDate: Date | null;
  /** Calendar days from startDate to finishDate. */
  durationDays: number | null;
  /** Money-weighted progress as a whole percentage, 0–100. */
  progressPercent: number;
  /** Calendar days from startDate to the edition date, clamped to [0, duration]. */
  elapsedDays: number;
  /**
   * Days past the finish date, 0 when not overdue.
   *
   * Kept separate from `elapsedDays` so the ring can show the overrun starting
   * from zero again, in red, rather than silently sitting at a full circle.
   */
  overrunDays: number;
  /** How much of the duration has gone, 0–100. Drives the elapsed ring. */
  elapsedPercent: number;
  /** null when there are no dates to judge against. */
  verdict: ScheduleVerdict | null;
  /** True when every ticked quotation is finished. */
  isComplete: boolean;
}

/**
 * Tolerance for the Status pill, in percentage points.
 *
 * Progress more than this far above the expected percentage reads AHEAD, more
 * than this far below reads BEHIND, anything in between reads ON TRACK. Five
 * points is the only band that reproduces all three supplied sample
 * newsletters — notably Ancient Hill 56 reading "On Track" at 3% done with 0
 * days elapsed.
 */
export const ON_TRACK_TOLERANCE_POINTS = 5;
