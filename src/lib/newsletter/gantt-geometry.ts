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
import { TEXT_DEFAULTS } from "./theme";
import type { GanttRow } from "./view-model";

/**
 * The gap between one bar and the next when the schedule is short enough to be
 * laid out comfortably.
 *
 * This used to be 11, which put nearly as much air between the bars as the bars
 * themselves had height — a five-bar schedule read as a sparse list rather than
 * a chart, and a long one hit the panel's ceiling far sooner than it needed to.
 */
const PREFERRED_BAR_GAP = 5;

/**
 * The gap kept between two bars however long the schedule gets.
 *
 * Small, but never zero: bars that touch read as one long bar, which misstates
 * the schedule rather than merely looking cramped.
 */
const MIN_BAR_GAP = 2;

/** Space above and below each quotation's block of bars. */
const ROW_PADDING = 10;

/**
 * The line box a label occupies, as a multiple of its font size.
 *
 * Must match the `lineHeight` both renderers set, or the fitting below is
 * computed against a box neither of them actually draws.
 */
export const GANTT_LINE_HEIGHT = 1.15;

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
  /**
   * The bar's middle. Both labels are centred on this rather than nudged up
   * from `barY` by a fixed amount — see `textY`.
   */
  barCentreY: number;
  /**
   * The box both labels are drawn in, centred on the bar and exactly one slot
   * tall, so a label can never reach into its neighbour's row.
   *
   * The renderers centre their text vertically inside it. They used to place it
   * at `barY - 3` (preview) and `barY - 4` (exporter) — two fixed nudges tuned
   * for a full-height bar, which left the text riding high even at the default
   * size and drifting further as the bars thinned. The two also disagreed with
   * each other by a pixel, which is precisely what this file exists to prevent.
   */
  textY: number;
  textHeight: number;
  /** The date label's box: normally right-aligned, ending just before the bar. */
  labelX: number;
  labelWidth: number;
  /**
   * True when the date had to move to the RIGHT of the bar, because the bar
   * starts too early in the chart to leave room before it.
   *
   * A bar beginning in the first month has almost nothing between it and the
   * scope band, and the date was drawn over the band — legible on neither. It
   * goes after the bar instead, with the activity name after that, which is the
   * only place on the row it fits. The renderers left-align it in that case.
   */
  labelAfterBar: boolean;
  /**
   * Whether the date label must stay on one line.
   *
   * Wrapping is only safe when the slot is tall enough for two lines. Below
   * that a wrapped label is taller than its own slot and lands on the bar above
   * — the crowding this whole module is meant to avoid.
   */
  labelNoWrap: boolean;
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
   * How much to shrink the bar labels, 0–1.
   *
   * Derived from the space each bar actually has, so a label can never be taller
   * than its own slot. It used to be floored at 0.7 regardless of the space
   * available, which meant a schedule past about thirty bars drew 7px-tall text
   * into a 6px slot — every label sitting on the one above it.
   */
  textScale: number;
  /**
   * True when the schedule no longer fits at a legible size — the labels are
   * still separate, but small enough that the owner should be told rather than
   * find out from an exported slide.
   */
  crowded: boolean;
}

/**
 * How many bars fit at the comfortable spacing — the point past which they start
 * to thin.
 *
 * Exported so the schedule editor can warn BEFORE the owner exports a slide.
 * The editor used to re-derive this from its own copy of the panel height and
 * bar gap, which is exactly the drift this module exists to prevent: the two
 * definitions disagreed the moment the spacing changed here.
 */
export function comfortableBarCount(
  rowCount: number = 1,
  maxHeight: number = LAYOUT.withSchedule.ganttPanel.maxHeight,
): number {
  const spaceForBars = maxHeight - rowCount * ROW_PADDING;
  return Math.floor(spaceForBars / (LAYOUT.withSchedule.barHeight + PREFERRED_BAR_GAP));
}

/** The bar-label sizes the fitting is computed against. */
export interface GanttTextSizes {
  label: number;
  name: number;
}

