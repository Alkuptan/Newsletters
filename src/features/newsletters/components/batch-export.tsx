"use client";

/**
 * Export a whole cycle in one go.
 *
 * Three shapes: one PowerPoint with a slide per unit, one PDF with a page per
 * unit, or a separate PDF and image for every unit inside a zip.
 *
 * The PDF and the per-unit files have to rasterise each newsletter from the DOM,
 * which means each one must be laid out for real — an element with `display:
 * none` has no size and cannot be captured. Mounting a hundred of them at once
 * is what makes a laptop crawl, so they are mounted a FEW AT A TIME: render a
 * window, capture it, unmount it, move on. Peak memory is the window, not the
 * batch.
 */

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SLIDE_HEIGHT_PX, SLIDE_WIDTH_PX } from "@/lib/newsletter/layout";
import type { NewsletterTheme } from "@/lib/newsletter/theme";
import type { NewsletterView } from "@/lib/newsletter/view-model";
import { NEWSLETTER_CANVAS_ATTR, NewsletterCanvas } from "./newsletter-canvas";

export interface BatchItem {
  unitId: string;
  unitCode: string;
  displayName: string;
  view: NewsletterView;
  theme: NewsletterTheme;
}

/**
 * How many newsletters are laid out at once.
 *
 * Each is a full 1280 × 720 page with its photos decoded, so this is the real
 * memory knob. Eight keeps a batch moving without a laptop noticing.
 */
const WINDOW_SIZE = 8;

