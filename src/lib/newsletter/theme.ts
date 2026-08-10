/**
 * The newsletter's design, as adjustable values.
 *
 * `layout.ts` holds the ORIGINAL design in code. This file names every piece of it
 * that the owner may adjust, and works out the design a given newsletter actually
 * uses by layering three things:
 *
 *     the original design (code)
 *       ↓ overridden by
 *     the master for this layout (Timeline / Photos only / Before Delivery)
 *       ↓ overridden by
 *     this unit's own changes
 *
 * Edit a master and every newsletter follows. Change one unit and only that unit
 * changes — and because the change is stored on the unit, it is still there next
 * cycle. See docs/SPEC.md, "Template editor".
 *
 * Two rules make this safe to expose to a non-developer:
 *
 *   1. Every value is CLAMPED to a sane range, so no setting can produce an
 *      unreadable page or push a box off the slide.
 *   2. The defaults are code and the overrides are data, so a reset is simply the
 *      absence of an override — there is no state a reset cannot undo.
 */

import { LAYOUT, PALETTE } from "./layout";

/** Which master design a newsletter uses. */
export const TEMPLATE_KINDS = ["timeline", "photos", "before_delivery"] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

export const TEMPLATE_KIND_LABELS: Record<TemplateKind, string> = {
  timeline: "Timeline",
  photos: "Photos only",
  before_delivery: "Before Delivery",
};

/**
 * Every text size on the newsletter, named.
 *
 * These were inline numbers scattered through the renderer. Naming them is what
 * makes them adjustable — and it means the PowerPoint exporter reads the same
 * number as the preview instead of a copy that can drift.
 *
 * Sizes are CSS pixels on the 1280 × 720 stage; the exporter converts to points.
 */
export const TEXT_DEFAULTS = {
  unitName: 21,
  clientName: 14,
  infoLine: 12.5,
  amount: 14.5,
  cardDay: 16,
  cardMonth: 7,
  cardLabel: 11,
  statusHeading: 12,
  statusPill: 10.5,
  durationHeading: 11,
  durationValue: 26,
  durationUnit: 9,
  concernHeading: 13,
  concernBullet: 9.5,
  progressValue: 36,
  metricLabel: 13,
  elapsedValue: 28,
  ganttYear: 11,
  ganttMonth: 12,
  ganttBarLabel: 10,
  ganttBarName: 10,
  ganttBand: 11,
  stageLabel: 14,
  footer: 13,
} as const;

export type TextSizes = { -readonly [K in keyof typeof TEXT_DEFAULTS]: number };
export type TextSizeKey = keyof TextSizes;

/** Lines the owner may hide. Everything else is structural and always shown. */
export const FIELD_DEFAULTS = {
  clientName: true,
  projectManager: true,
  quotationReferences: true,
  projectSummary: true,
  areaOfConcern: true,
} as const;

export type FieldVisibility = { -readonly [K in keyof typeof FIELD_DEFAULTS]: boolean };
export type FieldKey = keyof FieldVisibility;

/** Heights of the left column's boxes, the part the owner asked to control. */
export const BOX_HEIGHT_DEFAULTS = {
  unitHeader: LAYOUT.left.unitHeader.height,
  infoBox: LAYOUT.left.infoBox.height,
  amountBox: LAYOUT.left.amountBox.height,
  concern: LAYOUT.left.concern.height,
  metricsRow: LAYOUT.left.metricsRow.height,
  /** The grey panel behind the logo, top right. */
  logoBox: 62,
  /**
   * The tallest the timeline panel may grow.
   *
   * Past this the BARS thin and their labels shrink with them, rather than the
   * panel pushing the photos down — the owner's instruction, and the right
   * trade: a schedule that is one row shorter still reads, a photo squeezed to a
   * strip does not.
   */
  timelinePanel: LAYOUT.withSchedule.ganttPanel.maxHeight,
} as const;

export type BoxHeights = { -readonly [K in keyof typeof BOX_HEIGHT_DEFAULTS]: number };
export type BoxKey = keyof BoxHeights;

/**
 * The space BETWEEN the boxes, which the owner asked to control separately from
 * the boxes themselves. Taken from the original design so the defaults
 * reproduce it exactly.
 */
