/**
 * The view model a newsletter renders from.
 *
 * One plain object holding every value that appears on the page. The HTML
 * preview, the JPG, the PDF and the PowerPoint all take this same object, so
 * what the owner approves on screen is exactly what the client receives.
 *
 * Building it is the only place the calculation engine, the unit's typed-in
 * extras and the edition's date come together.
 */

import { aggregateQuotations } from "./aggregate";
import { areaOfConcernBullets } from "./area-of-concern";
import { stageForUnit } from "./stage";
import type { NewsletterFigures, QuotationFigures, Stage } from "./types";

/** A bar on the Gantt chart. */
export interface GanttActivity {
  name: string;
  start: Date;
  finish: Date;
  /**
   * "attention" paints the bar orange — for things that are not work, like
   * "Pending Neighbour consent" on the Phase 4 Villa 2B sample.
   */
  tone: "normal" | "attention";
}

/** One quotation's schedule: a labelled band with its activities. */
export interface GanttRow {
  /** The vertical band's text, e.g. "Unit Extension". */
  label: string;
  activities: GanttActivity[];
}

/** A photo the owner ticked, already resolved to something an <img> can load. */
export interface NewsletterPhoto {
  url: string;
  /** Shown to screen readers and in the PowerPoint's alt text. */
  description: string;
}

export interface NewsletterView extends NewsletterFigures {
  /** "Cyan 11" — the grey header's first line. */
  displayName: string;
  /** "Mr. Samir Abdel Rahman Farouk" — blank until the query has it. */
  clientName: string | null;
  /** Bullets in the Area of Concern box. */
  concerns: string[];
  /** Which stage icon is filled. */
  stage: Stage;
  /** One row per quotation that has a schedule. Empty → the photo layout. */
  ganttRows: GanttRow[];
  photos: NewsletterPhoto[];
  /** "Weekly Newsletter", "Bi-Weekly Newsletter" — the owner's wording. */
  footerLabel: string;
  /** The date in the footer, and what elapsed time is measured to. */
  footerDate: Date;
}

/** Everything about a unit that the owner typed or ticked, not the sheet. */
export interface UnitOverrides {
  displayName: string;
  clientName: string | null;
  /** Replaces the bullets derived from the sheet's Notes, when set. */
  concernsOverride?: string[] | null;
  stageOverride?: Stage | null;
}

export interface BuildNewsletterInput {
  unit: UnitOverrides;
  /** The quotations the owner ticked — already filtered. */
  quotations: readonly QuotationFigures[];
  ganttRows?: readonly GanttRow[];
  photos?: readonly NewsletterPhoto[];
  footerLabel: string;
  footerDate: Date;
}

/**
 * True when the newsletter should use the Gantt layout.
 *
 * A schedule counts only if it actually has bars — an empty row would print a
 * blank chart where the photo layout would have shown the site.
 */
export function hasTimeSchedule(ganttRows: readonly GanttRow[]): boolean {
  return ganttRows.some((row) => row.activities.length > 0);
}

/** Assemble everything the renderer needs. */
export function buildNewsletterView(input: BuildNewsletterInput): NewsletterView {
  const figures = aggregateQuotations(input.quotations, input.footerDate);
  const ganttRows = (input.ganttRows ?? []).filter((row) => row.activities.length > 0);

  const derivedConcerns = areaOfConcernBullets(input.quotations.map((q) => q.notes));

  return {
    ...figures,
    displayName: input.unit.displayName,
    clientName: input.unit.clientName,
    // An override of [] is meaningful — the owner clearing the box must clear it.
    concerns: input.unit.concernsOverride ?? derivedConcerns,
    stage: stageForUnit(
      input.quotations.map((q) => q.projectStatus),
      input.unit.stageOverride ?? null,
    ),
    ganttRows: [...ganttRows],
    photos: [...(input.photos ?? [])],
    footerLabel: input.footerLabel,
    footerDate: input.footerDate,
  };
}
