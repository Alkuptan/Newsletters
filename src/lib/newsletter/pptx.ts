/**
 * Build an EDITABLE PowerPoint slide from a newsletter.
 *
 * Every box, bar and label is a real PowerPoint shape, so the owner can open the
 * deck and retype a number or nudge a photo. That was the owner's explicit
 * choice over a flat picture (see docs/SPEC.md).
 *
 * Geometry comes from `layout.ts` and `gantt-geometry.ts` — the same constants
 * and the same bar-placement function the on-screen preview uses — converted
 * from stage pixels to inches. That is what keeps the slide and the preview the
 * same picture.
 *
 * BROWSER ONLY. Import this with a dynamic `import()` from a client component:
 * PptxGenJS is around a megabyte and must never reach the Cloudflare Worker
 * bundle, which has a 3 MiB budget (docs/template/RULES.md, free-tier facts).
 */

import type PptxGenJS from "pptxgenjs";
import { formatCardDay, formatCardMonthYear, formatFooterDate } from "./dates";
import { layoutGantt, type GanttGeometry } from "./gantt-geometry";
import {
  LAYOUT,
  PALETTE,
  pxToInches as inches,
  pxToPt as pt,
  SLIDE_HEIGHT_PX,
  SLIDE_WIDTH_PX,
  photoGridShape,
  stageIconPath,
  withScheduleBlocks,
} from "./layout";
import {
  DEFAULT_THEME,
  resolveLeftColumn,
  type LeftColumnLayout,
  type NewsletterTheme,
} from "./theme";
import { STAGES, STAGE_LABELS } from "./types";
import { hasTimeSchedule, type NewsletterView } from "./view-model";

/**
 * Crop a photo to fill a slot exactly, and return it as a data URL.
 *
 * PowerPoint's own fit-to-frame does not reproduce what CSS `object-fit: cover`
 * does in the preview, so the two ended up showing different crops of the same
 * photo. Doing the cover-crop ourselves on a canvas means the slide, the JPG and
 * the on-screen preview all show the identical picture.
 *
 * Requires the photo to be same-origin (or CORS-permitted): a canvas tainted by
 * a cross-origin image cannot be read back.
 */
async function coverCropToDataUrl(url: string, targetW: number, targetH: number): Promise<string> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.crossOrigin = "anonymous";
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error(`Could not load the photo at ${url}.`));
    element.src = url;
  });

  // Two device pixels per stage pixel keeps the photos crisp when the slide is
  // shown full screen, without making the file enormous.
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(targetW * 2);
  canvas.height = Math.round(targetH * 2);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not prepare the photos.");

  const scale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.drawImage(
    image,
    (canvas.width - drawWidth) / 2,
    (canvas.height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
  return canvas.toDataURL("image/jpeg", 0.9);
}

/** PptxGenJS wants bare hex, no leading hash. */
function hex(colour: string): string {
  return colour.replace("#", "");
}

const FONT = "Aptos";

/** Egyptian pounds, grouped, no decimals. */
function formatMoney(amount: number): string {
  return `${amount.toLocaleString("en-US")} LE`;
}

type Slide = PptxGenJS.Slide;

/** A rounded panel, in stage pixels. */
function panel(
  slide: Slide,
  pptx: PptxGenJS,
  box: { x: number; y: number; w: number; h: number },
  fill: string,
  options: { line?: string; radius?: number } = {},
) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x: inches(box.x),
    y: inches(box.y),
    w: inches(box.w),
    h: inches(box.h),
    fill: { color: hex(fill) },
    line: options.line ? { color: hex(options.line), width: 0.75 } : { type: "none" },
    rectRadius: options.radius ?? 0.06,
  });
}

/** Plain text in a box, in stage pixels. */
function text(
  slide: Slide,
  content: string | PptxGenJS.TextProps[],
  box: { x: number; y: number; w: number; h: number },
  options: {
    size: number;
    colour?: string;
    bold?: boolean;
    align?: "left" | "center" | "right";
    valign?: "top" | "middle" | "bottom";
    rotate?: number;
    wrap?: boolean;
  },
) {
  slide.addText(content, {
    x: inches(box.x),
    y: inches(box.y),
    w: inches(box.w),
    h: inches(box.h),
    fontFace: FONT,
    fontSize: pt(options.size),
    color: hex(options.colour ?? PALETTE.text),
    bold: options.bold ?? false,
    align: options.align ?? "left",
    valign: options.valign ?? "middle",
    rotate: options.rotate,
    wrap: options.wrap ?? true,
    margin: 0,
    // Never let PowerPoint shrink or grow the box to fit — that would break the
    // one guarantee this exporter makes, that the slide matches the preview.
    autoFit: false,
    shrinkText: false,
  });
}