export const GAP_DEFAULTS = {
  belowUnitHeader: LAYOUT.left.infoBox.y - LAYOUT.left.unitHeader.y - LAYOUT.left.unitHeader.height,
  belowInfoBox: LAYOUT.left.amountBox.y - LAYOUT.left.infoBox.y - LAYOUT.left.infoBox.height,
  belowAmountBox: LAYOUT.left.cardRow.y - LAYOUT.left.amountBox.y - LAYOUT.left.amountBox.height,
  belowCardRow: LAYOUT.left.statusRow.y - LAYOUT.left.cardRow.y - LAYOUT.left.cardRow.height,
  aboveMetrics:
    LAYOUT.left.metricsRow.y -
    Math.max(
      LAYOUT.left.statusRow.y + LAYOUT.left.statusRow.height,
      LAYOUT.left.concern.y + LAYOUT.left.concern.height,
    ),
  /** Logo panel → whatever is under it on the right (timeline or photos). */
  belowLogo: 0,
} as const;

export type Gaps = { -readonly [K in keyof typeof GAP_DEFAULTS]: number };
export type GapKey = keyof Gaps;

/** Colours the owner may change. */
export const COLOUR_DEFAULTS = {
  orange: PALETTE.orange,
  orangePale: PALETTE.orangePale,
  greyHeader: PALETTE.greyHeader,
  greyBox: PALETTE.greyBox,
  greyDark: PALETTE.greyDark,
  ganttBar: PALETTE.ganttBar,
  ganttHeader: PALETTE.ganttHeader,
  ganttBand: PALETTE.ganttBand,
  /** The filled part of the Elapsed Time ring. */
  elapsedRing: "#595959",
  /** The ring once a unit is past its finish date. */
  elapsedOverrun: "#B3261E",
} as const;

export type Colours = { -readonly [K in keyof typeof COLOUR_DEFAULTS]: string };
export type ColourKey = keyof Colours;

/** A resolved design: no optional values, nothing left to look up. */
export interface NewsletterTheme {
  text: TextSizes;
  fields: FieldVisibility;
  boxes: BoxHeights;
  gaps: Gaps;
  colours: Colours;
  /**
   * The logo, as a data URL.
   *
   * Deliberately not a link to a file: both exporters read the pixels through a
   * canvas, and a canvas that has drawn a cross-origin image cannot be read back
   * (DECISIONS 0007). A data URL is same-origin by construction. Null means the
   * El Gouna logo the tool ships with.
   */
  logo: string | null;
}

/** What is stored — only what differs from the original. */
export interface ThemeOverrides {
  text?: Partial<TextSizes>;
  fields?: Partial<FieldVisibility>;
  boxes?: Partial<BoxHeights>;
  gaps?: Partial<Gaps>;
  colours?: Partial<Colours>;
  logo?: string | null;
}

/**
 * Limits, so no setting can produce a page nobody would send.
 *
 * Text: readable at the bottom, and not so large it collides with its neighbour.
 * Boxes: no smaller than their content, no taller than the space the left column
 * has. Derived from the original value rather than typed twice.
 */
const TEXT_MIN = 5;
const TEXT_MAX = 60;

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/** A box may be halved or roughly doubled, never beyond the page. */
function boxRange(key: BoxKey): { min: number; max: number } {
  const original = BOX_HEIGHT_DEFAULTS[key];
  return {
    min: Math.max(20, Math.round(original * 0.5)),
    max: Math.min(LAYOUT.footer.y - LAYOUT.left.unitHeader.y, Math.round(original * 2.2)),
  };
}

export function textRange(): { min: number; max: number } {
  return { min: TEXT_MIN, max: TEXT_MAX };
}

/**
 * A gap may close entirely or grow to about three times the original.
 *
 * Zero is allowed on purpose — "no space at all" is a legitimate look, and the
 * column shrinks everything together if the result overflows.
 */
export function gapRange(key: GapKey): { min: number; max: number } {
  const original = GAP_DEFAULTS[key];
  return { min: 0, max: Math.max(24, Math.round(original * 3)) };
}

