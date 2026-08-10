/**
 * One past cycle, exactly as it was sent.
 *
 * These newsletters are rebuilt from the snapshot written when each was exported,
 * NOT from the sheet — so the figures are the ones the client received even after
 * the sheet has moved on. That is the whole point of keeping them.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSessionPage } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { NewsletterCanvas } from "@/features/newsletters/components/newsletter-canvas";
import { deserialiseNewsletter } from "@/lib/newsletter/snapshot";
import { formatFooterDate, fromIsoDate } from "@/lib/newsletter/dates";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Cycle" };

export default async function EditionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireSessionPage();

  const supabase = await createClient();
  const [{ data: edition }, { data: rows }] = await Promise.all([
    supabase.from("editions").select("*").eq("id", id).maybeSingle(),
    // RLS limits this to units the signed-in person may see.
    supabase
      .from("edition_units")
      .select("unit_id, snapshot, exported_at, units(display_name, unit_code)")
      .eq("edition_id", id)
      .not("snapshot", "is", null)
      .order("exported_at", { ascending: true }),
  ]);

  if (!edition) notFound();

  const sent = (rows ?? []).map((row) => ({
    unitId: row.unit_id,
    displayName: row.units?.display_name ?? row.units?.unit_code ?? "Unit",
    exportedAt: row.exported_at,
    restored: deserialiseNewsletter(row.snapshot),
  }));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-muted-foreground text-xs">
          <Link href="/editions" className="hover:underline">
            Cycles
          </Link>{" "}
          / {edition.footer_label}
        </p>
        <h1 className="text-2xl font-semibold">
          {edition.footer_label} · {formatFooterDate(fromIsoDate(edition.footer_date)!)}
        </h1>
        <p className="text-muted-foreground text-sm">
          {sent.length === 0
            ? "Nothing was exported in this cycle."
            : `${sent.length} newsletter${sent.length === 1 ? "" : "s"} sent, shown exactly as they went out.`}
        </p>
      </div>

      {sent.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center text-sm">
            A newsletter is recorded here when it is exported. Nothing has been exported in
            this cycle yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {sent.map((item) => (
            <section key={item.unitId} className="space-y-2">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <h2 className="font-medium">
                  <Link href={`/units/${item.unitId}`} className="hover:underline">
                    {item.displayName}
                  </Link>
                </h2>
                {item.exportedAt && (
                  <span className="text-muted-foreground text-xs">
                    sent {new Date(item.exportedAt).toLocaleString("en-GB")}
                  </span>
                )}
              </div>
              {item.restored ? (
                <div
                  style={{ width: 1280 * 0.62, height: 720 * 0.62, overflow: "hidden" }}
                  className="bg-white shadow-sm"
                >
                  <div
                    style={{
                      width: 1280,
                      height: 720,
                      transform: "scale(0.62)",
                      transformOrigin: "top left",
                    }}
                  >
                    <NewsletterCanvas view={item.restored.view} theme={item.restored.theme} />
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground rounded-md border border-dashed p-3 text-sm">
                  This one cannot be reproduced — the record of it is unreadable.
                </p>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
