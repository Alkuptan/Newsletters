"use client";

/**
 * The whole programme as one table.
 *
 * The dense half of the work screen: every unit, every column both the old
 * Units and Quick screens showed, and the two controls that actually change
 * something — which patch a unit is in, and whether its newsletter has gone out.
 *
 * Rows arrive already sorted and filtered by the server, so the ordering here
 * matches the address bar and matches what Next / Previous will walk.
 */

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { setUnitPatch, setUnitSent } from "@/features/units/patch-actions";
import { SCHEDULE_STATE_LABELS, type ScheduleState } from "@/lib/newsletter/schedule-state";
import { SortableTh } from "@/components/sortable-th";
import { UNIT_SORTS, type UnitSortField } from "@/features/units/sorts";
import type { SortState } from "@/lib/sort";

/** Which column heading orders by which field. The Sent column is a control. */
const COLUMNS: {
  field: UnitSortField;
  label: string;
  align?: "left" | "right" | "center";
}[] = [
  { field: "name", label: "Unit" },
  { field: "patch", label: "Patch" },
  { field: "readiness", label: "State" },
  { field: "progress", label: "Progress", align: "right" },
  { field: "timeline", label: "Timeline" },
  { field: "pm", label: "Project manager" },
  { field: "photos", label: "Photos", align: "right" },
  { field: "released", label: "Last released", align: "right" },
  { field: "sent", label: "Last sent", align: "right" },
];

const NO_PATCH = "__none__";

const STATE_LABELS: Record<string, string> = {
  ready: "Ready",
  "needs-photos": "Needs photos",
  "needs-quotes": "Nothing ticked",
  "not-started": "Not started",
  complete: "Complete",
};

const STATE_STYLES: Record<string, string> = {
  ready: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  "needs-photos": "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  "needs-quotes": "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  // Not started and complete both mean "nothing owed", so both read as quiet.
  "not-started": "bg-muted text-muted-foreground",
  complete: "bg-muted text-muted-foreground",
};

export interface UnitRow {
  id: string;
  displayName: string;
  unitCode: string;
  clientName: string | null;
  zone: string;
  assignedPm: string | null;
  patch: string | null;
  state: string;
  timeline: ScheduleState;
  progressPercent: number;
  verdict: string | null;
  quotesIncluded: number;
  quotesTotal: number;
  photos: number;
  lastReleased: string | null;
  lastSent: string | null;
  sentThisCycle: boolean;
  needsNewsletter: boolean;
  canWrite: boolean;
}

/** "12 Aug" for this year, "12 Aug 2025" otherwise. Never a raw timestamp. */
function shortDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: sameYear ? undefined : "numeric",
  });
}

export function UnitTable({
  rows: incoming,
  patches,
  editionId,
  suffix,
  sort,
}: {
  rows: UnitRow[];
  patches: string[];
  editionId: string | null;
  /** The current filters, so opening a unit keeps the run it came from. */
  suffix: string;
  /** Which column the server ordered by, so the arrow sits on the right one. */
  sort: SortState<UnitSortField>;
}) {
  const router = useRouter();
  const params = useSearchParams();

  /*
    Headings order through the ADDRESS, not through local state: the ordering has
    to match what the server sent, and it is the same ordering Next / Previous
    walks on a unit's own page.
  */
  function orderBy(next: SortState<UnitSortField>) {
    const query = new URLSearchParams(params.toString());
    query.set("sort", next.field);
    query.set("dir", next.direction);
    router.push(`/units?${query}`);
  }

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
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-muted-foreground text-xs">
          <tr>
            {COLUMNS.map((column) => (
              <SortableTh
                key={column.field}
                field={column.field}
                label={column.label}
                options={UNIT_SORTS}
                sort={sort}
                onSort={orderBy}
                align={column.align}
              />
            ))}
            <th className="p-2 text-center font-medium">Sent</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row.id} className={row.sentThisCycle ? "opacity-60" : undefined}>
              <td className="p-2">
                <Link href={`/units/${row.id}${suffix}`} className="font-medium hover:underline">
                  {row.displayName}
                </Link>
                <span className="text-muted-foreground block text-xs">
                  {row.unitCode} · {row.quotesIncluded}/{row.quotesTotal} quotes
                </span>
              </td>
              <td className="p-2">
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
              </td>
              <td className="p-2">
                <span
                  className={`rounded px-1.5 py-0.5 text-xs font-medium ${STATE_STYLES[row.state] ?? ""}`}
                >
                  {STATE_LABELS[row.state] ?? row.state}
                </span>
              </td>
              <td className="p-2 text-right tabular-nums">
                {row.progressPercent}%
                <span className="text-muted-foreground block text-xs">{row.verdict ?? "—"}</span>
              </td>
              <td className="p-2">
                <Badge variant={row.timeline === "out-of-date" ? "destructive" : "outline"}>
                  {SCHEDULE_STATE_LABELS[row.timeline]}
                </Badge>
              </td>
              <td className="text-muted-foreground p-2 text-xs">{row.assignedPm ?? "—"}</td>
              <td className="p-2 text-right tabular-nums">{row.photos}</td>
              <td className="text-muted-foreground p-2 text-right text-xs tabular-nums">
                {shortDate(row.lastReleased)}
              </td>
              <td className="text-muted-foreground p-2 text-right text-xs tabular-nums">
                {shortDate(row.lastSent)}
              </td>
              <td className="p-2 text-center">
                {row.needsNewsletter ? (
                  <Checkbox
                    checked={row.sentThisCycle}
                    disabled={!row.canWrite || pending || !editionId}
                    onCheckedChange={(checked) => toggleSent(row, checked === true)}
                    aria-label={`Mark ${row.displayName} as sent`}
                  />
                ) : (
                  // Nothing is owed for finished or not-yet-started work, so there
                  // is no tick to chase.
                  <span className="text-muted-foreground text-xs">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
