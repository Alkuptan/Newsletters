/**
 * Where every Gantt bar, month column and label goes — computed once, consumed
 * by both the on-screen renderer and the PowerPoint exporter.
 *
 * This file exists so those two can never disagree. If the bar positions lived
 * in the React component, the exported slide would slowly drift away from the
 * preview the owner approved, and nobody would notice until a client did.
 *
 * All measurements are in pixels on the 1280 × 720 stage
 * (see `src/lib/newsletter/layout.ts`); the exporter converts them to inches.
 */

import { formatBarRange, monthShortName } from "./dates";
import { LAYOUT } from "./layout";
import type { GanttRow } from "./view-model";

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Whole months since January of `baseYear`. */
function monthIndex(date: Date, baseYear: number): number {
  return (date.getFullYear() - baseYear) * 12 + date.getMonth();
}

/**
 * A date's position along the ruler, measured in month columns.
 *
 * Month columns are equal width, as in the supplied templates, so a date is
 * placed by how far into its own month it falls — the 16th of a 30-day month
 * sits half a column in. Using raw day counts instead would let a 28-day
 * February push every later bar out of line with the ruler above it.
 */
function columnPosition(date: Date, baseYear: number, firstMonth: number): number {
  const fraction = (date.getDate() - 1) / daysInMonth(date.getFullYear(), date.getMonth());
  return monthIndex(date, baseYear) - firstMonth + fraction;
}

export interface MonthColumn {
  label: string;
  year: number;
  /** Left edge, relative to the panel. */
  x: number;
  width: number;
}

export interface PlacedActivity {
  name: string;
  /** "Mar 30 - Apr 28" — the label before the bar. */
  rangeLabel: string;
  tone: "normal" | "attention";
  /** Bar position, relative to the panel. */
  barX: number;
  barWidth: number;
  barY: number;
  barHeight: number;
  /** The date label's box: right-aligned, ending just before the bar. */
  labelX: number;
  labelWidth: number;
  /** The activity name's box, after the bar. */
  nameX: number;
  nameWidth: number;
}

export interface PlacedGanttRow {
  label: string;
  /** Top edge relative to the panel. */
  y: number;
  height: number;
  activities: PlacedActivity[];
}

export interface GanttGeometry {
  /** Where the chart area begins, relative to the panel — clear of the band. */
  chartLeft: number;
  chartWidth: number;
  columns: MonthColumn[];
  rows: PlacedGanttRow[];
  /** The panel's total height. */
  panelHeight: number;
  /** The year shown above the ruler. */
  year: number;
  /**
   * How many bars fit at the comfortable spacing. Past this the bars thin out to
   * stay inside the panel — the editor uses this to warn rather than let someone
   * discover it on an exported slide.
   */
  comfortableBars: number;
  /**
   * How much to shrink the bar labels, 0.7–1.
   *
   * The bars thin when a schedule is too long for the panel; their labels have
   * to thin with them or the text runs into the row above.
   */
  textScale: number;
}

/**
 * Lay out the whole chart for a panel of the given width.
 *
 * Returns null when there is nothing to draw, which is the signal to use the
 * photo layout instead.
 */
