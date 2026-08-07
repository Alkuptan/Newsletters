"use client";

// Teaches: the list pattern — the shared <DataTable> + tanstack column defs,
// and filter state that lives in the URL (?status=...). The Server Component
// page re-queries on every URL change, links are shareable, and the back
// button works — no useState/useEffect data fetching in the client.

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/data-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ItemWithCreator } from "../queries"; // type-only: erased, so importing from a server-only module is safe
import { STATUS_LABELS, STATUS_ORDER } from "../status-machine";
import { StatusBadge } from "./status-badge";

// Fixed locale + UTC so the server and the browser render the same string —
// locale/timezone-sensitive formatting is a classic hydration-mismatch source.
const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeZone: "UTC",
});

// Column defs live at module scope: stable identity, zero re-creation per render.
const columns: ColumnDef<ItemWithCreator>[] = [
  {
    accessorKey: "title",
    header: "Title",
    cell: ({ row }) => (
      <Link href={`/example-items/${row.original.id}`} className="font-medium hover:underline">
        {row.original.title}
      </Link>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    id: "creator",
    header: "Created by",
    cell: ({ row }) => row.original.created_by_profile?.full_name ?? "—",
  },
  {
    accessorKey: "created_at",
    header: "Created",
    cell: ({ row }) => dateFormatter.format(new Date(row.original.created_at)),
  },
];

export function ItemsTable({ items }: { items: ItemWithCreator[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // "all" is a UI-only sentinel — the URL simply omits ?status for it
  // (Radix Select does not allow an empty-string item value).
  const status = searchParams.get("status") ?? "all";

  // replace (not push): tweaking a filter should not pile up history entries.
  function onStatusChange(value: string) {
    const params = new URLSearchParams(searchParams);
    if (value === "all") {
      params.delete("status");
    } else {
      params.set("status", value);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className="space-y-4">
      <Select value={status} onValueChange={onStatusChange}>
        <SelectTrigger className="w-44">
          <SelectValue placeholder="Filter by status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {STATUS_ORDER.map((s) => (
            <SelectItem key={s} value={s}>
              {STATUS_LABELS[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <DataTable
        columns={columns}
        data={items}
        emptyMessage="No items yet. Create the first one."
      />
    </div>
  );
}