const { right, footer } = LAYOUT;

function addLeftColumn(
  slide: Slide,
  pptx: PptxGenJS,
  view: NewsletterView,
  theme: NewsletterTheme,
  left: LeftColumnLayout,
) {
  const { colA, colB, cardRow, statusRow, concern, metricsRow } = left;
  const { fields } = theme;

  // Unit name and client.
  panel(
    slide,
    pptx,
    { x: left.x, y: left.unitHeader.y, w: left.width, h: left.unitHeader.height },
    theme.colours.greyHeader,
  );
  text(
    slide,
    [
      {
        text: view.displayName,
        options: { bold: true, fontSize: pt(theme.text.unitName), breakLine: true },
      },
      {
        text: fields.clientName ? (view.clientName ?? "") : "",
        options: { fontSize: pt(theme.text.clientName) },
      },
    ],
    {
      x: left.x + 20,
      y: left.unitHeader.y + 8,
      w: left.width - 30,
      h: left.unitHeader.height - 16,
    },
    { size: theme.text.unitName, colour: PALETTE.white, valign: "middle" },
  );

  // Project manager / references / summary.
  panel(
    slide,
    pptx,
    { x: left.x, y: left.infoBox.y, w: left.width, h: left.infoBox.height },
    theme.colours.greyBox,
  );
  // paraSpaceAfter gives the three lines the same breathing room the preview
  // gets from its flex gap; without it PowerPoint bunches them at single spacing.
  const dot = (label: string, value: string, last = false): PptxGenJS.TextProps[] => [
    { text: `${label} `, options: { bold: true, fontSize: pt(theme.text.infoLine) } },
    {
      text: value,
      options: {
        fontSize: pt(theme.text.infoLine),
        breakLine: !last,
        paraSpaceAfter: last ? 0 : 6,
      },
    },
  ];
  // Only the lines the design shows, and the LAST one present must not carry a
  // line break or PowerPoint leaves a blank line at the bottom of the box.
  const infoLines: { label: string; value: string }[] = [];
  if (fields.projectManager)
    infoLines.push({ label: "Project Manager:", value: view.projectManager ?? "—" });
  if (fields.quotationReferences)
    infoLines.push({
      label: "Quotation References:",
      value: view.quoteReferences ? `${view.quoteReferences}.` : "—",
    });
  if (fields.projectSummary)
    infoLines.push({
      label: "Project Summary:",
      value: view.projectSummary ? `${view.projectSummary}.` : "—",
    });

  if (infoLines.length > 0) {
    text(
      slide,
      infoLines.flatMap((line, index) =>
        dot(line.label, line.value, index === infoLines.length - 1),
      ),
      { x: left.x + 18, y: left.infoBox.y + 8, w: left.width - 30, h: left.infoBox.height - 16 },
      { size: theme.text.infoLine, valign: "middle" },
    );
  }

  // Quotation amount.
  panel(
    slide,
    pptx,
    { x: left.x, y: left.amountBox.y, w: left.width, h: left.amountBox.height },
    PALETTE.greyPanel,
  );
  slide.addImage({
    path: "/newsletter/icon-coins.png",
    x: inches(left.x + 14),
    y: inches(left.amountBox.y + 8),
    w: inches(34),
    h: inches(34),
  });
  text(
    slide,
    `Quotation Amount: ${formatMoney(view.quotationAmount)}`,
    { x: left.x + 60, y: left.amountBox.y, w: left.width - 68, h: left.amountBox.height },
    { size: theme.text.amount, bold: true },
  );

  // Start and Finish calendar cards.
  const cardAx = colA.x + 8;
  const cardBx = cardAx + cardRow.cardWidth + cardRow.chevronWidth + 8;
  for (const card of [
    { x: cardAx, date: view.startDate, label: "Start Date" },
    { x: cardBx, date: view.finishDate, label: "Finish Date" },
  ]) {
    panel(
      slide,
      pptx,
      { x: card.x, y: cardRow.y, w: cardRow.cardWidth, h: 52 },
      theme.colours.orangePale,
    );
    slide.addImage({
      path: "/newsletter/icon-calendar.png",
      x: inches(card.x + (cardRow.cardWidth - 46) / 2),
      y: inches(cardRow.y + 3),
      w: inches(46),
      h: inches(46),
    });
    text(
      slide,
      card.date ? formatCardDay(card.date) : "—",
      { x: card.x, y: cardRow.y + 16, w: cardRow.cardWidth, h: 14 },
      { size: theme.text.cardDay, bold: true, align: "center" },
    );
    text(
      slide,
      card.date ? formatCardMonthYear(card.date) : "",
      { x: card.x, y: cardRow.y + 32, w: cardRow.cardWidth, h: 10 },
      { size: theme.text.cardMonth, align: "center" },
    );
    text(
      slide,
      card.label,
      { x: card.x, y: cardRow.y + 54, w: cardRow.cardWidth, h: 14 },
      { size: theme.text.cardLabel, bold: true, align: "center" },
    );
  }
  text(
    slide,
    "❯",
    { x: cardAx + cardRow.cardWidth, y: cardRow.y + 14, w: cardRow.chevronWidth + 6, h: 20 },
    // Tied to the day number so the arrow keeps pace if the cards are resized.
    { size: theme.text.cardDay + 1, align: "center" },
  );

  // Status pill.
  panel(
    slide,
    pptx,
    { x: cardAx, y: statusRow.y, w: cardRow.cardWidth, h: statusRow.height },
    theme.colours.orangePale,
  );
  text(
    slide,
    "Status",
    { x: cardAx, y: statusRow.y + 6, w: cardRow.cardWidth, h: 14 },
    { size: theme.text.statusHeading, bold: true, align: "center" },
  );
  slide.addShape(pptx.ShapeType.roundRect, {
    x: inches(cardAx + 6),
    y: inches(statusRow.y + 28),
    w: inches(cardRow.cardWidth - 12),
    h: inches(22),
    fill: { color: hex(PALETTE.white) },
    line: { color: hex(theme.colours.orange), width: 1.25 },
    rectRadius: 0.11,
  });
  text(
    slide,
    view.verdict ?? "—",
    { x: cardAx + 6, y: statusRow.y + 28, w: cardRow.cardWidth - 12, h: 22 },
    { size: theme.text.statusPill, bold: true, align: "center" },
  );

  // Duration.
  panel(
    slide,
    pptx,
    { x: cardBx, y: statusRow.y, w: cardRow.cardWidth, h: statusRow.height },
    theme.colours.orangePale,
  );
  text(
    slide,
    "Duration",
    { x: cardBx, y: statusRow.y + 4, w: cardRow.cardWidth, h: 13 },
    { size: theme.text.durationHeading, bold: true, align: "center" },
  );
  text(
    slide,
    view.durationDays === null ? "—" : String(view.durationDays),
    { x: cardBx, y: statusRow.y + 18, w: cardRow.cardWidth, h: 30 },
    { size: theme.text.durationValue, bold: true, align: "center" },
  );
  text(
    slide,
    "Calendar Days",
    { x: cardBx, y: statusRow.y + 50, w: cardRow.cardWidth, h: 12 },
    { size: theme.text.durationUnit, align: "center" },
  );

  // Area of Concern.
  if (fields.areaOfConcern) {
    panel(
      slide,
      pptx,
      { x: colB.x, y: concern.y, w: colB.width, h: concern.height },
      PALETTE.white,
      { line: PALETTE.ringTrack },
    );
    text(
      slide,
      "Area of Concern",
      { x: colB.x, y: concern.y + 8, w: colB.width, h: 16 },
      { size: theme.text.concernHeading, bold: true, align: "center" },
    );
    if (view.concerns.length > 0) {
      text(
        slide,
        view.concerns.map((concernText, index) => ({
          text: concernText,
          options: {
            // A hyphen, matching the templates. Must be FOUR hex digits —
            // "2D" is silently rejected by PowerPoint and logs a warning.
            bullet: { characterCode: "002D" },
            fontSize: pt(theme.text.concernBullet),
            breakLine: index < view.concerns.length - 1,
          },
        })),
        { x: colB.x + 10, y: concern.y + 28, w: colB.width - 20, h: concern.height - 36 },
        { size: theme.text.concernBullet, valign: "top" },
      );
    }
  }

  // Actual Progress dial.
  panel(
    slide,
    pptx,
    { x: colA.x, y: metricsRow.y, w: colA.width, h: metricsRow.height },
    PALETTE.white,
    { line: PALETTE.ringTrack },
  );
  slide.addImage({
    path: "/newsletter/icon-progress-clock.svg",
    x: inches(colA.x + 14),
    y: inches(metricsRow.y + 12),
    w: inches(78),
    h: inches(86),
  });
  text(
    slide,
    `${view.progressPercent}%`,
    { x: colA.x + 60, y: metricsRow.y + 86, w: colA.width - 72, h: 40 },
    { size: theme.text.progressValue, bold: true, colour: theme.colours.orange, align: "right" },
  );
  text(
    slide,
    "Actual Progress",
    { x: colA.x, y: metricsRow.y + metricsRow.height - 26, w: colA.width, h: 16 },
    { size: theme.text.metricLabel, bold: true, align: "center" },
  );

  // Elapsed Time ring — a real doughnut chart, so it stays editable.
  panel(
    slide,
    pptx,
    { x: colB.x, y: metricsRow.y, w: colB.width, h: metricsRow.height },
    PALETTE.white,
    { line: PALETTE.ringTrack },
  );
  const ring = 104;
  // A PowerPoint chart draws its plot inside a margin, so a frame the size of
  // the ring produces a visibly smaller ring than the preview shows. Oversizing
  // the frame and re-centring makes the drawn ring match. Measured against the
  // rendered slide, the plot fills roughly 62% of the frame.
  const CHART_PLOT_RATIO = 0.62;
  const ringFrame = ring / CHART_PLOT_RATIO;
  // Past the finish date the ring restarts from zero in red — see left-column.tsx.
  const overdue = view.overrunDays > 0;
  const ringSweep = overdue
    ? view.durationDays && view.durationDays > 0
      ? Math.min(100, (view.overrunDays / view.durationDays) * 100)
      : 100
    : view.elapsedPercent;

  slide.addChart(
    pptx.ChartType.doughnut,
    [
      {
        name: "Elapsed Time",
        labels: ["Elapsed", "Remaining"],
        values: [ringSweep, 100 - ringSweep],
      },
    ],
    {
      x: inches(colB.x + (colB.width - ringFrame) / 2),
      y: inches(metricsRow.y + 18 - (ringFrame - ring) / 2),
      w: inches(ringFrame),
      h: inches(ringFrame),
      // Thinner band than before, matching the preview.
      holeSize: 86,
      chartColors: [
        hex(overdue ? theme.colours.elapsedOverrun : theme.colours.elapsedRing),
        hex(PALETTE.ringTrack),
      ],
      showLegend: false,
      showTitle: false,
      showValue: false,
      dataBorder: { pt: 0, color: hex(PALETTE.white) },
    },
  );
  text(
    slide,
    overdue ? `+${view.overrunDays}` : String(view.elapsedDays).padStart(2, "0"),
    { x: colB.x, y: metricsRow.y + 46, w: colB.width, h: 30 },
    {
      size: theme.text.elapsedValue,
      bold: true,
      colour: overdue ? theme.colours.elapsedOverrun : theme.colours.orange,
      align: "center",
    },
  );
  text(
    slide,
    overdue ? "Days Overdue" : "Elapsed Time",
    { x: colB.x, y: metricsRow.y + metricsRow.height - 26, w: colB.width, h: 16 },
    { size: theme.text.metricLabel, bold: true, align: "center" },
  );
}

