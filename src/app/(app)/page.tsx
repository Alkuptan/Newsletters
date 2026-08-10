import Link from "next/link";
import { requireSessionPage } from "@/lib/supabase/dal";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { canUploadSheet } from "@/features/units/permissions";
import { latestEdition, listUnits } from "@/features/units/queries";
import { aggregateQuotations } from "@/lib/newsletter/aggregate";
import { toQuotationFigures } from "@/features/newsletters/to-view";
import { formatFooterDate, fromIsoDate } from "@/lib/newsletter/dates";

// Route groups don't affect URLs, so (app)/page.tsx serves "/" — inside the
// auth-gated shell. currentUser() is cached per request, so this second
// lookup after the layout gate costs nothing.
export default async function HomePage() {
  const user = await requireSessionPage();
  const firstName = user.full_name.split(" ")[0] || user.full_name;

  const [units, edition] = await Promise.all([listUnits(), latestEdition()]);

  /*
    Exactly the states the Units and Quick screens use, in the same order —
    counting finished units among "ready" made this page disagree with every
    other screen, on more than half the programme.
  */
  const asOf = edition ? (fromIsoDate(edition.footer_date) ?? new Date()) : new Date();
  let ready = 0;
  let needsPhotos = 0;
  let nothingTicked = 0;
  let complete = 0;
  for (const unit of units) {
    const ticked = unit.quotations.filter((q) => q.include_in_newsletter);
    const photos = unit.unit_photos.filter((p) => p.is_selected).length;
    if (ticked.length === 0) {
      nothingTicked += 1;
      continue;
    }
    const figures = aggregateQuotations(
      ticked.map((q) => toQuotationFigures(q, unit.assigned_pm)),
      asOf,
    );
    if (figures.isComplete) complete += 1;
    else if (photos === 0) needsPhotos += 1;
    else ready += 1;
  }
  const needAnything = units.length - complete;

  return (
    <>
      <PageHeader
        title={`Hello, ${firstName}`}
        description={
          edition
            ? `${edition.footer_label} · ${formatFooterDate(fromIsoDate(edition.footer_date)!)}`
            : "No cycle opened yet."
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>This cycle</CardTitle>
          <CardDescription>
            {units.length === 0
              ? "No units yet."
              : `${needAnything} unit${needAnything === 1 ? "" : "s"} still need a newsletter. ` +
                `${complete} finished and out of the way.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {units.length === 0 ? (
            <p className="text-sm">
              {canUploadSheet(user) ? (
                <>
                  Start by refreshing the query in Excel and bringing the sheet to{" "}
                  <Link href="/import" className="font-medium underline underline-offset-4">
                    Upload sheet
                  </Link>
                  .
                </>
              ) : (
                "Nothing has been uploaded yet, or no units are assigned to you."
              )}
            </p>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                {[
                  ["Ready to send", ready, "/units?state=ready"],
                  ["Needs photos", needsPhotos, "/units?state=needs-photos"],
                  ["Nothing ticked", nothingTicked, "/units?state=needs-quotes"],
                  ["Finished", complete, "/units?state=complete"],
                ].map(([label, value, href]) => (
                  <Link
                    key={label as string}
                    href={href as string}
                    className="hover:border-primary/40 rounded-md border p-2 transition-colors"
                  >
                    <dt className="text-muted-foreground text-xs">{label}</dt>
                    <dd className="text-2xl font-semibold">{value}</dd>
                  </Link>
                ))}
              </dl>
              <div className="flex flex-wrap gap-3 text-sm">
                <Link href="/units" className="font-medium underline underline-offset-4">
                  Work through this cycle
                </Link>
                <Link href="/changes" className="font-medium underline underline-offset-4">
                  See what changed since last cycle
                </Link>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
