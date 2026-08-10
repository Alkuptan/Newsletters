/**
 * How the export list can be ordered.
 *
 * In its own module, not in `export-queries.ts`, because the filter bar is a
 * CLIENT component: importing this from the query file would pull `server-only`
 * — and with it the server Supabase client — into the browser bundle.
 */

import type { SortOption } from "@/lib/sort";

/** What the tick list shows, and so what it can be ordered by. */
export const EXPORT_SORTS = [
  { field: "name", label: "Unit name" },
  { field: "progress", label: "Progress", descendingFirst: true },
  { field: "verdict", label: "Status" },
] as const satisfies readonly SortOption<string>[];

export type ExportSortField = (typeof EXPORT_SORTS)[number]["field"];
