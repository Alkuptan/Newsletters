/**
 * The five-stage track: Initiation → Design → Quotation → Construction → Hand
 * Over, with the unit's current stage filled orange.
 *
 * Icons are the ones lifted out of the supplied templates, so the track is the
 * same artwork the client already recognises.
 */

import { LAYOUT, PALETTE, stageIconPath } from "@/lib/newsletter/layout";
import type { NewsletterTheme } from "@/lib/newsletter/theme";
import { STAGES, STAGE_LABELS, type Stage } from "@/lib/newsletter/types";

const CIRCLE = 46;

export function StageTrack({
  stage,
  y,
  x,
  width,
  theme,
}: {
  stage: Stage;
  y: number;
  x: number;
  width: number;
  theme: NewsletterTheme;
}) {
  const step = width / STAGES.length;

  return (
    <div style={{ position: "absolute", left: x, top: y, width, height: LAYOUT.withSchedule.stageTrack.height }}>
      {/* The connector runs behind the circles, inset by half a step so it
          starts and ends at the first and last icon rather than the edges. */}
      <div
        style={{
          position: "absolute",
          left: step / 2,
          top: CIRCLE / 2 - 1,
          width: width - step,
          height: 2,
          background: PALETTE.orangeSoft,
        }}
      />

      {STAGES.map((candidate, index) => {
        const isCurrent = candidate === stage;
        return (
          <div
            key={candidate}
            style={{
              position: "absolute",
              left: index * step,
              top: 0,
              width: step,
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: CIRCLE,
                height: CIRCLE,
                margin: "0 auto",
                borderRadius: "50%",
                border: `2px solid ${theme.colours.orange}`,
                background: isCurrent ? theme.colours.orange : PALETTE.white,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size
                  static asset on a canvas that must rasterise identically for the
                  JPG and PDF exports; next/image would inject a wrapper and lazy
                  loading that break the capture. */}
              <img src={stageIconPath(candidate, isCurrent)} alt="" width={28} height={28} />
            </div>
            <div
              style={{
                marginTop: 8,
                fontSize: theme.text.stageLabel,
                fontWeight: 700,
                color: PALETTE.text,
                whiteSpace: "nowrap",
              }}
            >
              {STAGE_LABELS[candidate]}
            </div>
          </div>
        );
      })}
    </div>
  );
}
