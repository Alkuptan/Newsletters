"use client";

/**
 * A newsletter plus its three export buttons.
 *
 * A client component because exporting happens entirely in the browser: the JPG
 * and PDF are rasterised from this very element, and the PowerPoint is assembled
 * here too. All three libraries are loaded with dynamic `import()` on first
 * click, so a visitor who never exports never downloads them — and none of them
 * reach the Cloudflare Worker bundle.
 */

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SLIDE_HEIGHT_PX, SLIDE_WIDTH_PX } from "@/lib/newsletter/layout";
import type { NewsletterTheme } from "@/lib/newsletter/theme";
import type { NewsletterView } from "@/lib/newsletter/view-model";
import { NEWSLETTER_CANVAS_ATTR, NewsletterCanvas } from "./newsletter-canvas";

type Format = "jpg" | "pdf" | "pptx";

const LABELS: Record<Format, string> = {
  jpg: "Download JPG",
  pdf: "Download PDF",
  pptx: "Download PowerPoint",
};

/**
 * @param previewScale how large to SHOW the newsletter. Exports ignore this
 *   entirely: the rasteriser is pinned to the 1280 × 720 stage and the
 *   PowerPoint is built from measurements, so a shrunken preview still produces
 *   a full-size JPG, PDF and slide.
 */
export function NewsletterExport({
  view,
  previewScale = 1,
  theme,
  /** Recording what was sent needs both — omit either and nothing is recorded. */
  editionId,
  unitId,
}: {
  view: NewsletterView;
  previewScale?: number;
  /** The resolved design. Omitted means the original. */
  theme?: NewsletterTheme;
  editionId?: string | null;
  unitId?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<Format | null>(null);

  async function run(format: Format) {
    if (busy) return;
    setBusy(format);
    try {
      const { exportNewsletterJpg, exportNewsletterPdf, exportNewsletterPptx } = await import(
        "@/lib/newsletter/raster"
      );

      if (format === "pptx") {
        await exportNewsletterPptx(view, theme);
      } else {
        const canvas = containerRef.current?.querySelector<HTMLElement>(
          `[${NEWSLETTER_CANVAS_ATTR}]`,
        );
        if (!canvas) throw new Error("The newsletter is not on screen yet.");
        if (format === "jpg") await exportNewsletterJpg(canvas, view);
        else await exportNewsletterPdf(canvas, view);
      }

      // Freeze what was sent, so reopening this cycle later shows the client
      // what they received rather than today's figures. Bookkeeping only: a
      // failure here must not make a successful export look broken.
      if (editionId && unitId) {
        try {
          const [{ recordUnitExport }, { serialiseNewsletter }, { DEFAULT_THEME }] =
            await Promise.all([
              import("@/features/editions/record-export"),
              import("@/lib/newsletter/snapshot"),
              import("@/lib/newsletter/theme"),
            ]);
          await recordUnitExport({
            editionId,
            unitId,
            snapshot: serialiseNewsletter(view, theme ?? DEFAULT_THEME),
          });
        } catch {
          // Silent on purpose — the owner has their file.
        }
      }

      toast.success(`${view.displayName} exported as ${format.toUpperCase()}.`);
    } catch (error) {
      // Exports run in the browser, so there is no server action Result here —
      // but the rule still holds: the user gets a sentence, not a stack trace.
      const detail = error instanceof Error ? error.message : "Unknown problem.";
      toast.error(`Could not export the ${format.toUpperCase()}. ${detail}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(["jpg", "pdf", "pptx"] as const).map((format) => (
          <Button
            key={format}
            variant={format === "pptx" ? "default" : "outline"}
            size="sm"
            disabled={busy !== null}
            onClick={() => run(format)}
          >
            {busy === format ? "Preparing…" : LABELS[format]}
          </Button>
        ))}
      </div>

      {/* The canvas itself always renders at full size — the wrapper reserves
          the scaled footprint so the page does not gain a scrollbar. */}
      {/* overflow hidden matters: the inner box keeps its full 1280 × 720 layout
          size and is only scaled visually, so without clipping it overhangs its
          container and swallows clicks on whatever is beside it. */}
      <div
        style={{
          width: SLIDE_WIDTH_PX * previewScale,
          height: SLIDE_HEIGHT_PX * previewScale,
          overflow: "hidden",
        }}
        className="bg-white shadow-sm"
      >
        <div
          ref={containerRef}
          style={{
            width: SLIDE_WIDTH_PX,
            height: SLIDE_HEIGHT_PX,
            transform: `scale(${previewScale})`,
            transformOrigin: "top left",
          }}
        >
          <NewsletterCanvas view={view} theme={theme} />
        </div>
      </div>
    </div>
  );
}