const DEFAULT_TEXT_SIZES: GanttTextSizes = {
  label: TEXT_DEFAULTS.ganttBarLabel,
  name: TEXT_DEFAULTS.ganttBarName,
};

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
  /**
   * The label sizes this chart will actually be drawn at.
   *
   * Passed in rather than assumed, because the owner can change them on the
   * Design screen. Fitting against the default while the newsletter renders at
   * 16pt would put the overlap straight back.
   */
  textSizes: GanttTextSizes = DEFAULT_TEXT_SIZES,
): GanttGeometry | null {
  const activityDates = rows.flatMap((row) => row.activities.flatMap((a) => [a.start, a.finish]));
  if (activityDates.length === 0) return null;

  const dates = [
    ...activityDates,
    ...[coverRange?.start, coverRange?.finish].filter((d): d is Date => Boolean(d)),
  ];

  const { barHeight, band } = LAYOUT.withSchedule;

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
   * Only when the schedule is too long for `maxHeight` is that spacing squeezed.
   *
   * The slot is the ONE constraint everything below derives from. Bar height and
   * label size are both cut from it, so neither can ever be larger than the space
   * its own bar owns. Deriving them independently — a bar floored at 6px, a label
   * floored at 70% — is what let a long schedule draw bars and text straight
   * through each other.
   */
  const totalBars = rows.reduce((sum, row) => sum + row.activities.length, 0);
  const preferredSlot = barHeight + PREFERRED_BAR_GAP;
  const spaceForBars = maxHeight - rows.length * ROW_PADDING;
  const barSlot = Math.min(preferredSlot, spaceForBars / Math.max(totalBars, 1));

  /** Never taller than the slot it sits in, less the gap that keeps bars apart. */
  const effectiveBarHeight = Math.max(1, Math.min(barHeight, barSlot - MIN_BAR_GAP));

  /**
   * Labels are fitted to the slot too, against whichever of the two is larger —
   * fitting only the date label would let a bigger activity name overflow.
   */
  const largestText = Math.max(textSizes.label, textSizes.name);
  const textScale = Math.max(
    0,
    Math.min(1, barSlot / GANTT_LINE_HEIGHT / Math.max(largestText, 0.001)),
  );

  /** Two lines only fit when the slot is tall enough to hold them. */
  const labelNoWrap = barSlot < 2 * largestText * textScale * GANTT_LINE_HEIGHT;

  /** How many bars fit at the comfortable spacing. */
  const comfortableBars = comfortableBarCount(rows.length, maxHeight);

  const rowHeights = rows.map((row) => row.activities.length * barSlot + ROW_PADDING);
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
        /** The top of this bar's own slot. */
        const slotTop = rowTop + ROW_PADDING / 2 + index * barSlot;
        // Centred in its slice, so the spacing above and below each bar matches.
        const barY = slotTop + Math.max(0, (barSlot - effectiveBarHeight) / 2);
        const barCentreY = barY + effectiveBarHeight / 2;

        const rangeLabel = formatBarRange(activity.start, activity.finish);

        /**
         * The date label normally ends just before the bar. It only fits there
         * if the bar starts late enough to leave room — a bar beginning in the
         * first month has the scope band almost immediately to its left, and
         * the date used to be drawn over the band.
         */
        const labelFontSize = textSizes.label * textScale;
        const wantedLabelWidth = estimateTextWidth(rangeLabel, labelFontSize);
        const roomBeforeBar = barX - 5 - labelGutter;
        const labelAfterBar = roomBeforeBar < wantedLabelWidth;

        const labelX = labelAfterBar ? barX + barWidth + 6 : labelGutter;
        const labelWidth = labelAfterBar ? wantedLabelWidth : roomBeforeBar;
        const nameX = labelAfterBar ? labelX + labelWidth + 6 : barX + barWidth + 6;

        return {
          name: activity.name,
          rangeLabel,
          tone: activity.tone,
          barX,
          barWidth,
          barY,
          barHeight: effectiveBarHeight,
          barCentreY,
          textY: barCentreY - barSlot / 2,
          textHeight: barSlot,
          labelX,
          labelWidth,
          labelAfterBar,
          labelNoWrap,
          nameX,
          // Wrap inside the panel rather than running off its edge.
          nameWidth: Math.max(width - nameX - 8, 40),
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
    crowded: totalBars > comfortableBars,
  };
}

/**
 * Roughly how wide a run of text will be.
 *
 * Deliberately an estimate: the real width depends on the font the browser and
 * PowerPoint each resolve, and neither can be measured from here. 0.55 of the
 * font size per character is a little generous for the digits and short month
 * names these labels are made of, and erring generous is the safe direction —
 * it moves a tight label to the roomier side of the bar rather than leaving it
 * squeezed against the band.
 */
function estimateTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.55;
}

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