function addStageTrack(
  slide: Slide,
  pptx: PptxGenJS,
  view: NewsletterView,
  y: number,
  width: number,
  theme: NewsletterTheme,
) {
  const step = width / STAGES.length;
  const circle = 46;

  // Connector behind the circles, inset half a step at each end.
  slide.addShape(pptx.ShapeType.rect, {
    x: inches(right.x + step / 2),
    y: inches(y + circle / 2 - 1),
    w: inches(width - step),
    h: inches(2),
    fill: { color: hex(PALETTE.orangeSoft) },
    line: { type: "none" },
  });

  STAGES.forEach((candidate, index) => {
    const isCurrent = candidate === view.stage;
    const centreX = right.x + index * step + step / 2;

    slide.addShape(pptx.ShapeType.ellipse, {
      x: inches(centreX - circle / 2),
      y: inches(y),
      w: inches(circle),
      h: inches(circle),
      fill: { color: hex(isCurrent ? theme.colours.orange : PALETTE.white) },
      line: { color: hex(theme.colours.orange), width: 1.5 },
    });
    slide.addImage({
      path: stageIconPath(candidate, isCurrent),
      x: inches(centreX - 14),
      y: inches(y + circle / 2 - 14),
      w: inches(28),
      h: inches(28),
    });
    text(
      slide,
      STAGE_LABELS[candidate],
      { x: centreX - step / 2, y: y + circle + 6, w: step, h: 18 },
      { size: theme.text.stageLabel, bold: true, align: "center" },
    );
  });
}

