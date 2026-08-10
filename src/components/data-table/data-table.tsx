"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type DataTableProps<TData, TValue> = {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  emptyMessage?: string;
};

/**
 * Minimal generic table: columns + data in, shadcn Table out.
 *
 * Sorting is built in — every list in this tool can be ordered by what it shows,
 * and a table's own headers are the obvious place to click. A column opts out
 * with `enableSorting: false` (an actions column, say). Still no pagination:
 * add TanStack pagination when a list outgrows one page (see
 * docs/template/RECIPES.md), not before.
 */
export function DataTable<TData, TValue>({
  columns,
  data,
  emptyMessage = "No results.",
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <TableHead key={header.id}>
                {header.isPlaceholder ? null : header.column.getCanSort() ? (
                  <button
                    type="button"
                    onClick={header.column.getToggleSortingHandler()}
                    className="hover:text-foreground flex cursor-pointer items-center gap-1"
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getIsSorted() === "asc" ? (
                      <ArrowUp className="h-3 w-3 shrink-0" />
                    ) : header.column.getIsSorted() === "desc" ? (
                      <ArrowDown className="h-3 w-3 shrink-0" />
                    ) : (
                      <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-30" />
                    )}
                  </button>
                ) : (
                  flexRender(header.column.columnDef.header, header.getContext())
                )}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
              {emptyMessage}
            </TableCell>
          </TableRow>
        ) : (
          table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
