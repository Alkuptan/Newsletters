"use client";

/**
 * The dashboard's filter bar.
 *
 * Filters live in the URL rather than in component state, so a filtered view can
 * be bookmarked, shared with a colleague, and survives a reload — which matters
 * when 317 units are being worked through over a morning.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export interface UnitFilterOptions {
  zones: string[];
  pms: string[];
}

const READINESS = [
  { value: "", label: "Any state" },
  { value: "ready", label: "Ready to send" },
  { value: "needs-photos", label: "Needs photos" },
  { value: "needs-quotes", label: "Nothing ticked" },
  { value: "complete", label: "Finished" },
] as const;

const TIMELINE = [
  { value: "", label: "Any timeline" },
  { value: "out-of-date", label: "Timeline out of date" },
  { value: "needs-timeline", label: "Needs a timeline" },
  { value: "has-timeline", label: "Has a timeline" },
  { value: "photos-only", label: "Photos only" },
  { value: "undecided", label: "Not decided yet" },
] as const;

export function UnitFilters({
  zones,
  pms,
  patches = [],
  children,
}: UnitFilterOptions & {
  patches?: string[];
  /** The sort menu, so filtering and sorting share one bar rather than two. */
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    startTransition(() => router.push(`/units?${next.toString()}`));
  }

  const anyApplied = ["q", "zone", "pm", "state", "done", "zero", "timeline", "patch"].some((key) =>
    params.get(key),
  );

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border p-3">
      <div className="space-y-1">
        <Label htmlFor="filter-q" className="text-xs">
          Search
        </Label>
        <Input
          id="filter-q"
          defaultValue={params.get("q") ?? ""}
          placeholder="Unit, name or client"
          className="h-8 w-52"
          // Enter rather than every keystroke: each change is a server round trip.
          onKeyDown={(event) => {
            if (event.key === "Enter") set("q", event.currentTarget.value.trim());
          }}
          onBlur={(event) => {
            const value = event.currentTarget.value.trim();
            if (value !== (params.get("q") ?? "")) set("q", value);
          }}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="filter-zone" className="text-xs">
          Zone
        </Label>
        <select
          id="filter-zone"
          value={params.get("zone") ?? ""}
          onChange={(event) => set("zone", event.target.value)}
          className="border-input bg-background h-8 w-44 rounded-md border px-2 text-sm"
        >
          <option value="">All zones</option>
          {zones.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <Label htmlFor="filter-pm" className="text-xs">
          Project manager
        </Label>
        <select
          id="filter-pm"
          value={params.get("pm") ?? ""}
          onChange={(event) => set("pm", event.target.value)}
          className="border-input bg-background h-8 w-44 rounded-md border px-2 text-sm"
        >
          <option value="">All managers</option>
          {pms.map((pm) => (
            <option key={pm} value={pm}>
              {pm}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <Label htmlFor="filter-state" className="text-xs">
          Readiness
        </Label>
        <select
          id="filter-state"
          value={params.get("state") ?? ""}
          onChange={(event) => set("state", event.target.value)}
          className="border-input bg-background h-8 w-40 rounded-md border px-2 text-sm"
        >
          {READINESS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {patches.length > 0 && (
        <div className="space-y-1">
          <Label htmlFor="filter-patch" className="text-xs">
            Patch
          </Label>
          <select
            id="filter-patch"
            value={params.get("patch") ?? ""}
            onChange={(event) => set("patch", event.target.value)}
            className="border-input bg-background h-8 w-32 rounded-md border px-2 text-sm"
          >
            <option value="">All patches</option>
            {patches.map((patch) => (
              <option key={patch} value={patch}>
                {patch}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="space-y-1">
        <Label htmlFor="filter-timeline" className="text-xs">
          Timeline
        </Label>
        <select
          id="filter-timeline"
          value={params.get("timeline") ?? ""}
          onChange={(event) => set("timeline", event.target.value)}
          className="border-input bg-background h-8 w-44 rounded-md border px-2 text-sm"
        >
          {TIMELINE.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5 pb-1">
        <label className="flex cursor-pointer items-center gap-1.5 text-xs">
          <Checkbox
            aria-label="Only units at 0%"
            checked={params.get("zero") === "1"}
            onCheckedChange={(checked) => set("zero", checked === true ? "1" : "")}
          />
          Only units at 0%
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs">
          <Checkbox
            aria-label="Include finished"
            checked={params.get("done") === "1"}
            onCheckedChange={(checked) => set("done", checked === true ? "1" : "")}
          />
          Include finished
        </label>
      </div>

      {children}

      {anyApplied && (
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => startTransition(() => router.push("/units"))}
        >
          Clear
        </Button>
      )}
      {pending && <span className="text-muted-foreground text-xs">Filtering…</span>}
    </div>
  );
}
