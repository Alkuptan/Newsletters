// ★ Teaches: the detail-page pattern — validate the URL param, 404 cleanly,
// and compute canEdit/canDelete SERVER-side with the SAME permissions helper
// the actions use. Client components only ever receive booleans; they never
// compute roles themselves.
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireSessionPage } from "@/lib/supabase/dal";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DeleteItemButton } from "@/features/example-items/components/delete-item-button";
import { ItemForm } from "@/features/example-items/components/item-form";
import { StatusBadge } from "@/features/example-items/components/status-badge";
import { TransitionButtons } from "@/features/example-items/components/transition-buttons";
import { canDeleteItem, canEditItem } from "@/features/example-items/permissions";
import { getItem } from "@/features/example-items/queries";

const uuidSchema = z.uuid();

// Fixed locale + UTC — deterministic output regardless of server timezone.
const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeZone: "UTC",
});

export default async function ExampleItemPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireSessionPage();

  // A malformed id would make Postgres error on the uuid cast — treat it as
  // a plain 404 instead of surfacing an error page.
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();

  const item = await getItem(id);
  if (!item) notFound();

  // The same helpers the server actions call — the UI and the API can never
  // disagree about who may do what (RLS backstops both).
  const canEdit = canEditItem(user, item);
  const canDelete = canDeleteItem(user);

  return (
    <div className="space-y-6">
      <PageHeader
        title={item.title}
        description={`Created by ${item.created_by_profile?.full_name ?? "unknown"} on ${dateFormatter.format(new Date(item.created_at))}`}
      >
        {canDelete ? <DeleteItemButton id={item.id} /> : null}
      </PageHeader>

      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={item.status} />
        {/* Gated for UX only — transitionItem re-checks permission server-side. */}
        {canEdit ? <TransitionButtons id={item.id} status={item.status} /> : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          {item.details ? (
            <p className="whitespace-pre-wrap">{item.details}</p>
          ) : (
            <p className="text-muted-foreground">No details.</p>
          )}
        </CardContent>
      </Card>

      {canEdit ? (
        <Card>
          <CardHeader>
            <CardTitle>Edit item</CardTitle>
            <CardDescription>
              Title and details only — status changes use the buttons above.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ItemForm item={{ id: item.id, title: item.title, details: item.details }} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
