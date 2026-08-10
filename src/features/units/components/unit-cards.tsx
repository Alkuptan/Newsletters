"use client";

/**
 * The whole programme as cards.
 *
 * The roomier half of the work screen. Same information as the table and the
 * same two controls — the patch and the sent tick — so switching view never
 * costs you the ability to do something.
 *
 * The card is not one big link any more: it now contains a dropdown and a
 * checkbox, and nesting those inside an anchor makes them unusable. The unit
 * name is the link instead.
 */

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { setUnitPatch, setUnitSent } from "@/features/units/patch-actions";
import { SCHEDULE_STATE_LABELS } from "@/lib/newsletter/schedule-state";
import type { UnitRow } from "./unit-table";

const NO_PATCH = "__none__";

const VERDICT_STYLES: Record<string, string> = {
  AHEAD: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  "ON TRACK": "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  BEHIND: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  COMPLETED: "bg-muted text-muted-foreground",
};

function shortDate(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: sameYear ? undefined : "numeric",
  });
}

export function UnitCards({
  rows: incoming,
  patches,
  editionId,
  suffix,
}: {
  rows: UnitRow[];
  patches: string[];
  editionId: string | null;
  suffix: string;
}) {
  /*
    Only the optimistic overrides live in state — never the list itself.
    `useState(rows)` captures the FIRST value and ignores every later one, so
    filtering or sorting changed the address, refetched correctly on the server,
    and then rendered the previous answer. Overrides are keyed by unit and layer
    on top of whatever the server most recently sent.
  */
  const [overrides, setOverrides] = useState<Record<string, Partial<UnitRow>>>({});
  const rows = incoming.map((row) => (overrides[row.id] ? { ...row, ...overrides[row.id] } : row));
  const [pending, startTransition] = useTransition();

  function override(id: string, patch: Partial<UnitRow>) {
    setOverrides((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  }

  function undo(id: string, keys: (keyof UnitRow)[]) {
    setOverrides((current) => {
      const next = { ...current };
      if (next[id]) {
        const entry = { ...next[id] };
        for (const k of keys) delete entry[k];
        if (Object.keys(entry).length === 0) delete next[id];
        else next[id] = entry;
      }
      return next;
    });
  }

  function changePatch(row: UnitRow, value: string) {
    const patch = value === NO_PATCH ? null : value;
    override(row.id, { patch });
    startTransition(async () => {
      const result = await setUnitPatch({ unitId: row.id, patch });
      if (!result.ok) {
        undo(row.id, ["patch"]);
        toast.error(result.error);
      }
    });
  }

  function toggleSent(row: UnitRow, sent: boolean) {
    if (!editionId) {
      toast.error("Open a cycle first — there is nothing to record against.");
      return;
    }
    override(row.id, { sentThisCycle: sent });
    startTransition(async () => {
      const result = await setUnitSent({ editionId, unitId: row.id, sent });
      if (!result.ok) {
        undo(row.id, ["sentThisCycle"]);
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((row) => (
        <Card key={row.id} className="h-full">
          <CardContent className="space-y-3 py-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link
                  href={`/units/${row.id}${suffix}`}
                  className="block truncate font-medium hover:underline"
                >
                  {row.displayName}
                </Link>
                <p className="text-muted-foreground truncate text-xs">
                  {row.clientName ?? "No client name yet"}
                </p>
              </div>
              {row.verdict && (
                <span
                  className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${VERDICT_STYLES[row.verdict] ?? ""}`}
                >
                  {row.verdict}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-baseline gap-x-3 text-sm">
              <span className="text-2xl font-semibold">{row.progressPercent}%</span>
              <span className="text-muted-foreground text-xs">
                {row.quotesIncluded}/{row.quotesTotal} quotes · {row.photos} photos
              </span>
            </div>

            <div className="text-muted-foreground flex flex-wrap gap-1.5 text-xs">
              <Badge variant="secondary">{row.zone || "no zone"}</Badge>
              <Badge
                variant={row.timeline === "out-of-date" ? "destructive" : "outline"}
                title={
                  row.timeline === "out-of-date"
                    ? "The sheet moved a date under a timeline built to the old one."
                    : undefined
                }
              >
                {SCHEDULE_STATE_LABELS[row.timeline]}
              </Badge>
            </div>

            <div className="text-muted-foreground grid grid-cols-2 gap-1 text-xs">
              <span>Released: {shortDate(row.lastReleased)}</span>
              <span>Sent: {shortDate(row.lastSent)}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t pt-2">
              <select
                value={row.patch ?? NO_PATCH}
                disabled={!row.canWrite || pending}
                onChange={(event) => changePatch(row, event.target.value)}
                className="border-input bg-background h-7 rounded border px-1 text-xs"
                aria-label={`Patch for ${row.displayName}`}
              >
                <option value={NO_PATCH}>— none —</option>
                {patches.map((patch) => (
                  <option key={patch} value={patch}>
                    {patch}
                  </option>
                ))}
              </select>

              {row.needsNewsletter ? (
                <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs">
                  <Checkbox
                    checked={row.sentThisCycle}
                    disabled={!row.canWrite || pending || !editionId}
                    onCheckedChange={(checked) => toggleSent(row, checked === true)}
                    aria-label={`Mark ${row.displayName} as sent`}
                  />
                  Sent
                </label>
              ) : (
                <span className="text-muted-foreground ml-auto text-xs">nothing owed</span>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
