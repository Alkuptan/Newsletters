"use client";

/**
 * "Sort by …" for a list of cards.
 *
 * The choice lives in the address bar rather than in component state, for the
 * same reason the filters do: a sorted view survives a reload, can be sent to a
 * colleague, and — on the Units screen — is the order Next / Previous walks.
 *
 * Every screen passes only the fields IT shows, so the menu can never offer to
 * sort by something that is not on the page.
 */

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SortOption, SortState } from "@/lib/sort";

export function SortMenu<Field extends string>({
  options,
  current,
}: {
  options: readonly SortOption<Field>[];
  current: SortState<Field>;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();

  function apply(next: SortState<Field>) {
    const query = new URLSearchParams(params.toString());
    query.set("sort", next.field);
    query.set("dir", next.direction);
    router.push(`${pathname}?${query}`);
  }

  const active = options.find((option) => option.field === current.field);

  return (
    <div className="flex items-end gap-1">
      <div className="space-y-1">
        <label htmlFor="sort-field" className="text-muted-foreground block text-xs">
          Sort by
        </label>
        <select
          id="sort-field"
          value={current.field}
          onChange={(event) => {
            const field = event.target.value as Field;
            const option = options.find((candidate) => candidate.field === field);
            // A new column starts on its own natural direction — progress is
            // useful biggest-first, a name is not.
            apply({ field, direction: option?.descendingFirst ? "desc" : "asc" });
          }}
          className="border-input bg-background h-8 w-44 rounded-md border px-2 text-sm"
        >
          {options.map((option) => (
            <option key={option.field} value={option.field}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-8"
        onClick={() =>
          apply({
            field: current.field,
            direction: current.direction === "asc" ? "desc" : "asc",
          })
        }
        title={
          current.direction === "asc"
            ? `${active?.label ?? "Sorted"}: smallest first — click for largest first`
            : `${active?.label ?? "Sorted"}: largest first — click for smallest first`
        }
        aria-label={`Sorting ${current.direction === "asc" ? "ascending" : "descending"}. Click to reverse.`}
      >
        {current.direction === "asc" ? (
          <ArrowUpNarrowWide className="h-4 w-4" />
        ) : (
          <ArrowDownWideNarrow className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}
