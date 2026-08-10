/**
 * The work screen: every unit, what each still needs, and the two things you
 * actually change — which patch it is in, and whether its newsletter has gone
 * out.
 *
 * This was two screens (Units and Quick) doing the same job from two angles.
 * They are one screen with a table/cards switch, because deciding "does this
 * need a newsletter?" and "has it gone out?" is one thought, not two.
 *
 * A project manager sees only their own units — enforced by RLS, so this page
 * has no filtering of its own to forget.
 */

import { requireSessionPage } from "@/lib/supabase/dal";
import { latestEdition, listUnitFacets, currentPmAliases } from "@/features/units/queries";
import { listFilteredUnits, type UnitListFilters } from "@/features/units/list";
import { UNIT_SORTS } from "@/features/units/sorts";
import { canWriteUnit } from "@/features/units/permissions";
import { SortMenu } from "@/components/sort-menu";
import { ViewSwitch, type ViewMode } from "@/components/view-switch";
import { UnitFilters } from "@/features/units/components/unit-filters";
import { UnitTable, type UnitRow } from "@/features/units/components/unit-table";
import { UnitCards } from "@/features/units/components/unit-cards";
import { PatchAdder } from "@/features/units/components/patch-adder";
import { tidyZone } from "@/lib/newsletter/display-name";
import { formatFooterDate, fromIsoDate } from "@/lib/newsletter/dates";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export const metadata = { title: "Units" };

export default async function UnitsPage({
  searchParams,
}: {
  searchParams: Promise<UnitListFilters & { view?: string }>;
}) {
  const user = await requireSessionPage();
  const filters = await searchParams;
  const view: ViewMode = filters.view === "cards" ? "cards" : "table";

  const [{ units, all, showFinished, sort }, facets, edition, aliases] = await Promise.all([
    listFilteredUnits(filters),
    listUnitFacets(),
    latestEdition(),
    currentPmAliases(),
  ]);

  /*
    Links carry the current filters, so opening a unit from "needs photos" lands
    on a page that knows it is 4 of 133 — and whose Next walks that run rather
    than the whole programme.
  */
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (typeof value === "string" && value) query.set(key, value);
  }
  const suffix = query.size > 0 ? `?${query}` : "";

  const rows: UnitRow[] = units.map((row) => ({
    id: row.unit.id,
    displayName: row.unit.display_name,
    unitCode: row.unit.unit_code,
    clientName: row.unit.client_name,
    // Tidied, not raw: the query emits "Ancient Hill" and "Ancient hill" for the
    // same place.
    zone: tidyZone(row.unit.zone),
    assignedPm: row.unit.assigned_pm,
    patch: row.unit.patch,
    state: row.state,
    timeline: row.timeline,
    progressPercent: row.figures.progressPercent,
    verdict: row.figures.verdict,
    quotesIncluded: row.included.length,
    quotesTotal: row.unit.quotations.length,
    photos: row.photos,
    lastReleased: row.lastReleased,
    lastSent: row.lastSent,
    sentThisCycle: Boolean(
      edition &&
      row.unit.edition_units?.some(
        (link) => link.edition_id === edition.id && link.sent_at !== null,
      ),
    ),
    needsNewsletter: row.needsNewsletter,
    canWrite: canWriteUnit(user, row.unit, aliases),
  }));

  const owed = rows.filter((r) => r.needsNewsletter && !r.sentThisCycle).length;

  // A patch typed but not yet used by any unit still has to reach the dropdowns.
  const patches =
    filters.newpatch && !facets.patches.includes(filters.newpatch)
      ? [...facets.patches, filters.newpatch].sort((a, b) =>
          a.localeCompare(b, undefined, { numeric: true }),
        )
      : facets.patches;

  /*
    The Export screen, narrowed the same way. One click from "these are the units
    I owe" to the files themselves.
  */
  const exportQuery = new URLSearchParams();
  if (filters.patch) exportQuery.set("patch", filters.patch);
  if (filters.zone) exportQuery.set("zone", filters.zone);
  if (filters.pm) exportQuery.set("pm", filters.pm);
  exportQuery.set("unsent", "1");
  const exportHref = `/export?${exportQuery}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Units</h1>
          <p className="text-muted-foreground text-sm">
            {edition
              ? `${edition.footer_label} · ${formatFooterDate(fromIsoDate(edition.footer_date)!)}`
              : "No cycle opened yet — open one before recording anything as sent."}
          </p>
        </div>
        <div className="text-right">
          <p className="text-muted-foreground text-sm">
            {units.length === all.length
              ? `${units.length} unit${units.length === 1 ? "" : "s"}`
              : `${units.length} of ${all.length} units`}
          </p>
          <p className="text-muted-foreground text-xs">
            {owed === 0 ? "nothing outstanding here" : `${owed} still to send`}
          </p>
        </div>
      </div>

      <UnitFilters zones={facets.zones} pms={facets.pms} patches={patches}>
        <PatchAdder patches={patches} />
        <SortMenu options={UNIT_SORTS} current={sort} />
        <ViewSwitch current={view} />
        <Button asChild size="sm" className="h-8 self-end">
          {/* Straight to the batch export, narrowed the same way this list is. */}
          <Link href={exportHref}>Export this list</Link>
        </Button>
      </UnitFilters>

      {units.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center text-sm">
            {all.length === 0 && !filters.q && !filters.zone && !filters.pm
              ? "No units yet. Upload the follow-up sheet to fill this in."
              : all.length > 0 && !showFinished
                ? "Nothing matches. Every unit that does is already finished — tick “Include finished” to see them."
                : "No units match those filters."}
          </CardContent>
        </Card>
      ) : view === "cards" ? (
        <UnitCards rows={rows} patches={patches} editionId={edition?.id ?? null} suffix={suffix} />
      ) : (
        <UnitTable
          rows={rows}
          patches={patches}
          editionId={edition?.id ?? null}
          suffix={suffix}
          sort={sort}
        />
      )}
    </div>
  );
}