function addGantt(
  slide: Slide,
  pptx: PptxGenJS,
  view: NewsletterView,
  chart: GanttGeometry,
  theme: NewsletterTheme,
  /** The owner's adjustable space under the logo. Shifts the whole chart down. */
  topOffset = 0,
) {
  const { band } = LAYOUT.withSchedule;
  const panelY = LAYOUT.withSchedule.ganttPanel.y + topOffset;

  text(
    slide,
    String(chart.year),
    { x: right.x + chart.chartLeft, y: LAYOUT.withSchedule.year.y - 4 + topOffset, w: 60, h: 14 },
    { size: theme.text.ganttYear, bold: true, colour: PALETTE.ganttYear },
  );

  // Month ruler: one shape per column so each month label stays editable.
  for (const month of chart.columns) {
    slide.addShape(pptx.ShapeType.rect, {
      x: inches(right.x + month.x),
      y: inches(LAYOUT.withSchedule.monthRuler.y + topOffset),
      w: inches(month.width),
      h: inches(LAYOUT.withSchedule.monthRuler.height),
      fill: { color: hex(theme.colours.ganttHeader) },
      line: { color: "FFFFFF", width: 0.5 },
    });
    text(
      slide,
      month.label,
      {
        x: right.x + month.x + 8,
        y: LAYOUT.withSchedule.monthRuler.y + topOffset,
        w: month.width - 10,
        h: LAYOUT.withSchedule.monthRuler.height,
      },
      { size: theme.text.ganttMonth, colour: PALETTE.white },
    );
  }

  panel(
    slide,
    pptx,
    { x: right.x, y: panelY, w: right.width, h: chart.panelHeight },
    PALETTE.ganttPanel,
  );

  // A faint line where each month begins, matching the preview.
  chart.columns.forEach((month, index) => {
    if (index === 0) return;
    slide.addShape(pptx.ShapeType.line, {
      x: inches(right.x + month.x),
      y: inches(panelY),
      w: 0,
      h: inches(chart.panelHeight),
      line: { color: hex(theme.colours.ganttHeader), width: 0.75, transparency: 75 },
    });
  });

  for (const row of chart.rows) {
    // The vertical band naming the scope of work.
    panel(
      slide,
      pptx,
      { x: right.x + 6, y: panelY + row.y + 6, w: band.width, h: row.height - 12 },
      theme.colours.ganttBand,
    );
    // Rotating a text box in PowerPoint spins it about its centre WITHOUT
    // swapping width and height, so a box sized to the narrow band would wrap
    // the label to "Unit Extensio / n". Build it with the dimensions swapped and
    // centred on the band, then rotate.
    const bandCentreX = right.x + 6 + band.width / 2;
    const bandCentreY = panelY + row.y + row.height / 2;
    const labelLength = row.height - 12;
    text(
      slide,
      row.label,
      {
        x: bandCentreX - labelLength / 2,
        y: bandCentreY - band.width / 2,
        w: labelLength,
        h: band.width,
      },
      {
        size: theme.text.ganttBand,
        bold: true,
        colour: PALETTE.white,
        align: "center",
        rotate: 270,
        wrap: false,
      },
    );

    for (const activity of row.activities) {
      text(
        slide,
        activity.rangeLabel,
        {
          x: right.x + activity.labelX,
          y: panelY + activity.barY - 4,
          w: activity.labelWidth,
          h: 20,
        },
        { size: theme.text.ganttBarLabel * chart.textScale, align: "right", valign: "top" },
      );
      slide.addShape(pptx.ShapeType.rect, {
        x: inches(right.x + activity.barX),
        y: inches(panelY + activity.barY),
        w: inches(activity.barWidth),
        h: inches(activity.barHeight),
        fill: {
          color: hex(
            activity.tone === "attention" ? PALETTE.ganttBarAttention : theme.colours.ganttBar,
          ),
        },
        line: { type: "none" },
      });
      text(
        slide,
        activity.name,
        {
          x: right.x + activity.nameX,
          y: panelY + activity.barY - 3,
          w: activity.nameWidth,
          h: 22,
        },
        { size: theme.text.ganttBarName * chart.textScale, valign: "top" },
      );
    }
  }
}

