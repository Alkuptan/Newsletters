/**
 * The newsletter cycles.
 *
 * Everyone signed in can see which cycle is in use — it is the date on every
 * newsletter they look at. Only admins open or change one.
 */

import { currentUser, requireSessionPage } from "@/lib/supabase/dal";
import { listEditions } from "@/features/editions/queries";
import { EditionManager } from "@/features/editions/components/edition-manager";
import { canCreateEdition } from "@/features/units/permissions";
import { toIsoDate } from "@/lib/newsletter/dates";

export const metadata = { title: "Cycles" };

export default async function EditionsPage() {
  const user = await requireSessionPage();
  // requireSessionPage already loaded this; currentUser is request-cached.
  await currentUser();

  const editions = await listEditions();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Cycles</h1>
        <p className="text-muted-foreground text-sm">One cycle = one round of newsletters.</p>
      </div>

      {/* Asked in plain words during the first test run, so answered on the page. */}
      <div className="text-muted-foreground max-w-3xl space-y-2 rounded-md border p-4 text-sm">
        <p>
          <strong className="text-foreground">What a cycle is.&nbsp;</strong>Say you open one called
          &ldquo;Bi-Weekly Newsletter&rdquo; dated 7 August. From then on every newsletter carries
          that wording and that date in its footer, and elapsed time on every unit is measured to 7
          August — not to whatever day you happen to open the tool. So a page you build on Sunday
          and a page a colleague builds on Tuesday still agree.
        </p>
        <p>
          <strong className="text-foreground">What it remembers.&nbsp;</strong>Ticking a unit as sent on
          the Quick screen records it against the open cycle. Open the next one on 21 August and
          every unit starts as not-yet-sent again, so &ldquo;what do I still owe this week?&rdquo;
          answers itself.
        </p>
        <p>
          <strong className="text-foreground">What it freezes.&nbsp;</strong>Exporting saves a copy of
          each newsletter exactly as it went out. If a quotation is unticked or the sheet is
          refreshed next week, the August cycle still shows what the client actually received — open
          a past cycle to see it.
        </p>
      </div>

      <EditionManager
        canManage={canCreateEdition(user)}
        todayIso={toIsoDate(new Date())}
        editions={editions.map((edition) => ({
          id: edition.id,
          footerLabel: edition.footer_label,
          footerDate: edition.footer_date,
          status: edition.status,
          createdBy: null,
        }))}
      />
    </div>
  );
}
