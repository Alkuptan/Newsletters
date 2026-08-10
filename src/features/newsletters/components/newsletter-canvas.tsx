/**
 * One newsletter, drawn at a fixed 1280 × 720 — the same size as the supplied
 * `CY-11 Newsletter.jpg`, and exactly PowerPoint's 13.333 × 7.5 inches.
 *
 * The stage never reflows. Everything is absolutely positioned from
 * `src/lib/newsletter/layout.ts`, so the on-screen preview, the exported JPG and
 * the exported PDF are the same picture, and the PowerPoint exporter can read
 * the same coordinates. To show it smaller, scale the whole thing with a CSS
 * transform — never by changing the layout.
 */

import { formatFooterDate } from "@/lib/newsletter/dates";
import { layoutGantt } from "@/lib/newsletter/gantt-geometry";
import {
  LAYOUT,
  PALETTE,
  SLIDE_HEIGHT_PX,
  SLIDE_WIDTH_PX,
  withScheduleBlocks,
} from "@/lib/newsletter/layout";
import { DEFAULT_THEME, resolveLeftColumn, type NewsletterTheme } from "@/lib/newsletter/theme";
import { hasTimeSchedule, type NewsletterView } from "@/lib/newsletter/view-model";
import { Gantt } from "./gantt";
import { LeftColumn } from "./left-column";
import { PhotoGrid } from "./photo-grid";
import { StageTrack } from "./stage-track";

/**
 * Marks the element the exporters capture.
 *
 * A data attribute rather than an id, because a page can show several
 * newsletters at once and duplicate ids would be invalid — and would make the
 * export buttons capture the wrong one.
 */
export const NEWSLETTER_CANVAS_ATTR = "data-newsletter-canvas";

export function NewsletterCanvas({
  view,
  /** 1 renders at full size; 0.5 fits two side by side on a laptop. */
  scale = 1,
  /** The resolved design. Defaults to the original, so callers can omit it. */
  theme = DEFAULT_THEME,
}: {
  view: NewsletterView;
  scale?: number;
  theme?: NewsletterTheme;
}) {
  const withSchedule = hasTimeSchedule(view.ganttRows);
  const { right } = LAYOUT;

  // Laid out once here so the stage track and photos know where the Gantt panel
  // ended — a short schedule pulls them up and the photos grow into the space.
  const chart = withSchedule
    ? layoutGantt(view.ganttRows, right.width, theme.boxes.timelinePanel, {
        start: view.startDate,
        finish: view.finishDate,
      })
    : null;
  const blocks = withScheduleBlocks(
    chart?.panelHeight ?? theme.boxes.timelinePanel,
    theme.gaps.belowLogo,
  );
  // Positions for the left column, stacked from the theme's box heights.
  const column = resolveLeftColumn(theme);

  return (
    // The outer box reserves the scaled footprint so surrounding page layout is
    // not thrown out by the transform, which does not affect flow size.
    <div
      style={{
        width: SLIDE_WIDTH_PX * scale,
        height: SLIDE_HEIGHT_PX * scale,
        overflow: "hidden",
      }}
    >
      <div
        {...{ [NEWSLETTER_CANVAS_ATTR]: "" }}
        style={{
          position: "relative",
          width: SLIDE_WIDTH_PX,
          height: SLIDE_HEIGHT_PX,
          background: PALETTE.white,
          // Aptos is PowerPoint's default and what the templates use; the rest
          // are fallbacks so a machine without it still renders sensibly.
          fontFamily: "Aptos, 'Segoe UI', Calibri, system-ui, sans-serif",
          color: PALETTE.text,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        {/* El Gouna logo, top right. The box height is adjustable; the logo
            itself is only ever scaled to FIT it, never stretched — its
            proportions are fixed artwork. */}
        <div
          style={{
            position: "absolute",
            right: 40,
            top: 18,
            width: 148,
            height: theme.boxes.logoBox,
            background: PALETTE.greyPanel,
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 8,
            boxSizing: "border-box",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- see stage-track.tsx */}
          <img
            src={theme.logo ?? "/newsletter/el-gouna-logo.png"}
            alt="Logo"
            /*
              `contain` with BOTH dimensions at 100%: the artwork keeps its own
              proportions and grows until one edge touches the box, rather than
              being capped by whichever edge happened to be smaller. That is what
              made it sit shorter than the box it is in.
            */
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        </div>

        <LeftColumn view={view} theme={theme} column={column} />

        {withSchedule && chart ? (
          <>
            <Gantt
              x={right.x}
              width={right.width}
              chart={chart}
              theme={theme}
              topOffset={theme.gaps.belowLogo}
            />
            <StageTrack
              stage={view.stage}
              x={right.x}
              y={blocks.stageTrackY}
              width={right.width}
              theme={theme}
            />
            <PhotoGrid
              photos={view.photos.slice(0, 2)}
              x={right.x}
              y={blocks.photosY}
              width={right.width}
              // A short schedule ends higher up, so the photos get the space.
              height={blocks.photosHeight}
              gap={LAYOUT.withSchedule.photos.gap}
              columns={2}
              theme={theme}
            />
          </>
        ) : (
          <>
            <StageTrack
              stage={view.stage}
              x={right.x}
              y={LAYOUT.withoutSchedule.stageTrack.y + theme.gaps.belowLogo}
              width={right.width - 172}
              theme={theme}
            />
            <PhotoGrid
              photos={view.photos.slice(0, 6)}
              x={right.x}
              y={LAYOUT.withoutSchedule.photos.y + theme.gaps.belowLogo}
              width={right.width}
              height={LAYOUT.withoutSchedule.photos.height - theme.gaps.belowLogo}
              gap={LAYOUT.withoutSchedule.photos.gap}
              showDivider
              theme={theme}
            />
          </>
        )}

        {/* Footer bar: the owner's label on the left, the date on the right. */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: LAYOUT.footer.y,
            width: SLIDE_WIDTH_PX,
            height: LAYOUT.footer.height,
            background: theme.colours.greyDark,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 24px",
            boxSizing: "border-box",
            color: PALETTE.white,
            fontSize: theme.text.footer,
            fontWeight: 700,
          }}
        >
          <span>{view.footerLabel}</span>
          <span>{formatFooterDate(view.footerDate)}</span>
        </div>
      </div>
    </div>
  );
}
