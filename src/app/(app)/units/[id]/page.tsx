/**
 * One unit: the newsletter as it will be sent, plus the controls that change it.
 *
 * Guard → query → authorize → render. The page decides what CAN be shown; the
 * actions re-check with the same helpers, and RLS backstops both.
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { requireSessionPage } from "@/lib/supabase/dal";
import { canWriteUnit } from "@/features/units/permissions";
import {
  currentPmAliases,
  getUnit,
  latestEdition,
  unitSentDates,
  unitSentThisCycle,
} from "@/features/units/queries";
import { QuotationTickList } from "@/features/units/components/quotation-tick-list";
import { UnitDetailsForm } from "@/features/units/components/unit-details-form";
import { ClientEditor } from "@/features/units/components/client-editor";
import { UnitMailPanel } from "@/features/mail/components/unit-mail-panel";
import { getMailSettings, listPmRouting } from "@/features/mail/queries";
import { prepareMail } from "@/lib/newsletter/mail";
import { sendHistoryFrom } from "@/lib/newsletter/outlook";
import { stageForUnit } from "@/lib/newsletter/stage";
import { areaOfConcernBullets } from "@/lib/newsletter/area-of-concern";
import type { Stage } from "@/lib/newsletter/types";
import { GanttEditor } from "@/features/gantt/components/gantt-editor";
import { listReusableSchedules, type ReusableSchedule } from "@/features/gantt/queries";
import { PhotoPicker } from "@/features/photos/components/photo-picker";
import { PHOTO_SLOTS_WITHOUT_SCHEDULE, PHOTO_SLOTS_WITH_SCHEDULE } from "@/features/photos/schema";
import { NewsletterExport } from "@/features/newsletters/components/newsletter-export";
import { unitToNewsletterView } from "@/features/newsletters/to-view";
import { fromIsoDate } from "@/lib/newsletter/dates";
import {
  hasOwnDesign,
  resolveTheme,
  templateKindFor,
  type ThemeOverrides,
} from "@/lib/newsletter/theme";
import { getTemplateOverrides } from "@/features/design/queries";
import { UnitDesignEditor } from "@/features/design/components/unit-design-editor";
import { tidyZone } from "@/lib/newsletter/display-name";
import { unitNeighbours, type UnitListFilters } from "@/features/units/list";
import { UnitNav } from "@/features/units/components/unit-nav";
import { SchedulePlanPicker } from "@/features/units/components/schedule-plan-picker";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Unit" };

export default async function UnitPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  /** Carried over from the list, so Next / Previous walks the same run. */
  searchParams: Promise<UnitListFilters>;
}) {
  const { id } = await params;
  const filters = await searchParams;
  const user = await requireSessionPage();

  // RLS already hides other people's units, so a missing row here means either
  // "gone" or "not yours" — both are a 404 to the person looking.
  const unit = await getUnit(id);
  if (!unit) notFound();

  const [aliases, edition, templates, neighbours, mailSettings, pmRouting, sentDates] =
    await Promise.all([
      currentPmAliases(),
      latestEdition(),
      getTemplateOverrides(),
      unitNeighbours(id, filters),
      getMailSettings(),
      listPmRouting(),
      unitSentDates(id),
    ]);
  const canEdit = canWriteUnit(user, unit, aliases);

  // Needs the edition id, so it cannot join the batch above. Skipped entirely
  // when no cycle is open, because then there is nothing to have been sent in.
  const sentThisCycle = edition ? await unitSentThisCycle(id, edition.id) : false;

  // Schedules on OTHER units doing the same kind of work, so one built for
  // "Unit Extension" can be copied here and re-dated. Only fetched for people
  // who can actually edit — a viewer has nothing to copy it into.
  const reusableByScope = new Map<string, ReusableSchedule[]>();
  if (canEdit) {
    const scopes = unit.quotations
      .filter((q) => q.include_in_newsletter)
      .map((q) => q.scope_of_work);
    for (const candidate of await listReusableSchedules(scopes, unit.id)) {
      const key = candidate.scopeOfWork.trim().toLocaleLowerCase();
      const bucket = reusableByScope.get(key);
      if (bucket) bucket.push(candidate);
      else reusableByScope.set(key, [candidate]);
    }
  }

  const unitDesign = (unit.design_overrides as ThemeOverrides | null) ?? {};

  const view = unitToNewsletterView(unit, {
    footerLabel: edition?.footer_label ?? "Bi-Weekly Newsletter",
    footerDate: edition ? fromIsoDate(edition.footer_date)! : new Date(),
    // Served from THIS origin, because both exporters read the pixels and a
    // browser will not let a canvas read a cross-origin image (DECISIONS 0007).
    photoUrl: (photo) => `/photo/${photo.id}`,
  });

  /*
    The covering email, composed from the same facts the page shows — the client
    line the newsletter prints, the edition date in its footer. Nothing is sent;
    this is text and addresses for a person to copy into Outlook.
  */
  const mail = prepareMail(
    mailSettings,
    {
      clientEmails: unit.client_emails,
      pmName: unit.assigned_pm,
      clientLine: view.clientName,
      unitName: unit.display_name,
      editionDate: edition ? fromIsoDate(edition.footer_date)! : new Date(),
    },
    pmRouting,
  );

  // Only ticked quotations get a schedule editor: an untitled bar chart for a
  // quotation that is not on the newsletter is just noise.
  const ticked = unit.quotations
    .filter((q) => q.include_in_newsletter)
    .slice()
    .sort((a, b) => a.quote_number.localeCompare(b.quote_number));

  // Which master applies, then the design this newsletter actually uses.
  const templateKind = templateKindFor({
    hasSchedule: view.ganttRows.length > 0,
    delivery: unit.delivery,
  });
  const theme = resolveTheme(templates[templateKind], unitDesign);

  const quotations = unit.quotations
    .slice()
    .sort((a, b) => a.quote_number.localeCompare(b.quote_number))
    .map((quotation) => ({
      id: quotation.id,
      quoteNumber: quotation.quote_number,
      scopeOfWork: quotation.scope_of_work,
      invoiceValue: Number(quotation.invoice_value),
      progressPercent: Math.round(Number(quotation.progress) * 100),
      projectStatus: quotation.project_status,
      include: quotation.include_in_newsletter,
      // Never seen by a human yet: it arrived in an upload and has no schedule.
      isNew: quotation.gantt_schedules === null && !quotation.include_in_newsletter,
      missingFromSheet: quotation.missing_from_sheet,
    }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-xs">
            <Link href="/units" className="hover:underline">
              Units
            </Link>{" "}
            / {unit.unit_code}
          </p>
          <h1 className="text-2xl font-semibold">{unit.display_name}</h1>
          <p className="text-muted-foreground text-sm">
            {unit.client_name ?? "No client name yet"} · {tidyZone(unit.zone) || "no zone"} ·{" "}
            {unit.assigned_pm ?? "no PM"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {!canEdit && <span className="text-muted-foreground text-xs">Read-only for you</span>}
          {neighbours && <UnitNav {...neighbours} listHref={listHref(filters)} />}
        </div>
      </div>

      {/*
        The controls scroll; the newsletter does not. Judging a change by
        scrolling back up to find the page again was the complaint.
      */}
      <div className="grid gap-6 xl:grid-cols-[20rem_1fr]">
        <aside className="space-y-6">
          <SchedulePlanPicker
            unitId={unit.id}
            plan={(unit.schedule_plan as "photos_only" | "timeline" | null) ?? null}
            schedulesBuilt={
              unit.quotations.filter((q) => q.include_in_newsletter && q.gantt_schedules).length
            }
            canEdit={canEdit}
          />

          <UnitDetailsForm
            unitId={unit.id}
            displayName={unit.display_name}
            clientName={unit.client_name}
            stageOverride={(unit.stage_override as Stage | null) ?? null}
            // What the stage would be on automatic, so the choice is informed.
            derivedStage={stageForUnit(
              unit.quotations.filter((q) => q.include_in_newsletter).map((q) => q.project_status),
            )}
            concerns={view.concerns}
            concernsAreOverridden={unit.concerns_override !== null}
            // What the sheet says now, so a divergence from the carried-forward
            // text can be pointed out rather than quietly ignored.
            sheetConcerns={areaOfConcernBullets(
              unit.quotations.filter((q) => q.include_in_newsletter).map((q) => q.notes),
            )}
            canEdit={canEdit}
          />

          <div className="space-y-2">
            <h2 className="text-sm font-semibold">Who the newsletter names</h2>
            <p className="text-muted-foreground text-xs">
              A unit can have more than one client. Tick the ones to name on the page and set what
              each is called. Your choice is remembered and survives the next sheet upload.
            </p>
            <ClientEditor
              unitId={unit.id}
              rawNames={unit.client_name}
              rawEmails={unit.client_emails}
              storedTitles={(unit.client_titles as Record<string, string> | null) ?? {}}
              storedShown={unit.client_shown}
              canEdit={canEdit}
            />
          </div>

          <QuotationTickList quotations={quotations} canEdit={canEdit} />

          {canEdit && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold">Time schedules</h2>
              <p className="text-muted-foreground text-xs">
                Build the bars once per quotation. They are saved and come back every cycle. A
                ticked quotation with no bars puts the whole unit on the photo layout.
              </p>
              {ticked.length === 0 ? (
                <p className="text-muted-foreground text-xs">
                  Tick a quotation above to give it a schedule.
                </p>
              ) : (
                ticked.map((quotation) => (
                  <GanttEditor
                    key={quotation.id}
                    quotationId={quotation.id}
                    quoteNumber={quotation.quote_number}
                    scopeOfWork={quotation.scope_of_work}
                    initialRowLabel={quotation.gantt_schedules?.row_label ?? ""}
                    initialActivities={(quotation.gantt_schedules?.gantt_activities ?? [])
                      .slice()
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .map((activity) => ({
                        name: activity.name,
                        startDate: activity.start_date,
                        finishDate: activity.finish_date,
                        tone: activity.tone,
                      }))}
                    plannedStartDate={quotation.planned_start_date}
                    maxContractualDate={quotation.max_contractual_date}
                    hasSchedule={quotation.gantt_schedules !== null}
                    reusable={reusableByScope.get(
                      quotation.scope_of_work.trim().toLocaleLowerCase(),
                    )}
                  />
                ))
              )}
            </div>
          )}

          <PhotoPicker
            unitId={unit.id}
            unitCode={unit.unit_code}
            displayName={unit.display_name}
            canEdit={canEdit}
            onedriveFolderUrl={unit.onedrive_folder_url}
            // The Gantt layout has room for two along the bottom; without a
            // schedule the photos take the whole right-hand side.
            maxSlots={
              view.ganttRows.length > 0 ? PHOTO_SLOTS_WITH_SCHEDULE : PHOTO_SLOTS_WITHOUT_SCHEDULE
            }
            photos={unit.unit_photos
              .slice()
              .sort(
                (a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at),
              )
              .map((photo) => ({
                id: photo.id,
                url: `/photo/${photo.id}`,
                description: photo.description,
                isSelected: photo.is_selected,
              }))}
          />

          <Button variant="outline" size="sm" asChild>
            <Link href="/units">Back to all units</Link>
          </Button>
        </aside>

        <section className="min-w-0 space-y-3 self-start xl:sticky xl:top-4">
          <h2 className="text-sm font-semibold">Newsletter</h2>
          {/* Shown at three-quarter size so the whole page is visible beside the
              controls on a laptop. The exports are always full size. */}
          <NewsletterExport
            view={view}
            previewScale={0.74}
            theme={theme}
            editionId={edition?.id}
            unitId={unit.id}
          />

          <div className="space-y-2 border-t pt-3">
            <h2 className="text-sm font-semibold">The email to send</h2>
            <UnitMailPanel
              mail={mail}
              view={view}
              unitId={unit.id}
              unitName={unit.display_name}
              pmName={unit.assigned_pm}
              editionId={edition?.id ?? null}
              sentThisCycle={sentThisCycle}
              history={sendHistoryFrom(sentDates)}
              imageWidthPx={mailSettings.imageWidthPx}
              canEdit={canEdit}
            />
          </div>
        </section>
      </div>

      <section className="border-t pt-6">
        <UnitDesignEditor
          unitId={unit.id}
          unitDesign={unitDesign}
          masterOverrides={templates[templateKind]}
          templateKind={templateKind}
          view={view}
          hasOwn={hasOwnDesign(unitDesign)}
          canEdit={canEdit}
        />
      </section>
    </div>
  );
}

/** The list's own address, so "back" returns to the same filtered view. */
function listHref(filters: UnitListFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (typeof value === "string" && value) params.set(key, value);
  }
  return params.size > 0 ? `/units?${params}` : "/units";
}
