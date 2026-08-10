"use client";

/**
 * Open a new cycle, and correct the wording or date of an existing one.
 *
 * The edition with the latest footer date is the one every newsletter uses, so
 * this screen says so plainly rather than leaving it to be inferred.
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SortMenuLocal } from "@/components/sort-menu-local";
import { sortRows, type SortOption, type SortState } from "@/lib/sort";

/** What a cycle row shows: its wording, its date, and whether it is in use. */
const SORTS = [
  { field: "date", label: "Footer date", descendingFirst: true },
  { field: "label", label: "Footer wording" },
  { field: "status", label: "Status" },
] as const satisfies readonly SortOption<string>[];

type CycleSortField = (typeof SORTS)[number]["field"];
import { createEdition, updateEdition } from "../actions";
import { createEditionSchema, type EditionStatus } from "../schema";

export interface EditionListItem {
  id: string;
  footerLabel: string;
  footerDate: string;
  status: EditionStatus;
  createdBy: string | null;
}

/** Sensible wordings, matching the supplied samples. */
const LABEL_SUGGESTIONS = ["Bi-Weekly Newsletter", "Weekly Newsletter", "Monthly Newsletter"];

function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function EditionManager({
  editions,
  canManage,
  /** Today, passed in so the server and browser agree on the default. */
  todayIso,
}: {
  editions: EditionListItem[];
  canManage: boolean;
  todayIso: string;
}) {
  const [label, setLabel] = useState(editions[0]?.footerLabel ?? LABEL_SUGGESTIONS[0]);
  const [date, setDate] = useState(todayIso);
  const [problem, setProblem] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState<CycleSortField>>({
    field: "date",
    direction: "desc",
  });
  const [editing, setEditing] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editDate, setEditDate] = useState("");
  const [pending, startTransition] = useTransition();

  const active = editions[0];

  function create() {
    setProblem(null);
    const payload = { footerLabel: label, footerDate: date };
    const check = createEditionSchema.safeParse(payload);
    if (!check.success) {
      setProblem(check.error.issues[0]?.message ?? "Something is not right.");
      return;
    }
    startTransition(async () => {
      const result = await createEdition(payload);
      if (!result.ok) {
        setProblem(result.error);
        toast.error(result.error);
        return;
      }
      toast.success(`New cycle opened for ${formatDate(date)}. Every newsletter now uses it.`);
    });
  }

  function saveEdit(id: string) {
    startTransition(async () => {
      const result = await updateEdition({ id, footerLabel: editLabel, footerDate: editDate });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setEditing(null);
      toast.success("Edition updated.");
    });
  }

  // Newest first by default: the cycle being worked on is the one wanted.
  const ordered = sortRows(
    editions,
    (edition) => {
      switch (sort.field) {
        case "label":
          return edition.footerLabel;
        case "status":
          return edition.status;
        default:
          return edition.footerDate;
      }
    },
    sort.direction,
    (edition) => edition.footerDate,
  );

  return (
    <div className="space-y-6">
      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Open a new cycle</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-muted-foreground text-sm">
              The footer date is what every unit&apos;s elapsed time is measured to, so opening a
              cycle moves the numbers on every newsletter at once.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor="edition-label" className="text-xs">
                  Footer wording
                </Label>
                <Input
                  id="edition-label"
                  list="edition-label-options"
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  className="h-8 w-60"
                />
                <datalist id="edition-label-options">
                  {LABEL_SUGGESTIONS.map((suggestion) => (
                    <option key={suggestion} value={suggestion} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1">
                <Label htmlFor="edition-date" className="text-xs">
                  Footer date
                </Label>
                <Input
                  id="edition-date"
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className="h-8 w-[9.5rem]"
                />
              </div>
              <Button size="sm" onClick={create} disabled={pending}>
                {pending ? "Opening…" : "Open cycle"}
              </Button>
            </div>
            {problem && <p className="text-destructive text-xs">{problem}</p>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Cycles</CardTitle>
        </CardHeader>
        <CardContent>
          {editions.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No cycle opened yet. Newsletters fall back to today&apos;s date until one exists.
            </p>
          ) : (
            <>
            <div className="pb-2">
              <SortMenuLocal options={SORTS} current={sort} onChange={setSort} />
            </div>
            <ul className="divide-y">
              {ordered.map((edition) => (
                <li key={edition.id} className="space-y-2 py-3">
                  {editing === edition.id ? (
                    <div className="flex flex-wrap items-end gap-2">
                      <Input
                        value={editLabel}
                        onChange={(event) => setEditLabel(event.target.value)}
                        className="h-8 w-56"
                        aria-label="Footer wording"
                      />
                      <Input
                        type="date"
                        value={editDate}
                        onChange={(event) => setEditDate(event.target.value)}
                        className="h-8 w-[9.5rem]"
                        aria-label="Footer date"
                      />
                      <Button size="sm" onClick={() => saveEdit(edition.id)} disabled={pending}>
                        Save
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">
                          <Link href={`/editions/${edition.id}`} className="hover:underline">
                            {edition.footerLabel}
                          </Link>
                          {edition.id === active?.id && (
                            <span className="bg-primary/10 text-primary ml-2 rounded px-1.5 py-0.5 text-xs font-semibold">
                              in use
                            </span>
                          )}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {formatDate(edition.footerDate)}
                          {edition.createdBy ? ` · opened by ${edition.createdBy}` : ""}
                        </p>
                      </div>
                      {canManage && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditing(edition.id);
                            setEditLabel(edition.footerLabel);
                            setEditDate(edition.footerDate);
                          }}
                        >
                          Change
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
