/**
 * The month ruler and activity bars.
 *
 * All positioning comes from `layoutGantt` in
 * `src/lib/newsletter/gantt-geometry.ts` — the same function the PowerPoint
 * exporter uses, so the slide and this preview cannot drift apart.
 */

import { layoutGantt } from "@/lib/newsletter/gantt-geometry";
import { LAYOUT, PALETTE } from "@/lib/newsletter/layout";
import type { NewsletterTheme } from "@/lib/newsletter/theme";

export function Gantt({
  x,
  width,
  chart,
  theme,
  topOffset = 0,
}: {
  x: number;
  width: number;
  /** Pre-computed so the page can place the blocks below it. */
  chart: NonNullable<ReturnType<typeof layoutGantt>>;
  theme: NewsletterTheme;
  /** The owner's adjustable space under the logo. Shifts the whole chart down. */
  topOffset?: number;
}) {
  const { band } = LAYOUT.withSchedule;

  return (
    <>
      {/* The year sits above the ruler, aligned to the chart. */}
      <div
        style={{
          position: "absolute",
          left: x + chart.chartLeft,
          top: LAYOUT.withSchedule.year.y + topOffset,
          fontSize: theme.text.ganttYear,
          fontWeight: 600,
          color: PALETTE.ganttYear,
        }}
      >
        {chart.year}
      </div>

      {/* Month ruler. */}
      <div
        style={{
          position: "absolute",
          left: x + chart.chartLeft,
          top: LAYOUT.withSchedule.monthRuler.y + topOffset,
          width: chart.chartWidth,
          height: LAYOUT.withSchedule.monthRuler.height,
          background: theme.colours.ganttHeader,
        }}
      >
        {chart.columns.map((month, index) => (
          <div
            key={`${month.year}-${month.label}`}
            style={{
              position: "absolute",
              left: month.x - chart.chartLeft,
              top: 0,
              width: month.width,
              height: "100%",
              display: "flex",
              alignItems: "center",
              paddingLeft: 8,
              fontSize: theme.text.ganttMonth,
              color: PALETTE.white,
              borderLeft: index === 0 ? "none" : "1px solid rgba(255,255,255,0.45)",
              boxSizing: "border-box",
            }}
          >
            {month.label}
          </div>
        ))}
      </div>

      {/* The bars panel. */}
      <div
        style={{
          position: "absolute",
          left: x,
          top: LAYOUT.withSchedule.ganttPanel.y + topOffset,
          width,
          height: chart.panelHeight,
          background: PALETTE.ganttPanel,
          borderRadius: 6,
        }}
      >
        {/* A faint line where each month begins, so a bar can be read against
            the ruler above without counting across. */}
        {chart.columns.map((month, index) =>
          index === 0 ? null : (
            <div
              key={`grid-${month.year}-${month.label}`}
              style={{
                position: "absolute",
                left: month.x,
                top: 0,
                width: 1,
                height: chart.panelHeight,
                background: theme.colours.ganttHeader,
                opacity: 0.25,
              }}
            />
          ),
        )}

        {chart.rows.map((row) => (
          <div key={row.label}>
            {/* The vertical band naming the scope of work. */}
            <div
              style={{
                position: "absolute",
                left: 6,
                top: row.y + 6,
                width: band.width,
                height: row.height - 12,
                background: theme.colours.ganttBand,
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span
                style={{
                  writingMode: "vertical-rl",
                  transform: "rotate(180deg)",
                  fontSize: theme.text.ganttBand,
                  fontWeight: 700,
                  color: PALETTE.white,
                  // Wrap rather than overflow: with only a few activities the
                  // band is short, and a long scope like "Arch. Modifications"
                  // used to run straight out of it.
                  maxHeight: row.height - 16,
                  textAlign: "center",
                  lineHeight: 1.15,
                  overflow: "hidden",
                }}
              >
                {row.label}
              </span>
            </div>

            {row.activities.map((activity, index) => (
              <div key={`${activity.name}-${index}`}>
                {/* Date range, right-aligned into the space before the bar —
                    wrapping to two lines when that space is tight, as in the
                    templates. */}
                <div
                  style={{
                    position: "absolute",
                    left: activity.labelX,
                    top: activity.barY - 3,
                    width: activity.labelWidth,
                    textAlign: "right",
                    fontSize: theme.text.ganttBarLabel * chart.textScale,
                    lineHeight: 1.05,
                    color: PALETTE.text,
                  }}
                >
                  {activity.rangeLabel}
                </div>

                <div
                  style={{
                    position: "absolute",
                    left: activity.barX,
                    top: activity.barY,
                    width: activity.barWidth,
                    height: activity.barHeight,
                    background:
                      activity.tone === "attention"
                        ? PALETTE.ganttBarAttention
                        : theme.colours.ganttBar,
                    borderRadius: 2,
                  }}
                />

                <div
                  style={{
                    position: "absolute",
                    left: activity.nameX,
                    top: activity.barY - 2,
                    width: activity.nameWidth,
                    fontSize: theme.text.ganttBarName * chart.textScale,
                    lineHeight: 1.1,
                    color: PALETTE.text,
                  }}
                >
                  {activity.name}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
