"use client";

/**
 * Two per-unit decisions that used to live only on the list: which patch it is
 * in, and pausing it.
 *
 * The owner reaches these while looking at the newsletter, not while scanning a
 * table of 152 rows, so they belong on the unit's own page too.
 *
 * **Pausing has an end date, never an open-ended "off".** "Not this week" is the
 * real intention, and a pause with no end is how a unit gets forgotten — so it
 * expires by itself and the unit comes back into the work list without anyone
 * having to remember it.
 */

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setUnitPatch } from "../patch-actions";
import { setUnitPause } from "../pause-actions";

/** Local date as yyyy-mm-dd — `toISOString` would shift the day in Egypt. */
function isoDay(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function plusDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return isoDay(date);
}

export function UnitShortcuts({
  unitId,
  patch: initialPatch,
  /** Patch names already in use, so the same one is picked rather than retyped. */
  knownPatches,
  pausedUntil: initialPausedUntil,
  canEdit,
}: {
  unitId: string;
  patch: string | null;
  knownPatches: string[];
  pausedUntil: string | null;
  canEdit: boolean;
}) {
  const [patch, setPatch] = useState(initialPatch ?? "");
  const [pausedUntil, setPausedUntil] = useState(initialPausedUntil ?? "");
  const [pending, startTransition] = useTransition();

  const today = isoDay(new Date());
  const activePause = pausedUntil !== "" && pausedUntil >= today;

  function savePatch(next: string) {
    setPatch(next);
    startTransition(async () => {
      const result = await setUnitPatch({ unitId, patch: next.trim() === "" ? null : next.trim() });
      if (result.ok) toast.success(next.trim() ? `Patch set to ${next.trim()}.` : "Patch cleared.");
      else toast.error(result.error);
    });
  }

  function savePause(next: string | null) {
    setPausedUntil(next ?? "");
    startTransition(async () => {
      const result = await setUnitPause({ unitId, pausedUntil: next });
      if (result.ok) {
        toast.success(next ? `Paused until ${next}.` : "No longer paused.");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor={`patch-${unitId}`} className="text-xs">
          Patch
        </Label>
        <Input
          id={`patch-${unitId}`}
          value={patch}
          list={`patches-${unitId}`}
          placeholder="Patch 1"
          disabled={!canEdit || pending}
          onChange={(event) => setPatch(event.target.value)}
          onBlur={(event) => {
            // Saved on leaving the field rather than per keystroke: a patch name
            // is a whole word, and saving "P", "Pa", "Pat" creates three names.
            if (event.target.value !== (initialPatch ?? "")) savePatch(event.target.value);
          }}
          className="h-8"
        />
        <datalist id={`patches-${unitId}`}>
          {knownPatches.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <p className="text-muted-foreground text-xs">
          Which run this unit goes out in. Saved when you click away.
        </p>
      </div>

      <div className="space-y-1">
        <Label htmlFor={`pause-${unitId}`} className="text-xs">
          Pause this unit
        </Label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id={`pause-${unitId}`}
            type="date"
            value={pausedUntil}
            min={today}
            disabled={!canEdit || pending}
            onChange={(event) => savePause(event.target.value || null)}
            className="h-8 w-40"
          />
          {canEdit && (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => savePause(plusDays(7))}
              >
                Next week
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => savePause(plusDays(14))}
              >
                Two weeks
              </Button>
              {pausedUntil && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => savePause(null)}
                >
                  Resume now
                </Button>
              )}
            </>
          )}
        </div>
        <p className="text-muted-foreground text-xs">
          {activePause
            ? `Paused until ${pausedUntil} — left out of "still to send" until then, and it comes back on its own.`
            : pausedUntil
              ? `That pause ended on ${pausedUntil}, so the unit is active again.`
              : "Skip it for now without losing it. The pause ends by itself."}
        </p>
      </div>
    </div>
  );
}
