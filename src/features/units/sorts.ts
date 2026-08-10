/**
 * What the work screen can be ordered by.
 *
 * In its own module, not in `list.ts`, because the table is a CLIENT component:
 * importing this from the list would pull `server-only` — and with it the server
 * database client — into the browser bundle.
 */

import type { SortOption } from "@/lib/sort";

/**
 * Every one of these is a thing the screen actually shows, in either view.
 */
export const UNIT_SORTS = [
  { field: "name", label: "Unit name" },
  { field: "client", label: "Client name" },
  { field: "progress", label: "Progress", descendingFirst: true },
  { field: "verdict", label: "Status" },
  { field: "elapsed", label: "Days gone", descendingFirst: true },
  { field: "duration", label: "Duration", descendingFirst: true },
  { field: "zone", label: "Zone" },
  { field: "pm", label: "Project manager" },
  { field: "quotes", label: "Quotations ticked", descendingFirst: true },
  { field: "photos", label: "Photos chosen", descendingFirst: true },
  { field: "readiness", label: "What it still needs" },
  { field: "timeline", label: "Timeline" },
  { field: "patch", label: "Patch" },
  { field: "released", label: "Last released", descendingFirst: true },
  { field: "sent", label: "Last sent", descendingFirst: true },
] as const satisfies readonly SortOption<string>[];

export type UnitSortField = (typeof UNIT_SORTS)[number]["field"];