/** Windows-safe, and dated so two cycles never collide. */
function fileNameFor(items: readonly BatchItem[], extension: string): string {
  const first = items[0]?.view;
  const label = (first?.footerLabel ?? "Newsletters").replace(/[\\/:*?"<>|]/g, "-");
  const date = first
    ? `${first.footerDate.getFullYear()}-${String(first.footerDate.getMonth() + 1).padStart(2, "0")}-${String(first.footerDate.getDate()).padStart(2, "0")}`
    : "cycle";
  return `${label} ${date} (${items.length} units).${extension}`;
}

export function BatchExport({
  items,
  cappedAt,
  editionId,
}: {
  items: BatchItem[];
  cappedAt: number | null;
  /** Needed to record what was sent; omitted means nothing is recorded. */
  editionId?: string | null;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set(items.map((i) => i.unitId)));
  const [busy, setBusy] = useState<"pptx" | "pdf" | "files" | null>(null);
  const [progress, setProgress] = useState("");

  /** The newsletters currently laid out off-screen. Empty when idle. */
  const [window_, setWindow] = useState<BatchItem[]>([]);
  /** Resolved once React has committed the window above. */
  const windowCommitted = useRef<(() => void) | null>(null);

  useEffect(() => {
    const resolve = windowCommitted.current;
    windowCommitted.current = null;
    resolve?.();
  }, [window_]);

  const selected = items.filter((item) => chosen.has(item.unitId));

  function toggle(unitId: string) {
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(unitId)) next.delete(unitId);
      else next.add(unitId);
      return next;
    });
  }

  /**
   * Lay out one window of newsletters and hand back their elements, in the
   * caller's order, only once every photo in them has decoded — a page captured
   * before its photos land comes out blank.
   */
  async function layOut(chunk: BatchItem[]): Promise<HTMLElement[]> {
    await new Promise<void>((resolve) => {
      windowCommitted.current = resolve;
      setWindow(chunk);
    });
    // A commit is not a paint. Two frames gives the browser one to lay out and
    // one to draw before anything is read back.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const stage = stageRef.current;
    const canvases = [...(stage?.querySelectorAll<HTMLElement>(`[${NEWSLETTER_CANVAS_ATTR}]`) ?? [])];
    const ordered = chunk.map((item) => canvases.find((c) => c.dataset.unitId === item.unitId));
    if (ordered.some((element) => !element)) {
      throw new Error("Some newsletters did not finish rendering — try again.");
    }

    await Promise.all(
      [...(stage?.querySelectorAll("img") ?? [])].map((img) =>
        img.complete && img.naturalWidth > 0
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.addEventListener("load", () => resolve(), { once: true });
              // A photo that fails to load must not stall the whole batch.
              img.addEventListener("error", () => resolve(), { once: true });
            }),
      ),
    );

    return ordered as HTMLElement[];
  }

  async function run(format: "pptx" | "pdf" | "files") {
    if (busy) return;
    if (selected.length === 0) {
      toast.error("Tick at least one unit.");
      return;
    }
    setBusy(format);
    setProgress("Preparing…");
    try {
      if (format === "pptx") {
        // Built from the view models, never from the DOM, so nothing is mounted.
        const { exportCyclePptx } = await import("@/lib/newsletter/raster");
        await exportCyclePptx(selected, fileNameFor(selected, "pptx"), (done, total) =>
          setProgress(`${done} of ${total}`),
        );
      } else {
        const { createCyclePdf, createPerUnitZip } = await import("@/lib/newsletter/raster");
        const pdf = format === "pdf" ? await createCyclePdf() : null;
        const zip = format === "files" ? await createPerUnitZip() : null;

        for (let start = 0; start < selected.length; start += WINDOW_SIZE) {
          const chunk = selected.slice(start, start + WINDOW_SIZE);
          setProgress(`${start} of ${selected.length}`);
          const elements = await layOut(chunk);
          for (const [index, element] of elements.entries()) {
            if (pdf) await pdf.addPage(element);
            else await zip!.add(chunk[index].displayName, element);
            setProgress(`${start + index + 1} of ${selected.length}`);
          }
        }
        // Nothing needs laying out any more; free it before writing the file.
        setWindow([]);

        setProgress("Saving…");
        if (pdf) pdf.save(fileNameFor(selected, "pdf"));
        else await zip!.finish(fileNameFor(selected, "zip"));
      }

      // Freeze each one as sent. Bookkeeping only — the file is already saved.
      if (editionId) {
        setProgress("Recording…");
        try {
          const [{ recordUnitExport }, { serialiseNewsletter }] = await Promise.all([
            import("@/features/editions/record-export"),
            import("@/lib/newsletter/snapshot"),
          ]);
          for (const item of selected) {
            await recordUnitExport({
              editionId,
              unitId: item.unitId,
              snapshot: serialiseNewsletter(item.view, item.theme),
            });
          }
        } catch {
          // Silent on purpose.
        }
      }

      toast.success(
        format === "files"
          ? `${selected.length} newsletter${selected.length === 1 ? "" : "s"} exported — unzip for a PDF and an image each.`
          : `${selected.length} newsletter${selected.length === 1 ? "" : "s"} exported as one ${format.toUpperCase()}.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not build that export.");
    } finally {
      setWindow([]);
      setBusy(null);
      setProgress("");
    }
  }

  if (items.length === 0) {
    return (
      <p className="text-muted-foreground rounded-md border border-dashed p-4 text-sm">
        Nothing is ready to send yet. A unit is ready when it has at least one ticked
        quotation and at least one chosen photo.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {cappedAt !== null && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          More than {cappedAt} units are ready. This batch covers the first {cappedAt} by
          name — filter by patch, zone or project manager to reach the rest.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => run("pptx")} disabled={busy !== null}>
          {busy === "pptx" ? `Building… ${progress}` : `One PowerPoint (${selected.length} slides)`}
        </Button>
        <Button variant="outline" onClick={() => run("pdf")} disabled={busy !== null}>
          {busy === "pdf" ? `Building… ${progress}` : `One PDF (${selected.length} pages)`}
        </Button>
        <Button variant="outline" onClick={() => run("files")} disabled={busy !== null}>
          {busy === "files"
            ? `Building… ${progress}`
            : `A PDF + image per unit (${selected.length} units)`}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy !== null}
          onClick={() =>
            setChosen(
              chosen.size === items.length ? new Set() : new Set(items.map((i) => i.unitId)),
            )
          }
        >
          {chosen.size === items.length ? "Untick all" : "Tick all"}
        </Button>
      </div>

      <ul className="grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <li key={item.unitId}>
            <label className="hover:bg-muted/50 flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm">
              <Checkbox
                checked={chosen.has(item.unitId)}
                disabled={busy !== null}
                onCheckedChange={() => toggle(item.unitId)}
                aria-label={`Include ${item.displayName}`}
              />
              <span className="truncate">{item.displayName}</span>
              <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                {item.view.progressPercent}% · {item.view.verdict ?? "—"}
              </span>
            </label>
          </li>
        ))}
      </ul>

      {/*
        The current window, rendered but out of sight so it can be captured.
        Kept in the layout (not `display: none`) because an element with no box
        cannot be rasterised; pushed off-screen and made inert instead.
      */}
      <div
        ref={stageRef}
        aria-hidden
        style={{
          position: "fixed",
          left: -20000,
          top: 0,
          width: SLIDE_WIDTH_PX,
          pointerEvents: "none",
          opacity: 0,
        }}
      >
        {window_.map((item) => (
          <div
            key={item.unitId}
            style={{ width: SLIDE_WIDTH_PX, height: SLIDE_HEIGHT_PX }}
            data-unit-wrapper={item.unitId}
          >
            <NewsletterCanvasWithId item={item} />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The canvas, tagged with its unit so the pages can be put in the owner's chosen
 * order rather than DOM order.
 */
function NewsletterCanvasWithId({ item }: { item: BatchItem }) {
  return (
    <div
      ref={(node) => {
        const canvas = node?.querySelector<HTMLElement>(`[${NEWSLETTER_CANVAS_ATTR}]`);
        if (canvas) canvas.dataset.unitId = item.unitId;
      }}
    >
      <NewsletterCanvas view={item.view} theme={item.theme} />
    </div>
  );
}
