/**
 * Export the whole cycle.
 *
 * Everyone signed in can export — it reads, it does not write, and the board and
 * upper management are meant to be able to take a copy. A project manager sees
 * only their own units, because the query runs under RLS.
 */

import { requireSessionPage } from "@/lib/supabase/dal";
import { BatchExport } from "@/features/newsletters/components/batch-export";
import { ExportFilterBar } from "@/features/newsletters/components/export-filters";
import { listReadyNewsletters } from "@/features/newsletters/export-queries";
import { latestEdition, listUnitFacets } from "@/features/units/queries";
import { formatFooterDate, fromIsoDate } from "@/lib/newsletter/dates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Export" };

export default async function ExportPage({
  searchParams,
}: {
  searchParams: Promise<{
    zone?: string;
    pm?: string;
    patch?: string;
    unsent?: string;
    complete?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  await requireSessionPage();
  const filters = await searchParams;

  const [{ items, cappedAt, sort }, edition, facets] = await Promise.all([
    listReadyNewsletters({
      zone: filters.zone,
      assignedPm: filters.pm,
      patch: filters.patch,
      unsentOnly: filters.unsent === "1",
      includeComplete: filters.complete === "1",
      sort: filters.sort,
      dir: filters.dir,
    }),
    latestEdition(),
    listUnitFacets(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Export</h1>
        <p className="text-muted-foreground text-sm">
          {edition
            ? `${edition.footer_label} · ${formatFooterDate(fromIsoDate(edition.footer_date)!)}`
            : "No cycle opened yet — newsletters fall back to today's date."}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Everything that is ready</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Three ways out: one PowerPoint with a slide per unit, one PDF with a page per
            unit, or a separate PDF and image for every unit &mdash; named &ldquo;Ancient Hill
            56 newsletter&rdquo; and delivered in a single zip. Untick anything you would
            rather leave out. For a single unit, use the buttons on its own page.
          </p>

          <ExportFilterBar
            patches={facets.patches}
            zones={facets.zones}
            pms={facets.pms}
            sort={sort}
          />

          <BatchExport items={items} cappedAt={cappedAt} editionId={edition?.id} />
        </CardContent>
      </Card>
    </div>
  );
}