async function addPhotos(
  slide: Slide,
  pptx: PptxGenJS,
  view: NewsletterView,
  box: { y: number; height: number; gap: number },
  options: { columns?: number; divider?: boolean },
  theme: NewsletterTheme,
) {
  const photos = view.photos.slice(0, options.columns === 2 && !options.divider ? 2 : 6);
  if (photos.length === 0) return;

  const cols = options.columns ?? photoGridShape(photos.length).columns;
  const rows = Math.max(1, Math.ceil(photos.length / cols));
  const cellWidth = (right.width - box.gap * (cols - 1)) / cols;
  const cellHeight = (box.height - box.gap * (rows - 1)) / rows;

  if (options.divider && cols === 2) {
    slide.addShape(pptx.ShapeType.line, {
      x: inches(right.x + cellWidth + box.gap / 2),
      y: inches(box.y),
      w: 0,
      h: inches(box.height),
      line: { color: hex(theme.colours.greyDark), width: 0.75, dashType: "dash" },
    });
  }

  // Crop every photo to its slot first, so the slide shows the same crop the
  // preview does. Done in parallel — six photos would otherwise load one by one.
  const cropped = await Promise.all(
    photos.map((photo) => coverCropToDataUrl(photo.url, cellWidth, cellHeight)),
  );

  photos.forEach((photo, index) => {
    const column = index % cols;
    const row = Math.floor(index / cols);
    slide.addImage({
      data: cropped[index],
      altText: photo.description,
      x: inches(right.x + column * (cellWidth + box.gap)),
      y: inches(box.y + row * (cellHeight + box.gap)),
      w: inches(cellWidth),
      h: inches(cellHeight),
    });
  });
}

