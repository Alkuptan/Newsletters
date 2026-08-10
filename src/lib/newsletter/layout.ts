/**
 * The newsletter's geometry and palette — the single source of truth for how a
 * newsletter looks, in ANY output format.
 *
 * The slide is 13.333 × 7.5 inches (PowerPoint's 16:9 default). At 96 px per
 * inch that is exactly 1280 × 720, which is also the size of the supplied
 * `CY-11 Newsletter.jpg`. So every measurement below is in CSS pixels on a
 * 1280 × 720 stage, and `pxToInches` converts the same number for the
 * PowerPoint exporter — the HTML preview, the JPG, the PDF and the PPTX cannot
 * drift apart, because they read these constants.
 *
 * Colours are taken from the supplied templates' own theme, not eyeballed from
 * the JPG: `accent2` is the orange, and the Gantt blues are literal
 * `srgbClr` values in `ppt/slides/slide1.xml`.
 */

import type { Stage } from "./types";

export const SLIDE_WIDTH_PX = 1280;
export const SLIDE_HEIGHT_PX = 720;
const PX_PER_INCH = 96;

/** Convert a stage pixel measurement to inches, for the PowerPoint exporter. */
export function pxToInches(px: number): number {
  return px / PX_PER_INCH;
}

/**
 * Convert a CSS pixel font size to PowerPoint points.
 *
 * A point is 1/72 inch and the stage is 96 px per inch, so text keeps the same
 * physical size on the slide as it has in the preview.
 */
export function pxToPt(px: number): number {
  return Math.round(px * 0.75 * 10) / 10;
}

/** The template's palette. */
export const PALETTE = {
  /** accent2 — the orange on the stage track, the big numbers, the accents. */
  orange: "#E97132",
  /** Softer orange for card borders and the stage connector line. */
  orangeSoft: "#F4B183",
  /** The pale peach fill behind the date cards, Status and Duration. */
  orangePale: "#FBE5D6",
  /** The grey behind the unit name and client. */
  greyHeader: "#ABABAB",
  /** The grey behind the PM / references / summary block. */
  greyBox: "#D9D9D9",
  /** lt2 — panel and card backgrounds. */
  greyPanel: "#E8E8E8",
  /** The footer bar, and the filled part of the elapsed ring. */
  greyDark: "#737373",
  /** Body text. */
  text: "#404040",
  /** The unfilled part of a ring or dial. */
  ringTrack: "#D9D9D9",
  /** Gantt activity bars. */
  ganttBar: "#5C9BD5",
  /** A Gantt bar that needs attention, e.g. "Pending Neighbour consent". */
  ganttBarAttention: "#E97132",
  /** The Gantt month ruler. */
  ganttHeader: "#215F9A",
  /** The vertical band naming the Gantt's scope of work. */
  ganttBand: "#9DC3E6",
  /** The Gantt panel's background. */
  ganttPanel: "#E8E8E8",
  /** The dark blue-grey of the year label above the month ruler. */
  ganttYear: "#44546A",
  white: "#FFFFFF",
} as const;

/**
 * Block positions on the stage, in pixels.
 *
 * Measured from the supplied `CY-11 Newsletter.jpg` and
 * `Ph4-Villa-2B Newsletter.pptx`. The left column is identical in both
 * layouts; only the right-hand side changes.
 */
