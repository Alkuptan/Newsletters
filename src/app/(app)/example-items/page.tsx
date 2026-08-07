// ★ Teaches: the list-page pattern. Pages orchestrate, nothing more:
// (1) gate with requireSessionPage(), (2) parse searchParams through the
// feature's zod enum (URL input is user input), (3) read via queries.ts,
// (4) hand plain data to client components. Business logic lives in the slice.
import { requireSessionPage } from "@/lib/supabase/dal";
import { PageHeader } from "@/components/shell/page-header";
import { NewItemDialog } from "@/features/example-items/components/item-form";
import { ItemsTable } from "@/features/example-items/components/items-table";
import { listItems } from "@/features/example-items/queries";
import { itemStatusSchema } from "@/features/example-items/schema";

export default async function ExampleItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  await requireSessionPage();

  // Never trust raw searchParams — parse through the same enum the DB uses.
  // Anything unexpected simply means "no filter" (no error page for a typo'd URL).
  const { status } = await searchParams;
  const parsedStatus = itemStatusSchema.safeParse(status);
  const items = await listItems({
    status: parsedStatus.success ? parsedStatus.data : undefined,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Example Items"
        description="The teaching slice — copy this feature end to end for new capabilities."
      >
        <NewItemDialog />
      </PageHeader>
      <ItemsTable items={items} />
    </div>
  );
}
