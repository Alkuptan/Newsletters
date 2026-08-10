/**
 * What changed since the last cycle.
 *
 * The point of this screen is subtraction: out of 150 units, look at the eleven
 * that moved. A project manager sees only their own, because the query runs
 * under RLS.
 */

import Link from "next/link";
import { requireSessionPage } from "@/lib/supabase/dal";
import { CHANGE_SORTS, loadChanges } from "@/features/changes/queries";
import { SortMenu } from "@/components/sort-menu";
import { formatFooterDate, fromIsoDate } from "@/lib/newsletter/dates";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "What changed" };

/** The changes that mean "do something", called what they are. */
const ACTION_LABELS: Record<string, string> = {
  "schedule-stale": "Timeline out of date",
  progress: "Progress went backwards",
  verdict: "Slipped behind",
  "finish-date": "Finish date moved",
  concerns: "New concern",
};

export default async function ChangesPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; dir?: string }>;
}) {
  await requireSessionPage();
  const board = await loadChanges(await searchParams);

  const needing = board.units.filter((unit) => unit.needsAction);
  const dateOf = (iso: string) => formatFooterDate(fromIsoDate(iso)!);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">What changed</h1>
        <p className="text-muted-foreground text-sm">
          {board.comparedWith ? (
            <>
              {board.current ? `${board.current.label} · ${dateOf(board.current.date)}` : "Now"}{" "}
              compared with {board.comparedWith.label} · {dateOf(board.comparedWith.date)}
            </>
          ) : (
            "No earlier cycle to compare with yet — this fills in once a second cycle is open."
          )}
        </p>
      </div>

      {board.units.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center text-sm">
            {board.comparedWith
              ? `Nothing moved. All ${board.scanned} units read the same as they did last cycle.`
              : "This is the first cycle, so there is nothing to compare against yet. Open the next one and this screen fills in."}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-md border p-2">
              <p className="text-muted-foreground text-xs">Units that moved</p>
              <p className="text-xl font-semibold">{board.units.length}</p>
            </div>
            <div className="rounded-md border p-2">
              <p className="text-muted-foreground text-xs">Need you to do something</p>
              <p className="text-xl font-semibold">{needing.length}</p>
            </div>
            <div className="rounded-md border p-2">
              <p className="text-muted-foreground text-xs">Units read</p>
              <p className="text-xl font-semibold">{board.scanned}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3 rounded-md border p-3">
            <SortMenu options={CHANGE_SORTS} current={board.sort} />
          </div>

          <ul className="space-y-2">
            {board.units.map((unit) => (
              <li key={unit.id}>
                <Card className={unit.needsAction ? "border-amber-300 dark:border-amber-800" : ""}>
                  <CardContent className="space-y-2 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/units/${unit.id}`}
                        className="font-medium hover:underline"
                      >
                        {unit.displayName}
                      </Link>
                      <span className="text-muted-foreground text-xs">{unit.unitCode}</span>
                      {unit.patch && <Badge variant="secondary">{unit.patch}</Badge>}
                      {unit.assignedPm && (
                        <span className="text-muted-foreground ml-auto text-xs">
                          {unit.assignedPm}
                        </span>
                      )}
                    </div>
                    <ul className="space-y-1 text-sm">
                      {unit.changes.map((change, index) => (
                        <li key={index} className="flex flex-wrap items-baseline gap-2">
                          {change.needsAction && (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                              {ACTION_LABELS[change.kind] ?? "Look at this"}
                            </span>
                          )}
                          <span
                            className={
                              change.needsAction ? "" : "text-muted-foreground"
                            }
                          >
                            {change.summary}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
