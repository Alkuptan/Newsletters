/**
 * The Design screen: the three master designs.
 *
 * Admin only, because one change here moves every newsletter in the programme. A
 * single unit's design is changed on that unit's own page instead.
 */

import Link from "next/link";
import { requireRolePage } from "@/lib/supabase/dal";
import { getTemplateOverrides, pickPreviewUnitId, unitsWithOwnDesign } from "@/features/design/queries";
import { MasterDesignEditor } from "@/features/design/components/master-design-editor";
import { getUnit, latestEdition } from "@/features/units/queries";
import { unitToNewsletterView } from "@/features/newsletters/to-view";
import { fromIsoDate } from "@/lib/newsletter/dates";
import type { TemplateKind } from "@/lib/newsletter/theme";
import type { NewsletterView } from "@/lib/newsletter/view-model";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Design" };

export default async function DesignPage() {
  await requireRolePage("admin");

  const [overridesByKind, edition, ownDesign, timelineUnitId, photosUnitId] = await Promise.all([
    getTemplateOverrides(),
    latestEdition(),
    unitsWithOwnDesign(),
    pickPreviewUnitId(true),
    pickPreviewUnitId(false),
  ]);

  const footerLabel = edition?.footer_label ?? "Bi-Weekly Newsletter";
  const footerDate = edition ? fromIsoDate(edition.footer_date)! : new Date();

  /** Build a preview from a real unit, so the design is judged against real data. */
  async function previewFor(unitId: string | null): Promise<NewsletterView | undefined> {
    if (!unitId) return undefined;
    const unit = await getUnit(unitId);
    if (!unit) return undefined;
    return unitToNewsletterView(unit, {
      footerLabel,
      footerDate,
      photoUrl: (photo) => `/photo/${photo.id}`,
    });
  }

  const previewByKind: Partial<Record<TemplateKind, NewsletterView>> = {
    timeline: await previewFor(timelineUnitId),
    photos: await previewFor(photosUnitId),
  };
  // Before Delivery has no layout of its own yet, so it previews as the photos
  // layout — enough to judge the left column, which is all it shares today.
  previewByKind.before_delivery = previewByKind.photos ?? previewByKind.timeline;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Design</h1>
        <p className="text-muted-foreground text-sm">
          Change a master and every newsletter of that layout follows. To change one
          unit only, open that unit and edit its design there.
        </p>
      </div>

      <MasterDesignEditor
        overridesByKind={overridesByKind}
        previewByKind={previewByKind}
        canEdit
      />

      <Card>
        <CardHeader>
          <CardTitle>Units with their own design</CardTitle>
        </CardHeader>
        <CardContent>
          {ownDesign.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              None — every unit follows its master.
            </p>
          ) : (
            <>
              <p className="text-muted-foreground mb-2 text-sm">
                These differ from their master. Open one to see or undo its changes.
              </p>
              <ul className="flex flex-wrap gap-2">
                {ownDesign.map((unit) => (
                  <li key={unit.id}>
                    <Link
                      href={`/units/${unit.id}`}
                      className="border-input hover:border-primary/50 inline-block rounded-md border px-2 py-1 text-sm"
                    >
                      {unit.displayName}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
