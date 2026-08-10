/**
 * Freeze a newsletter exactly as it was sent, and thaw it later.
 *
 * A cycle's figures come from the sheet, and the sheet moves on. Without a
 * snapshot, reopening last month's cycle re-renders it from today's numbers — so
 * the record of what a client received would quietly change. The snapshot is
 * written when a newsletter is exported and is never touched again.
 *
 * NEVER use `JSON.stringify` on a view directly. It calls `Date.toISOString()`,
 * which converts to UTC — and Egypt runs ahead of UTC, so every calendar date
 * would come back a day early (DECISIONS 0003). Dates go through `toIsoDate`
 * both ways.
 */

import { fromIsoDate, toIsoDate } from "./dates";
import type { NewsletterTheme } from "./theme";
import type { NewsletterView } from "./view-model";

/** What is stored in `edition_units.snapshot`. */
export interface NewsletterSnapshot {
  /** Bumped if the shape ever changes, so an old snapshot can be recognised. */
  version: 1;
  view: SerialisedView;
  theme: NewsletterTheme;
}

interface SerialisedActivity {
  name: string;
  start: string;
  finish: string;
  tone: "normal" | "attention";
}

interface SerialisedView {
  quoteReferences: string;
  quotationAmount: number;
  projectSummary: string;
  projectManager: string | null;
  startDate: string | null;
  finishDate: string | null;
  durationDays: number | null;
  progressPercent: number;
  elapsedDays: number;
  elapsedPercent: number;
  overrunDays: number;
  verdict: NewsletterView["verdict"];
  isComplete: boolean;
  displayName: string;
  clientName: string | null;
  concerns: string[];
  stage: NewsletterView["stage"];
  ganttRows: { label: string; activities: SerialisedActivity[] }[];
  photos: { url: string; description: string }[];
  footerLabel: string;
  footerDate: string;
}

const isoOrNull = (date: Date | null): string | null => (date ? toIsoDate(date) : null);

export function serialiseNewsletter(
  view: NewsletterView,
  theme: NewsletterTheme,
): NewsletterSnapshot {
  return {
    version: 1,
    theme,
    view: {
      quoteReferences: view.quoteReferences,
      quotationAmount: view.quotationAmount,
      projectSummary: view.projectSummary,
      projectManager: view.projectManager,
      startDate: isoOrNull(view.startDate),
      finishDate: isoOrNull(view.finishDate),
      durationDays: view.durationDays,
      progressPercent: view.progressPercent,
      elapsedDays: view.elapsedDays,
      elapsedPercent: view.elapsedPercent,
      overrunDays: view.overrunDays,
      verdict: view.verdict,
      isComplete: view.isComplete,
      displayName: view.displayName,
      clientName: view.clientName,
      concerns: view.concerns,
      stage: view.stage,
      ganttRows: view.ganttRows.map((row) => ({
        label: row.label,
        activities: row.activities.map((activity) => ({
          name: activity.name,
          start: toIsoDate(activity.start),
          finish: toIsoDate(activity.finish),
          tone: activity.tone,
        })),
      })),
      photos: view.photos.map((photo) => ({ url: photo.url, description: photo.description })),
      footerLabel: view.footerLabel,
      footerDate: toIsoDate(view.footerDate),
    },
  };
}

/**
 * Rebuild a view from a snapshot.
 *
 * Returns null for anything unrecognisable, so a corrupt or future-version
 * snapshot shows "cannot be reproduced" rather than a half-rendered page.
 */
export function deserialiseNewsletter(
  snapshot: unknown,
): { view: NewsletterView; theme: NewsletterTheme } | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const candidate = snapshot as Partial<NewsletterSnapshot>;
  if (candidate.version !== 1 || !candidate.view || !candidate.theme) return null;

  const s = candidate.view;
  const footerDate = fromIsoDate(s.footerDate);
  if (!footerDate) return null;

  return {
    theme: candidate.theme,
    view: {
      quoteReferences: s.quoteReferences,
      quotationAmount: s.quotationAmount,
      projectSummary: s.projectSummary,
      projectManager: s.projectManager,
      startDate: s.startDate ? fromIsoDate(s.startDate) : null,
      finishDate: s.finishDate ? fromIsoDate(s.finishDate) : null,
      durationDays: s.durationDays,
      progressPercent: s.progressPercent,
      elapsedDays: s.elapsedDays,
      elapsedPercent: s.elapsedPercent,
      // Older snapshots predate these; default rather than refuse to render.
      overrunDays: s.overrunDays ?? 0,
      verdict: s.verdict,
      isComplete: s.isComplete ?? false,
      displayName: s.displayName,
      clientName: s.clientName,
      concerns: s.concerns,
      stage: s.stage,
      ganttRows: s.ganttRows.flatMap((row) => {
        const activities = row.activities.flatMap((activity) => {
          const start = fromIsoDate(activity.start);
          const finish = fromIsoDate(activity.finish);
          return start && finish
            ? [{ name: activity.name, start, finish, tone: activity.tone }]
            : [];
        });
        return activities.length > 0 ? [{ label: row.label, activities }] : [];
      }),
      photos: s.photos.map((photo) => ({ url: photo.url, description: photo.description })),
      footerLabel: s.footerLabel,
      footerDate,
    },
  };
}