/**
 * Build the slide and return it as a Blob ready to download.
 *
 * Photo URLs must be same-origin: PptxGenJS fetches each image to embed it, and
 * a cross-origin OneDrive URL is blocked by the browser. Photos therefore have
 * to reach the view model through our own origin.
 */
/** A deck sized to the newsletter, ready for one or many slides. */
async function newDeck(title: string) {
  const { default: PptxGenJSCtor } = await import("pptxgenjs");
  const pptx = new PptxGenJSCtor();
  pptx.defineLayout({
    name: "NEWSLETTER",
    width: inches(SLIDE_WIDTH_PX),
    height: inches(SLIDE_HEIGHT_PX),
  });
  pptx.layout = "NEWSLETTER";
  pptx.title = title;
  return pptx;
}

/**
 * Paint one newsletter onto a new slide of an existing deck.
 *
 * Shared by the single-unit export and the whole-cycle export, so a cycle's
 * slides can never drift from the one the owner previewed.
 */
async function addNewsletterSlide(
  pptx: PptxGenJS,
  view: NewsletterView,
  theme: NewsletterTheme,
): Promise<void> {
  const left = resolveLeftColumn(theme);
  const slide = pptx.addSlide();
  slide.background = { color: hex(PALETTE.white) };

  // El Gouna logo, top right.
  const logoH = theme.boxes.logoBox;
  panel(slide, pptx, { x: SLIDE_WIDTH_PX - 40 - 148, y: 18, w: 148, h: logoH }, PALETTE.greyPanel);
  slide.addImage({
    // The owner's own logo when they have set one, otherwise the shipped El
    // Gouna artwork. A data URL rather than a link, for the same reason photos
    // are same-origin: the exporters read pixels through a canvas.
    ...(theme.logo ? { data: theme.logo } : { path: "/newsletter/el-gouna-logo.png" }),
    x: inches(SLIDE_WIDTH_PX - 40 - 148 + 18),
    y: inches(18 + 8),
    w: inches(112),
    h: inches(logoH - 16),
    // `contain` scales the artwork to fit the frame WITHOUT distorting it — the
    // logo's proportions are never altered, whatever the box height.
    sizing: { type: "contain", w: inches(112), h: inches(logoH - 16) },
  });

  addLeftColumn(slide, pptx, view, theme, left);

  const chart = hasTimeSchedule(view.ganttRows)
    ? layoutGantt(view.ganttRows, right.width, theme.boxes.timelinePanel, {
        start: view.startDate,
        finish: view.finishDate,
      })
    : null;

  if (chart) {
    const blocks = withScheduleBlocks(chart.panelHeight, theme.gaps.belowLogo);
    addGantt(slide, pptx, view, chart, theme, theme.gaps.belowLogo);
    addStageTrack(slide, pptx, view, blocks.stageTrackY, right.width, theme);
    await addPhotos(
      slide,
      pptx,
      view,
      { y: blocks.photosY, height: blocks.photosHeight, gap: LAYOUT.withSchedule.photos.gap },
      { columns: 2 },
      theme,
    );
  } else {
    addStageTrack(
      slide,
      pptx,
      view,
      LAYOUT.withoutSchedule.stageTrack.y + theme.gaps.belowLogo,
      right.width - 172,
      theme,
    );
    await addPhotos(
      slide,
      pptx,
      view,
      {
        y: LAYOUT.withoutSchedule.photos.y + theme.gaps.belowLogo,
        height: LAYOUT.withoutSchedule.photos.height - theme.gaps.belowLogo,
        gap: LAYOUT.withoutSchedule.photos.gap,
      },
      { divider: true },
      theme,
    );
  }

  // Footer bar.
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: inches(footer.y),
    w: inches(SLIDE_WIDTH_PX),
    h: inches(footer.height),
    fill: { color: hex(theme.colours.greyDark) },
    line: { type: "none" },
  });
  text(
    slide,
    view.footerLabel,
    { x: 24, y: footer.y, w: 400, h: footer.height },
    { size: theme.text.footer, bold: true, colour: PALETTE.white },
  );
  text(
    slide,
    formatFooterDate(view.footerDate),
    { x: SLIDE_WIDTH_PX - 424, y: footer.y, w: 400, h: footer.height },
    { size: theme.text.footer, bold: true, colour: PALETTE.white, align: "right" },
  );
}

