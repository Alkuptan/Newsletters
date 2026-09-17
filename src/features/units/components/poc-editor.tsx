"use client";

/**
 * Choose the progress figure the newsletter prints for this unit.
 *
 * The sheet's figure is money-weighted across the ticked quotations, which is
 * the right default and regularly not what the owner would tell the client: the
 * sheet lags the site, a row can read 100% with a snag list open, and one
 * badly-kept quotation drags a whole unit down.
 *
 * Both figures stay on screen, always. An override that hid the sheet's value
 * would be indistinguishable from a stale one months later — see the drift note
 * below, which is the same bargain Area of Concern makes.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setUnitPoc } from "@/features/units/actions";
import { setPocSchema } from "@/features/units/schema";

/** How far apart the two figures must be before the drift is worth flagging. */
const DRIFT_POINTS = 5;

export function PocEditor({
  unitId,
  sheetPercent,
  savedOverride,
  canEdit,
}: {
  unitId: string;
  /** The money-weighted figure from the sheet, 0–100, already rounded. */
  sheetPercent: number;
  /** What is stored, or null when this unit follows the sheet. */
  savedOverride: number | null;
  canEdit: boolean;
}) {
  const [useSheet, setUseSheet] = useState(savedOverride === null);
  /*
    Held as text, not a number. A number state cannot represent "" or a
    half-typed "7." without either snapping the caret or turning the box into 0
    under the owner's fingers, and 0 is a real answer here.
  */
  const [typed, setTyped] = useState(savedOverride === null ? "" : String(savedOverride));
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /** What would be stored right now, or `undefined` while the box is unusable. */
  function intended(): number | null | undefined {
    if (useSheet) return null;
    const trimmed = typed.trim();
    if (trimmed === "") return undefined;
    const value = Number(trimmed);
    return Number.isFinite(value) ? value : undefined;
  }

  const wanted = intended();
  const unsaved = wanted !== undefined && wanted !== savedOverride;

  const saveRef = useRef<(next: number | null) => void>(() => {});

  function save(next: number | null) {
    setProblem(null);
    const payload = { id: unitId, pocPercent: next };
    const check = setPocSchema.safeParse(payload);
    if (!check.success) {
      setProblem(check.error.issues[0]?.message ?? "That is not a percentage.");
      return;
    }
    startTransition(async () => {
      const result = await setUnitPoc(payload);
      if (!result.ok) {
        setProblem(result.error);
        toast.error(result.error);
        return;
      }
      toast.success(
        next === null ? "Progress now follows the sheet." : `Progress set to ${next}%.`,
      );
    });
  }

  /*
    Autosave, debounced — the owner asked not to press Save, and the same 900ms
    as the Design screen so dragging a figure from 60 to 80 writes once rather
    than twenty times. `pending` stops a slow save being overlapped by the next.
  */
  useEffect(() => {
    if (!canEdit || !unsaved || pending) return;
    const timer = setTimeout(() => {
      const next = intended();
      if (next !== undefined) saveRef.current(next);
    }, 900);
    return () => clearTimeout(timer);
    // `intended` is recreated each render; the values it reads are listed instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, unsaved, pending, useSheet, typed]);

  useEffect(() => {
    saveRef.current = save;
  });

  /*
    The half of the bargain that makes an override safe to keep.

    A figure typed in August is still printed in December, and by then the sheet
    may say something quite different. Nobody goes looking for that, so it is put
    on screen instead — the same reason Area of Concern shows its divergence.
  */
  const shown = savedOverride === null ? sheetPercent : savedOverride;
  const drifted = savedOverride !== null && Math.abs(savedOverride - sheetPercent) >= DRIFT_POINTS;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold">Progress (POC)</h2>

      <p className="text-muted-foreground text-xs">
        The newsletter shows <strong>{shown}%</strong>.
      </p>

      <div className="space-y-2">
        <label className="flex items-start gap-2 text-xs">
          <input
            type="radio"
            className="mt-0.5"
            name={`poc-${unitId}`}
            checked={useSheet}
            disabled={!canEdit}
            onChange={() => setUseSheet(true)}
          />
          <span>
            <span className="font-medium">From the sheet — {sheetPercent}%</span>
            <span className="text-muted-foreground block">
              Money-weighted across the ticked quotations.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2 text-xs">
          <input
            type="radio"
            className="mt-0.5"
            name={`poc-${unitId}`}
            checked={!useSheet}
            disabled={!canEdit}
            onChange={() => setUseSheet(false)}
          />
          <span className="flex-1">
            <span className="font-medium">My figure</span>
            <span className="mt-1 flex items-center gap-1">
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                inputMode="decimal"
                className="border-input w-20 rounded-md border px-2 py-1 text-xs"
                value={typed}
                /*
                  NOT disabled while "From the sheet" is chosen, which is what
                  it was at first. A disabled input cannot be clicked or
                  focused, so the obvious action — click the box and type —
                  silently did nothing, and the radio had to be found first.
                  Typing here switches the choice instead.
                */
                disabled={!canEdit}
                placeholder={String(sheetPercent)}
                onChange={(event) => {
                  setTyped(event.target.value);
                  if (event.target.value.trim() !== "") setUseSheet(false);
                }}
                aria-label="Progress percent"
              />
              <span className="text-muted-foreground">%</span>
            </span>
          </span>
        </label>
      </div>

      {problem && <p className="text-xs text-red-600 dark:text-red-400">{problem}</p>}

      {drifted && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Your figure is {savedOverride}% and the sheet now says {sheetPercent}%. Yours is what the
          client sees.
        </p>
      )}

      {!useSheet && (
        <p className="text-muted-foreground text-xs">
          The Status pill follows this figure too, so the ring and the verdict agree. A unit is
          still only <strong>Completed</strong> when its quotations say so — typing 100 does not
          close it.
        </p>
      )}

      {canEdit && savedOverride !== null && (
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => {
            setUseSheet(true);
            setTyped("");
            save(null);
          }}
        >
          Go back to the sheet&apos;s figure
        </Button>
      )}
    </div>
  );
}
