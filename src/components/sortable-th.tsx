"use client";

/**
 * A table heading you can click to sort by.
 *
 * For the tables the owner works IN rather than reads — Quick and the photo
 * import — where the columns are right there and clicking the one you mean is
 * quicker than finding it in a menu. Card lists use `SortMenu` instead.
 *
 * The arrow is only drawn on the column actually in use, so the header row does
 * not turn into a wall of arrows.
 */

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import type { SortOption, SortState } from "@/lib/sort";
import { nextSort } from "@/lib/sort";

export function SortableTh<Field extends string>({
  field,
  label,
  options,
  sort,
  onSort,
  align = "left",
  className = "",
}: {
  field: Field;
  label: string;
  options: readonly SortOption<Field>[];
  sort: SortState<Field>;
  onSort: (next: SortState<Field>) => void;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  const isActive = sort.field === field;
  const alignment =
    align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";

  return (
    <th className={`p-2 font-medium ${align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"} ${className}`}>
      <button
        type="button"
        onClick={() => onSort(nextSort(sort, field, options))}
        className={`hover:text-foreground flex w-full cursor-pointer items-center gap-1 ${alignment}`}
        aria-label={
          isActive
            ? `Sorted by ${label}, ${sort.direction === "asc" ? "smallest first" : "largest first"}. Click to reverse.`
            : `Sort by ${label}`
        }
      >
        {label}
        {isActive ? (
          sort.direction === "asc" ? (
            <ArrowUp className="h-3 w-3 shrink-0" />
          ) : (
            <ArrowDown className="h-3 w-3 shrink-0" />
          )
        ) : (
          <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-30" />
        )}
      </button>
    </th>
  );
}