/** One newsletter as an editable slide. */
export async function buildNewsletterPptx(
  view: NewsletterView,
  theme: NewsletterTheme = DEFAULT_THEME,
): Promise<Blob> {
  const pptx = await newDeck(`${view.displayName} — ${view.footerLabel}`);
  await addNewsletterSlide(pptx, view, theme);
  return (await pptx.write({ outputType: "blob" })) as Blob;
}

/**
 * A whole cycle as ONE deck, a slide per unit.
 *
 * One file to open and send beats a folder of two hundred, and PowerPoint handles
 * a long deck comfortably. `onProgress` is reported per unit so a long run can
 * show where it is.
 */
export async function buildCyclePptx(
  items: readonly { view: NewsletterView; theme: NewsletterTheme }[],
  onProgress?: (done: number, total: number) => void,
): Promise<Blob> {
  const label = items[0]?.view.footerLabel ?? "Newsletters";
  const pptx = await newDeck(label);
  for (const [index, item] of items.entries()) {
    await addNewsletterSlide(pptx, item.view, item.theme);
    onProgress?.(index + 1, items.length);
  }
  return (await pptx.write({ outputType: "blob" })) as Blob;
}

/** A safe download filename, e.g. "Cyan 11 — 08 July 2026.pptx". */
export function pptxFileName(view: NewsletterView): string {
  const safe = view.displayName.replace(/[\\/:*?"<>|]/g, "-");
  return `${safe} - ${formatFooterDate(view.footerDate)}.pptx`;
}