export { boxRange };

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Only a plain six-digit hex colour is accepted; anything else keeps the original. */
function clampColour(value: string | undefined, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return HEX.test(trimmed) ? trimmed.toUpperCase() : fallback;
}

/**
 * Work out the design a newsletter uses.
 *
 * Later arguments win. Passing nothing returns the original design exactly, which
 * is what makes "reset" simply mean "forget the override".
 */
export function resolveTheme(
  master?: ThemeOverrides | null,
  unit?: ThemeOverrides | null,
): NewsletterTheme {
  const text = {} as TextSizes;
  for (const key of Object.keys(TEXT_DEFAULTS) as TextSizeKey[]) {
    const original = TEXT_DEFAULTS[key];
    const chosen = unit?.text?.[key] ?? master?.text?.[key] ?? original;
    text[key] = clampNumber(chosen, TEXT_MIN, TEXT_MAX, original);
  }

  const fields = {} as FieldVisibility;
  for (const key of Object.keys(FIELD_DEFAULTS) as FieldKey[]) {
    const chosen = unit?.fields?.[key] ?? master?.fields?.[key] ?? FIELD_DEFAULTS[key];
    fields[key] = typeof chosen === "boolean" ? chosen : FIELD_DEFAULTS[key];
  }

  const boxes = {} as BoxHeights;
  for (const key of Object.keys(BOX_HEIGHT_DEFAULTS) as BoxKey[]) {
    const original = BOX_HEIGHT_DEFAULTS[key];
    const chosen = unit?.boxes?.[key] ?? master?.boxes?.[key] ?? original;
    const { min, max } = boxRange(key);
    boxes[key] = clampNumber(chosen, min, max, original);
  }

  const gaps = {} as Gaps;
  for (const key of Object.keys(GAP_DEFAULTS) as GapKey[]) {
    const original = GAP_DEFAULTS[key];
    const chosen = unit?.gaps?.[key] ?? master?.gaps?.[key] ?? original;
    const { min, max } = gapRange(key);
    gaps[key] = clampNumber(chosen, min, max, original);
  }

  const colours = {} as Colours;
  for (const key of Object.keys(COLOUR_DEFAULTS) as ColourKey[]) {
    const original = COLOUR_DEFAULTS[key];
    colours[key] = clampColour(unit?.colours?.[key] ?? master?.colours?.[key], original);
  }

  // A data URL only; anything else is ignored rather than trusted into an <img>.
  const chosenLogo = unit?.logo ?? master?.logo ?? null;
  const logo =
    typeof chosenLogo === "string" && chosenLogo.startsWith("data:image/") ? chosenLogo : null;

  return { text, fields, boxes, gaps, colours, logo };
}

/** The original design, for comparison and for the reset button. */
export const DEFAULT_THEME: NewsletterTheme = resolveTheme();

/**
 * The left column, laid out from the box heights.
 *
 * The original design has a fixed `y` for every box. That cannot survive editable
 * heights: make the info box taller and it would simply overlap the one below. So
 * the column is STACKED instead — each box sits a fixed distance below the one
 * above, and those distances are taken from the original design so that default
 * heights reproduce it exactly, to the pixel.
 */

export interface LeftColumnLayout {
  x: number;
  width: number;
  colA: { x: number; width: number };
  colB: { x: number; width: number };
  unitHeader: { y: number; height: number };
  infoBox: { y: number; height: number };
  amountBox: { y: number; height: number };
  cardRow: { y: number; height: number; cardWidth: number; chevronWidth: number };
  statusRow: { y: number; height: number };
  concern: { y: number; height: number };
  metricsRow: { y: number; height: number };
  /** Bottom of the lowest box, so a caller can check it clears the footer. */
  bottom: number;
}

/**
 * True when the requested heights fit the page as asked, without being shrunk.
 * The Design screen uses this to tell the owner rather than leave them guessing
 * why a box came out smaller than they typed.
 */
export function leftColumnFits(theme: NewsletterTheme): boolean {
  return stackLeftColumn(theme.boxes, theme.gaps).bottom <= COLUMN_BOTTOM_LIMIT;
}