export const LAYOUT = {
  page: { padding: 40 },

  /**
   * The left column — identical in both layouts. It runs as two sub-columns:
   * `colA` carries Start Date, Status and Actual Progress; `colB` carries
   * Finish Date, Duration, Area of Concern and Elapsed Time.
   */
  left: {
    x: 40,
    width: 364,
    unitHeader: { y: 30, height: 66 },
    infoBox: { y: 122, height: 84 },
    amountBox: { y: 250, height: 50 },
    colA: { x: 40, width: 176 },
    colB: { x: 228, width: 176 },
    /** Start and Finish calendar cards, side by side inside colA. */
    cardRow: { y: 324, height: 72, cardWidth: 70, chevronWidth: 16 },
    /** Status pill and Duration, side by side inside colA. */
    statusRow: { y: 404, height: 72 },
    /** Area of Concern spans both card rows, in colB. */
    concern: { y: 324, height: 152 },
    /** Actual Progress in colA, Elapsed Time ring in colB. */
    metricsRow: { y: 492, height: 156 },
  },

  /** Everything to the right of the left column. */
  right: {
    x: 432,
    width: 806,
  },

  /** The Gantt layout: month ruler, bars, stage track, two photos. */
  withSchedule: {
    year: { y: 72 },
    monthRuler: { y: 88, height: 28 },
    /**
     * The panel grows with its bars up to `maxHeight` and no further. A short
     * schedule keeps its bars close together and the panel simply ends early —
     * everything below it moves up, and the photos take the space (see
     * `withScheduleBlocks`).
     */
    ganttPanel: { y: 144, maxHeight: 208, minHeight: 76 },
    /** The vertical band on the panel's left naming the scope. */
    band: { width: 44 },
    barHeight: 13,
    barGap: 9,
    stageTrack: { y: 372, height: 88 },
    photos: { y: 464, height: 200, gap: 14 },
  },

  /** The no-schedule layout: stage track on top, photos take the whole side. */
  withoutSchedule: {
    stageTrack: { y: 24, height: 88 },
    photos: { y: 116, height: 548, gap: 12 },
  },

  footer: { y: 670, height: 26 },
} as const;

/**
 * Where the stage track and the photos sit, given how tall the Gantt panel
 * turned out.
 *
 * A three-bar schedule ends much higher up than a nine-bar one, and the page
 * should close the gap rather than leave a hole: the stage track follows the
 * panel, and the photos take whatever is left down to the footer. So a short
 * schedule buys taller photos.
 */
export function withScheduleBlocks(panelHeight: number, topGap = 0) {
  // `topGap` is the owner's adjustable space under the logo panel; it pushes the
  // whole right column down and the photos absorb it.
  const panelBottom = LAYOUT.withSchedule.ganttPanel.y + topGap + panelHeight;
  const stageTrackY = panelBottom + 20;
  const photosY = stageTrackY + LAYOUT.withSchedule.stageTrack.height + 4;
  return {
    panelY: LAYOUT.withSchedule.ganttPanel.y + topGap,
    stageTrackY,
    photosY,
    // Down to just above the footer bar.
    photosHeight: LAYOUT.footer.y - photosY - 6,
  };
}

/**
 * The artwork for a stage-track icon.
 *
 * The current stage sits on a filled orange circle and needs white line-work.
 * There is a real white PNG for that rather than a CSS filter, because a filter
 * exists only in the browser — PowerPoint cannot apply one, and the JPG
 * rasteriser is not guaranteed to either. One asset, three outputs, no surprises.
 */
export function stageIconPath(stage: Stage, isCurrent: boolean): string {
  return `/newsletter/stage-${stage}${isCurrent ? "-white" : ""}.png`;
}

/** How many photos each layout can show. */
export const PHOTO_SLOTS = {
  /** The Gantt layout has room for two along the bottom. */
  withSchedule: 2,
  /** The photo layout takes the whole right side: 2, 4 or 6. */
  withoutSchedule: 6,
} as const;

/**
 * The photo grid's shape for a given number of photos.
 *
 * Never leaves an empty box: two photos fill the side as one column of two,
 * three or four make a 2×2, five or six make a 2×3.
 */
export function photoGridShape(count: number): { columns: number; rows: number } {
  if (count <= 1) return { columns: 1, rows: 1 };
  if (count === 2) return { columns: 1, rows: 2 };
  if (count <= 4) return { columns: 2, rows: 2 };
  return { columns: 2, rows: 3 };
}
