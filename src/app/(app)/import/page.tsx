/**
 * Upload the follow-up sheet. Admin only.
 *
 * The page orchestrates: guard → query → render. The reading and the saving
 * happen in the client component and the server action respectively.
 */

import { requireRolePage } from "@/lib/supabase/dal";
import { UploadSheetForm } from "@/features/sheet-import/components/upload-sheet-form";
import { recentUploads } from "@/features/units/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Upload sheet" };

export default async function ImportPage() {
  // Wrong role → home. The action re-checks, and RLS backstops both.
  await requireRolePage("admin");
  const uploads = await recentUploads();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Upload sheet</h1>
        <p className="text-muted-foreground text-sm">
          Refresh the query in Excel, then bring the file here.
        </p>
      </div>

      <UploadSheetForm />

      {uploads.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent uploads</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {uploads.map((upload) => (
                <li key={upload.id} className="flex flex-wrap gap-x-4 gap-y-1 py-2">
                  <span className="font-medium">{upload.file_name}</span>
                  <span className="text-muted-foreground">
                    {new Date(upload.created_at).toLocaleString("en-GB")}
                  </span>
                  <span className="text-muted-foreground">
                    {upload.rows_accepted} quotations
                    {upload.rows_read - upload.rows_accepted > 0 &&
                      `, ${upload.rows_read - upload.rows_accepted} skipped`}
                  </span>
                  <span className="text-muted-foreground">
                    {upload.uploaded_by_profile?.full_name ?? "—"}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