/**
 * How far down the left column may reach: just above the footer bar.
 *
 * Note how little headroom this leaves — the original design already fills the
 * column, ending 22px above the footer. So growing one box largely means shrinking
 * another, which is a genuine property of a one-page layout rather than a
 * limitation of the editor. `leftColumnFits` is what tells the owner.
 */
const COLUMN_BOTTOM_LIMIT = LAYOUT.footer.y - 6;

export function resolveLeftColumn(theme: NewsletterTheme): LeftColumnLayout {
  /**
   * Clamping each box on its own is not enough: every box at its individual
   * maximum still stacks well past the footer. So if the column overflows, all the
   * adjustable heights are shrunk together in small steps until it fits.
   *
   * Shrinking everything proportionally rather than sacrificing one box keeps the
   * result predictable — the owner sees their change partly applied, and the
   * Design screen can say so, instead of the page silently breaking.
   *
   * A loop rather than algebra because the column's height depends on which of
   * (Status/Duration, Area of Concern) is the taller, and that can switch as the
   * heights change. Sixty steps of trivial arithmetic, and it always terminates.
   */
  let boxes = theme.boxes;
  for (let step = 0; step < 60; step += 1) {
    if (stackLeftColumn(boxes, theme.gaps).bottom <= COLUMN_BOTTOM_LIMIT) break;
    let anyShrunk = false;
    const next = { ...boxes };
    for (const key of Object.keys(next) as BoxKey[]) {
      const floor = boxRange(key).min;
      if (next[key] > floor) {
        next[key] = Math.max(floor, next[key] * 0.98);
        anyShrunk = true;
      }
    }
    // Everything is already at its floor; nothing more can be given up.
    if (!anyShrunk) break;
    boxes = next;
  }

  return stackLeftColumn(boxes, theme.gaps);
}

/** Stack the column from a set of heights, without any fitting. */
function stackLeftColumn(boxes: BoxHeights, GAPS: Gaps): LeftColumnLayout {
  const { left } = LAYOUT;

  const unitHeader = { y: left.unitHeader.y, height: boxes.unitHeader };
  const infoBox = {
    y: unitHeader.y + unitHeader.height + GAPS.belowUnitHeader,
    height: boxes.infoBox,
  };
  const amountBox = {
    y: infoBox.y + infoBox.height + GAPS.belowInfoBox,
    height: boxes.amountBox,
  };
  const cardRow = {
    y: amountBox.y + amountBox.height + GAPS.belowAmountBox,
    height: left.cardRow.height,
    cardWidth: left.cardRow.cardWidth,
    chevronWidth: left.cardRow.chevronWidth,
  };
  const statusRow = {
    y: cardRow.y + cardRow.height + GAPS.belowCardRow,
    height: left.statusRow.height,
  };
  // Area of Concern spans the card and status rows, in the second sub-column.
  const concern = { y: cardRow.y, height: boxes.concern };
  const metricsRow = {
    y: Math.max(statusRow.y + statusRow.height, concern.y + concern.height) + GAPS.aboveMetrics,
    height: boxes.metricsRow,
  };

  return {
    x: left.x,
    width: left.width,
    colA: { x: left.colA.x, width: left.colA.width },
    colB: { x: left.colB.x, width: left.colB.width },
    unitHeader,
    infoBox,
    amountBox,
    cardRow,
    statusRow,
    concern,
    metricsRow,
    bottom: metricsRow.y + metricsRow.height,
  };
}

/**
 * Which master a newsletter uses — decided the same way the layout already is, so
 * nothing extra has to be chosen per unit.
 */
export function templateKindFor(options: {
  hasSchedule: boolean;
  delivery?: "after_delivery" | "before_delivery";
}): TemplateKind {
  if (options.delivery === "before_delivery") return "before_delivery";
  return options.hasSchedule ? "timeline" : "photos";
}

/** True when a unit differs from its master, so its page can say so. */
export function hasOwnDesign(unit?: ThemeOverrides | null): boolean {
  if (!unit) return false;
  return (
    Object.keys(unit.text ?? {}).length > 0 ||
    Object.keys(unit.fields ?? {}).length > 0 ||
    Object.keys(unit.boxes ?? {}).length > 0 ||
    Object.keys(unit.colours ?? {}).length > 0
  );
}