export function layoutGantt(
  rows: readonly GanttRow[],
  width: number,
  /**
   * The tallest the panel may become. Bars keep a comfortable fixed spacing and
   * the panel grows with them until it hits this, after which the spacing is
   * squeezed so a long schedule still fits. A short schedule keeps its bars close
   * together and the panel simply ends early — the page closes the gap by moving
   * the stage track and photos up (`withScheduleBlocks`).
   */
  maxHeight: number = LAYOUT.withSchedule.ganttPanel.maxHeight,
  /**
   * The Start and Finish dates printed on the card. The ruler always covers
   * these as well as the activities, so no month the newsletter advertises is
   * ever missing from the chart — a card reading "Finish 17 Sep" above a ruler
   * that stops in August invites the obvious question.
   */
  coverRange?: { start: Date | null; finish: Date | null },
): GanttGeometry | null {
  const activityDates = rows.flatMap((row) => row.activities.flatMap((a) => [a.start, a.finish]));
  if (activityDates.length === 0) return null;

  const dates = [
    ...activityDates,
    ...[coverRange?.start, coverRange?.finish].filter((d): d is Date => Boolean(d)),
  ];

  const { barHeight, band } = LAYOUT.withSchedule;
  const rowPadding = 16;

  /**
   * The chart starts to the RIGHT of the scope-of-work band, and the ruler is
   * aligned to it — the arrangement the supplied templates use. It matters for
   * more than tidiness: with the chart starting at the panel's left edge, an
   * activity beginning early in the first month lands underneath the band and
   * has nowhere to put its date label.
   */
  const chartLeft = band.width + 18;
  const chartWidth = width - chartLeft - 8;
  /** A date label may extend left to here, just clear of the band. */
  const labelGutter = band.width + 8;

  const baseYear = Math.min(...dates.map((d) => d.getFullYear()));
  const indices = dates.map((d) => monthIndex(d, baseYear));
  const firstMonth = Math.min(...indices);
  const lastMonth = Math.max(...indices);

  /**
   * A month of headroom past the last date — but only when it earns its place.
   *
   * The templates show it (Cyan 11 finishes in September, its ruler runs to
   * October) because their last bar ends near the month's end and its label
   * needs somewhere to go. Adding it unconditionally left a wide blank column on
   * the right of a schedule that ends mid-month.
   */
  const lastFinish = dates.reduce((latest, d) => (d > latest ? d : latest));
  const fractionThroughLastMonth =
    (lastFinish.getDate() - 1) / daysInMonth(lastFinish.getFullYear(), lastFinish.getMonth());
  const padMonths = fractionThroughLastMonth > 0.6 ? 1 : 0;

  const monthCount = lastMonth - firstMonth + 1 + padMonths;
  const columnWidth = chartWidth / monthCount;

  const columns: MonthColumn[] = Array.from({ length: monthCount }, (_, i) => {
    const absolute = firstMonth + i;
    return {
      label: monthShortName(absolute),
      year: baseYear + Math.floor(absolute / 12),
      x: chartLeft + i * columnWidth,
      width: columnWidth,
    };
  });

  const toX = (date: Date) => chartLeft + columnPosition(date, baseYear, firstMonth) * columnWidth;

  /**
   * Bars sit a comfortable fixed distance apart, and the panel grows to suit.
   * Only when the schedule is too long for `maxHeight` is that spacing squeezed —
   * down to a floor that still keeps the bars legibly separate.
   */
  const totalBars = rows.reduce((sum, row) => sum + row.activities.length, 0);
  const PREFERRED_SLOT = barHeight + 11;
  const spaceForBars = maxHeight - rows.length * rowPadding;
  // Below the preferred spacing the slot shrinks to fit, so the panel never
  // exceeds its maximum and no bar is ever cut off. Past about ten bars the bars
  // themselves have to thin out — the editor warns when a schedule gets there.
  const barSlot = Math.min(PREFERRED_SLOT, spaceForBars / Math.max(totalBars, 1));
  const MIN_BAR_HEIGHT = 6;
  const effectiveBarHeight = Math.min(barHeight, Math.max(MIN_BAR_HEIGHT, Math.round(barSlot - 4)));

  /**
   * How much the bars had to thin, as a fraction of their full height.
   *
   * The labels scale by the same amount. Leaving them at full size while the
   * bars halve is what made a long schedule unreadable — the text simply ran
   * into the row above. Floored at 0.7 so a very long schedule stays legible
   * rather than becoming decorative.
   */
  const textScale = Math.max(0.7, Math.min(1, effectiveBarHeight / barHeight));

  /** How many bars fit at the comfortable spacing. */
  const comfortableBars = Math.floor(spaceForBars / PREFERRED_SLOT);

  const rowHeights = rows.map((row) => row.activities.length * barSlot + rowPadding);
  const contentHeight = rowHeights.reduce((sum, h) => sum + h, 0);

  const placedRows: PlacedGanttRow[] = rows.map((row, rowIndex) => {
    const rowTop = rowHeights.slice(0, rowIndex).reduce((sum, h) => sum + h, 0);

    return {
      label: row.label,
      y: rowTop,
      height: rowHeights[rowIndex],
      activities: row.activities.map((activity, index) => {
        const barX = toX(activity.start);
        // A one-day activity still has to be visible.
        const barWidth = Math.max(toX(activity.finish) - barX, 10);
        // Centred in its slice, so the spacing above and below each bar matches.
        const barY =
          rowTop +
          rowPadding / 2 +
          index * barSlot +
          Math.max(0, (barSlot - effectiveBarHeight) / 2);

        return {
          name: activity.name,
          rangeLabel: formatBarRange(activity.start, activity.finish),
          tone: activity.tone,
          barX,
          barWidth,
          barY,
          barHeight: effectiveBarHeight,
          labelX: labelGutter,
          labelWidth: Math.max(barX - 5 - labelGutter, 34),
          nameX: barX + barWidth + 6,
          // Wrap inside the panel rather than running off its edge.
          nameWidth: Math.max(width - (barX + barWidth + 12), 70),
        };
      }),
    };
  });

  return {
    chartLeft,
    chartWidth,
    columns,
    rows: placedRows,
    // Grows with the bars, never past the maximum, never absurdly short.
    panelHeight: Math.min(
      maxHeight,
      Math.max(contentHeight, LAYOUT.withSchedule.ganttPanel.minHeight),
    ),
    year: columns[0].year,
    comfortableBars,
    textScale,
  };
}
