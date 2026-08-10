"use client";

/**
 * "Sort by …" for a list that lives entirely in the browser.
 *
 * Same control as `SortMenu`, but the choice is handed back to the caller
 * instead of written into the address bar — for lists that were never in the URL
 * to begin with, where adding a query string would be pretending the page can be
 * shared in that state.
 */

import { ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SortOption, SortState } from "@/lib/sort";

export function SortMenuLocal<Field extends string>({
  options,
  current,
  onChange,
  id = "sort-field-local",
}: {
  options: readonly SortOption<Field>[];
  current: SortState<Field>;
  onChange: (next: SortState<Field>) => void;
  /** Needed when two of these appear on one screen. */
  id?: string;
}) {
  const active = options.find((option) => option.field === current.field);

  return (
    <div className="flex items-end gap-1">
      <div className="space-y-1">
        <label htmlFor={id} className="text-muted-foreground block text-xs">
          Sort by
        </label>
        <select
          id={id}
          value={current.field}
          onChange={(event) => {
            const field = event.target.value as Field;
            const option = options.find((candidate) => candidate.field === field);
            onChange({ field, direction: option?.descendingFirst ? "desc" : "asc" });
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
          onChange({
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
