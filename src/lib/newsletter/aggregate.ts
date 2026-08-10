/**
 * Combine the ticked quotations of one unit into the figures the dashboard
 * shows. This is the heart of the tool: one newsletter per unit, however many
 * quotations it covers.
 *
 * Every rule here is spelled out in docs/SPEC.md under "How the newsletter
 * numbers are worked out" and is pinned by tests against the three supplied
 * sample newsletters. Change the spec first.
 */

import { diffCalendarDays, earliest, latest } from "./dates";
import {
  ON_TRACK_TOLERANCE_POINTS,
  type NewsletterFigures,
  type QuotationFigures,
  type ScheduleVerdict,
} from "./types";

/** Empty figures, for a unit whose quotations are all unticked. */
const NOTHING_TICKED: NewsletterFigures = {
  quoteReferences: "",
  quotationAmount: 0,
  projectSummary: "",
  projectManager: null,
  startDate: null,
  finishDate: null,
  durationDays: null,
  progressPercent: 0,
  elapsedDays: 0,
  elapsedPercent: 0,
  overrunDays: 0,
  verdict: null,
  isComplete: false,
};

/**
 * Statuses that mean a quotation has nothing left to do.
 *
 * Cancelled and void count: a unit whose only remaining work was cancelled is
 * finished as far as the client is concerned, and calling it "ON TRACK" would be
 * misleading.
 */
const FINISHED_STATUSES = new Set(["completed", "cancelled", "void"]);

function isFinished(quotation: QuotationFigures): boolean {
  if (FINISHED_STATUSES.has(quotation.projectStatus.trim().toLocaleLowerCase())) return true;
  // The sheet occasionally lags the status column, so 100% counts too.
  return quotation.progress >= 1;
}

/**
 * Every project manager on the ticked quotations, biggest share of the money
 * first.
 *
 * A unit's quotations usually share one PM, but when they do not the newsletter
 * names them all — naming only the largest would leave a colleague off a page
 * that covers their work. Ordered by money so the lead reads first.
 */
function projectManagers(quotations: readonly QuotationFigures[]): string | null {
  const byPm = new Map<string, number>();
  for (const q of quotations) {
    const pm = q.assignedPm?.trim();
    if (!pm) continue;
    byPm.set(pm, (byPm.get(pm) ?? 0) + q.invoiceValue);
  }
  if (byPm.size === 0) return null;
  return [...byPm.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([pm]) => pm)
    .join(", ");
}

/**
 * Money-weighted progress across the ticked quotations, as a fraction 0–1.
 *
 * A 1.19-million quote at 40% has to outweigh a 144-thousand quote at 0% —
 * averaging them flat would report 20% for a unit that is really 36% done.
 * When the ticked quotations carry no invoice value at all there is nothing to
 * weight by, so fall back to a flat average rather than dividing by zero.
 */
function weightedProgress(quotations: readonly QuotationFigures[]): number {
  const totalValue = quotations.reduce((sum, q) => sum + q.invoiceValue, 0);
  if (totalValue <= 0) {
    if (quotations.length === 0) return 0;
    return quotations.reduce((sum, q) => sum + q.progress, 0) / quotations.length;
  }
  const weighted = quotations.reduce((sum, q) => sum + q.progress * q.invoiceValue, 0);
  return weighted / totalValue;
}

/** Distinct values in first-seen order, blanks dropped. */
function distinct(values: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = raw?.trim();
    if (!value) continue;
    const key = value.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

/**
 * Decide the Status pill.
 *
 * `expectedPercent` is how much of the duration has elapsed; a unit is on
 * track when its progress sits within the agreed tolerance of that.
 */
export function verdictFor(progressPercent: number, expectedPercent: number): ScheduleVerdict {
  const gap = progressPercent - expectedPercent;
  if (gap > ON_TRACK_TOLERANCE_POINTS) return "AHEAD";
  if (gap < -ON_TRACK_TOLERANCE_POINTS) return "BEHIND";
  return "ON TRACK";
}

/**
 * Roll the ticked quotations up into one newsletter's figures.
 *
 * @param quotations the quotations the owner ticked — already filtered
 * @param editionDate the date in the newsletter footer; elapsed time is measured
 *                    to this, never to "now", so reopening an old edition
 *                    re-renders the same numbers
 */
export function aggregateQuotations(
  quotations: readonly QuotationFigures[],
  editionDate: Date,
): NewsletterFigures {
  if (quotations.length === 0) return NOTHING_TICKED;

  const startDate = earliest(quotations.map((q) => q.plannedStartDate));
  const finishDate = latest(quotations.map((q) => q.maxContractualDate));

  // Duration is a plain calendar-day span between the two dates the card shows,
  // so a reader can always check it by counting. Verified against all three
  // supplied samples: CY-11 → 150, Ph4-Villa-2B → 180, AH-56 → 60.
  const durationDays =
    startDate && finishDate ? Math.max(0, diffCalendarDays(startDate, finishDate)) : null;

  const progressFraction = weightedProgress(quotations);
  const progressPercentExact = progressFraction * 100;

  // Elapsed never runs negative (a unit that has not started shows "00") and
  // never overruns the duration (an overdue unit shows a full ring, not 130%).
  const rawElapsed = startDate ? diffCalendarDays(startDate, editionDate) : 0;
  const elapsedDays =
    durationDays === null
      ? Math.max(0, rawElapsed)
      : Math.min(Math.max(0, rawElapsed), durationDays);

  // Days past the finish date. Reported separately so the ring can start again
  // from zero in red instead of just sitting full.
  const overrunDays =
    durationDays === null ? 0 : Math.max(0, Math.max(0, rawElapsed) - durationDays);

  const elapsedPercentExact =
    durationDays && durationDays > 0 ? (elapsedDays / durationDays) * 100 : 0;

  // With no usable dates there is nothing to judge the progress against, so the
  // pill stays empty rather than claiming a unit is on track by default.
  // "Nothing left to do" beats any schedule verdict — see ScheduleVerdict.
  const isComplete = quotations.every(isFinished);
  const verdict = isComplete
    ? ("COMPLETED" as const)
    : durationDays !== null && durationDays > 0
      ? verdictFor(progressPercentExact, elapsedPercentExact)
      : null;

  return {
    quoteReferences: quotations.map((q) => q.quoteNumber).join(", "),
    quotationAmount: Math.round(quotations.reduce((sum, q) => sum + q.invoiceValue, 0)),
    projectSummary: distinct(quotations.map((q) => q.scopeOfWork)).join(", "),
    projectManager: projectManagers(quotations),
    startDate,
    finishDate,
    durationDays,
    progressPercent: Math.round(progressPercentExact),
    elapsedDays,
    elapsedPercent: Math.round(elapsedPercentExact),
    overrunDays,
    verdict,
    isComplete,
  };
}
