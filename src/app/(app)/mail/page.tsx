/**
 * The Email screen: the covering note every unit shares, and who is copied.
 *
 * Guard → query → authorize → render. Everyone signed in may look — knowing who
 * is copied matters even to someone who cannot change it — and only an admin may
 * edit, which the actions re-check and RLS backstops (migration 0015).
 *
 * Nothing here sends mail. The tool prepares a message; a person sends it.
 */

import { requireSessionPage } from "@/lib/supabase/dal";
import { PageHeader } from "@/components/shell/page-header";
import { getMailSettings, listPmRouting, pmNamesInUse } from "@/features/mail/queries";
import { MailSettingsEditor } from "@/features/mail/components/mail-settings-editor";

export const metadata = { title: "Email" };

export default async function MailPage() {
  const user = await requireSessionPage();
  const [settings, routing, pmNames] = await Promise.all([
    getMailSettings(),
    listPmRouting(),
    pmNamesInUse(),
  ]);

  return (
    <>
      <PageHeader
        title="Email"
        description="The covering note sent with every newsletter, and who is copied. The tool prepares the message — you send it from Outlook."
      />
      {user.role !== "admin" && (
        <p className="text-muted-foreground mb-4 text-xs">Read-only for you.</p>
      )}
      <MailSettingsEditor
        settings={settings}
        routing={routing}
        pmNames={pmNames}
        canEdit={user.role === "admin"}
      />
    </>
  );
}
