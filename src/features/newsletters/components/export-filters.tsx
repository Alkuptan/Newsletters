"use client";

/**
 * The narrowing controls above a batch export.
 *
 * They only change the address bar — the page is a Server Component, so picking
 * a patch re-runs the query rather than hiding rows in the browser. That way the
 * 120-unit batch cap counts what the owner actually asked for.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { Checkbox } from "@/components/ui/checkbox";
import { SortMenu } from "@/components/sort-menu";
import { EXPORT_SORTS, type ExportSortField } from "../export-sorts";
import type { SortState } from "@/lib/sort";

export function ExportFilterBar({
  patches,
  zones,
  pms,
  sort,
}: {
  patches: string[];
  zones: string[];
  pms: string[];
  sort: SortState<ExportSortField>;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function set(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(next.size > 0 ? `/export?${next}` : "/export");
  }

  const select = "border-input bg-background h-8 rounded-md border px-2 text-sm";

  // The address may name a patch no unit is in yet — arriving from Quick with a
  // name just typed. The query still filters by it, so the picker must show it
  // rather than silently reading "All patches".
  const current = params.get("patch");
  const patchOptions = current && !patches.includes(current) ? [current, ...patches] : patches;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border p-3">
      {patchOptions.length > 0 && (
        <select
          className={select}
          aria-label="Patch"
          value={current ?? ""}
          onChange={(event) => set("patch", event.target.value || null)}
        >
          <option value="">All patches</option>
          {patchOptions.map((patch) => (
            <option key={patch} value={patch}>
              {patch}
            </option>
          ))}
        </select>
      )}
      {zones.length > 0 && (
        <select
          className={select}
          aria-label="Zone"
          value={params.get("zone") ?? ""}
          onChange={(event) => set("zone", event.target.value || null)}
        >
          <option value="">All zones</option>
          {zones.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
      )}
      {pms.length > 0 && (
        <select
          className={select}
          aria-label="Project manager"
          value={params.get("pm") ?? ""}
          onChange={(event) => set("pm", event.target.value || null)}
        >
          <option value="">All project managers</option>
          {pms.map((pm) => (
            <option key={pm} value={pm}>
              {pm}
            </option>
          ))}
        </select>
      )}
      <label className="flex cursor-pointer items-center gap-1.5 text-xs">
        <Checkbox
          checked={params.get("unsent") === "1"}
          onCheckedChange={(checked) => set("unsent", checked === true ? "1" : null)}
        />
        Only what is not sent yet
      </label>
      <label className="flex cursor-pointer items-center gap-1.5 text-xs">
        <Checkbox
          checked={params.get("complete") === "1"}
          onCheckedChange={(checked) => set("complete", checked === true ? "1" : null)}
        />
        Include finished units
      </label>
      <div className="ml-auto">
        <SortMenu options={EXPORT_SORTS} current={sort} />
      </div>
    </div>
  );
}
