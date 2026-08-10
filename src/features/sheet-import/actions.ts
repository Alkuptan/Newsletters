"use server";

/**
 * Storing an upload of the follow-up sheet.
 *
 * The one rule this file exists to enforce: **an upload refreshes the figures
 * that came from the sheet and never touches anything the owner typed or
 * ticked.** Display names, client names, stage overrides, Area of Concern text,
 * Gantt schedules, photos and the include-in-newsletter tick boxes all survive.
 * Get that wrong and a Monday morning refresh silently throws away a week of
 * work.
 */

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { RateLimitedError, ValidationError, fromError, toResult, type Result } from "@/lib/errors";
import { log } from "@/lib/log";
import { suggestDisplayName } from "@/lib/newsletter/display-name";
import type { TablesInsert } from "@/lib/supabase/database.types";
import { importSheetSchema, type ImportSummary, type ImportedRow } from "./schema";

/** Case- and whitespace-insensitive key, matching the DB's unique indexes. */
function unitKey(unitCode: string): string {
  return unitCode.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function quoteKey(quoteNumber: string): string {
  return quoteNumber.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

/**
 * Split writes into batches.
 *
 * 500 rows per call keeps each request comfortably small while turning a
 * thousand round trips into a handful.
 */
function chunk<T>(rows: readonly T[], size = 500): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    batches.push(rows.slice(i, i + size));
  }
  return batches;
}

/**
 * Statuses that keep a brand-new quotation OFF the newsletter.
 *
 * Cancelled and void work is not progress and should never reach a client. The
 * owner can still tick it back on.
 */
const EXCLUDED_STATUSES = new Set(["cancelled", "void"]);

/**
 * Should a quotation the tool has never seen before be on the newsletter?
 *
 * YES by default. The point of the tool is to combine a unit's quotations into
 * one page, with a way to leave some out — so opting out is the exception. The
 * alternative (default off) meant 317 units arriving with empty newsletters and
 * the owner ticking every one by hand.
 *
 * A row the sheet already marks "Ready" is included regardless of status,
 * because that is the owner saying so explicitly in Excel.
 */
function defaultIncluded(row: ImportedRow): boolean {
  if (row.markedReadyInSheet) return true;
  return !EXCLUDED_STATUSES.has(row.projectStatus.trim().toLocaleLowerCase());
}

/**
 * The PM covering the most money on a unit, used when its quotations disagree.
 * Mirrors the same rule in the calculation engine.
 */
function dominantPm(rows: readonly ImportedRow[]): string | null {
  const byPm = new Map<string, number>();
  for (const row of rows) {
    const pm = row.assignedPm?.trim();
    if (!pm) continue;
    byPm.set(pm, (byPm.get(pm) ?? 0) + row.invoiceValue);
  }
  let winner: string | null = null;
  let best = -Infinity;
  for (const [pm, value] of byPm) {
    if (value > best) {
      winner = pm;
      best = value;
    }
  }
  return winner;
}

/**
 * Import a parsed follow-up sheet.
 *
 * Admin only: one upload rewrites the imported figures for every unit in the
 * programme, not just one person's.
 */
export async function importFollowUpSheet(input: unknown): Promise<Result<ImportSummary>> {
  try {
    // 1. Auth — admin only, and RLS on sheet_uploads/units backs this up.
    const user = await requireRole("admin");
    const supabase = await createClient();

    // 2. Rate limit. Uploading is heavy, and a double-clicked button should not
    //    run the whole import twice.
    const { data: allowed, error: rateError } = await supabase.rpc("check_rate_limit", {
      p_scope: "sheet-import",
      p_max: 10,
      p_window_seconds: 300,
    });
    if (rateError) throw rateError;
    if (!allowed) throw new RateLimitedError();

    // 3. Validate.
    const parsed = importSheetSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues, parsed.error.issues[0]?.message);
    }
    const { fileName, sheetName, delivery, rows, rejected, zoneAliases } = parsed.data;

    // 4./5. Record the upload first, so every quotation can point at it and the
    //       owner can see what the last refresh did even if nothing changed.
    const { data: upload, error: uploadError } = await supabase
      .from("sheet_uploads")
      .insert({
        file_name: fileName,
        sheet_name: sheetName,
        delivery,
        rows_read: rows.length + rejected.length,
        rows_accepted: rows.length,
        rejected,
        zone_aliases: zoneAliases,
        uploaded_by: user.id,
      })
      .select("id")
      .single();
    if (uploadError) throw uploadError;

    // Group the rows by unit: one newsletter per unit, however many quotations.
    const byUnit = new Map<string, ImportedRow[]>();
    for (const row of rows) {
      const key = unitKey(row.unitCode);
      const existing = byUnit.get(key);
      if (existing) existing.push(row);
      else byUnit.set(key, [row]);
    }

    // Which units already exist? Fetched in one query rather than per row.
    const { data: existingUnits, error: existingError } = await supabase
      .from("units")
      .select("id, unit_code, display_name, client_name")
      .eq("delivery", delivery);
    if (existingError) throw existingError;

    const unitIdByKey = new Map<string, string>();
    const existingKeys = new Set<string>();
    const existingDisplayNames = new Map<string, string>();
    for (const unit of existingUnits ?? []) {
      const key = unitKey(unit.unit_code);
      unitIdByKey.set(key, unit.id);
      existingKeys.add(key);
      existingDisplayNames.set(key, unit.display_name);
    }

    // Build every unit's write up front, then send them in bulk. The real sheet
    // carries ~400 units and 645 quotations; one round trip each timed out.
    /**
     * IMPORTANT — every batch sent to `upsert` must have IDENTICAL keys.
     *
     * PostgREST builds one INSERT for the whole array, so a key present on some
     * objects and absent on others is sent as NULL for the ones missing it. That
     * is why the patches below are split by shape rather than built conditionally:
     * a single mixed batch would blank `client_name` on every unit whose sheet row
     * has no client name — silently wiping a name the owner typed.
     */
    const newUnits: TablesInsert<"units">[] = [];

    /*
      Existing units, grouped by WHICH optional columns the sheet supplied.
      With two optional client columns there are four possible shapes, so the
      groups are built by signature rather than by hand — adding a third such
      column later needs no new list, and cannot accidentally reintroduce the
      blanking bug the note above describes.
    */
    const patchGroups = new Map<string, TablesInsert<"units">[]>();
    function queuePatch(base: TablesInsert<"units">, supplied: Partial<TablesInsert<"units">>) {
      const keys = Object.keys(supplied).sort();
      const group = patchGroups.get(keys.join("|"));
      const patch = { ...base, ...supplied };
      if (group) group.push(patch);
      else patchGroups.set(keys.join("|"), [patch]);
    }

    for (const [key, unitRows] of byUnit) {
      const first = unitRows[0];
      const zone = unitRows.find((r) => r.zone)?.zone ?? "";
      const assignedPm = dominantPm(unitRows);
      // Client name arrives from the sheet once the owner adds the column. Until
      // then it is null, and a null must never overwrite a name they typed.
      const clientName = unitRows.find((r) => r.clientName)?.clientName ?? null;
      // Same rule for the addresses: absent means "the sheet did not say", which
      // must never erase what is already stored.
      const clientEmails = unitRows.find((r) => r.clientEmails)?.clientEmails ?? null;

      if (existingKeys.has(key)) {
        // ONLY sheet-owned columns. display_name, stage_override and
        // concerns_override belong to the owner and are deliberately absent, so
        // a refresh cannot overwrite them. This row is guaranteed to hit the
        // conflict target because the unit already exists.
        const patch: TablesInsert<"units"> = {
          unit_code: first.unitCode,
          delivery,
          zone,
          assigned_pm: assignedPm,
          // display_name is required to insert, but this row only ever updates.
          // Passing the existing value keeps the type honest without changing it.
          display_name: existingDisplayNames.get(key) ?? first.unitCode,
        };
        // Only the columns the sheet actually supplied travel with this row.
        const supplied: Partial<TablesInsert<"units">> = {};
        if (clientName !== null) supplied.client_name = clientName;
        if (clientEmails !== null) supplied.client_emails = clientEmails;
        queuePatch(patch, supplied);
      } else {
        newUnits.push({
          unit_code: first.unitCode,
          zone,
          delivery,
          assigned_pm: assignedPm,
          // Suggested once, then the owner's to change and ours to leave alone.
          display_name: suggestDisplayName(first.unitCode, zone),
          client_name: clientName,
          client_emails: clientEmails,
        });
      }
    }

    let unitsCreated = 0;
    let unitsUpdated = 0;

    for (const batch of chunk(newUnits)) {
      const { data, error } = await supabase.from("units").insert(batch).select("id, unit_code");
      if (error) throw error;
      for (const row of data ?? []) unitIdByKey.set(unitKey(row.unit_code), row.id);
      unitsCreated += batch.length;
    }

    for (const group of patchGroups.values()) {
      for (const batch of chunk(group)) {
        const { error } = await supabase
          .from("units")
          .upsert(batch, { onConflict: "unit_key,delivery" });
        if (error) throw error;
        unitsUpdated += batch.length;
      }
    }

    // Which quotations already exist, so a tick box is never reset by a refresh.
    //
    // Chunked: `.in()` becomes a GET query string, and the real sheet has ~400
    // units, whose ids in one URL exceeded PostgREST's limit ("URI too long").
    const quoteIdByKey = new Map<string, string>();
    for (const idBatch of chunk([...unitIdByKey.values()], 100)) {
      const { data: existingQuotes, error: quotesError } = await supabase
        .from("quotations")
        .select("id, unit_id, quote_number")
        .in("unit_id", idBatch);
      if (quotesError) throw quotesError;
      for (const quote of existingQuotes ?? []) {
        quoteIdByKey.set(`${quote.unit_id}|${quoteKey(quote.quote_number)}`, quote.id);
      }
    }

    const newQuotations: TablesInsert<"quotations">[] = [];
    // Same rule as the units above: one shape per batch. `include_in_newsletter`
    // is omitted entirely for the normal case (it is the owner's tick and must
    // survive a refresh) and set to false for cancelled/void work, so the two
    // cannot travel in the same array.
    const existingQuotationPatches: TablesInsert<"quotations">[] = [];
    const cancelledQuotationPatches: TablesInsert<"quotations">[] = [];

    for (const [key, unitRows] of byUnit) {
      const unitId = unitIdByKey.get(key);
      // A unit we could neither find nor create — skip rather than crash the
      // whole upload over one row.
      if (!unitId) continue;

      for (const row of unitRows) {
        const figures = {
          unit_id: unitId,
          quote_number: row.quoteNumber,
          invoice_number: row.invoiceNumber,
          invoice_value: row.invoiceValue,
          scope_of_work: row.scopeOfWork,
          progress: row.progress,
          planned_start_date: row.plannedStartDate,
          max_contractual_date: row.maxContractualDate,
          project_status: row.projectStatus,
          notes: row.notes,
          marked_ready_in_sheet: row.markedReadyInSheet,
          last_seen_upload_id: upload.id,
        } satisfies TablesInsert<"quotations">;

        if (quoteIdByKey.has(`${unitId}|${quoteKey(row.quoteNumber)}`)) {
          // include_in_newsletter is absent on purpose — it is the owner's tick,
          // and a refresh must never reset it. The ONE exception is below:
          // cancelled and void work is taken off the newsletter every time,
          // because it must never reach a client whatever was ticked before.
          const patch = {
            ...figures,
            // It is back in the sheet, so it is no longer missing.
            missing_from_sheet: false,
            missing_since_upload_id: null,
          } satisfies TablesInsert<"quotations">;

          if (EXCLUDED_STATUSES.has(row.projectStatus.trim().toLocaleLowerCase())) {
            // The one exception to leaving the tick alone: cancelled and void work
            // comes off the newsletter on EVERY upload, because it must never
            // reach a client whatever was ticked before. Only ever unticks.
            cancelledQuotationPatches.push({ ...patch, include_in_newsletter: false });
          } else {
            existingQuotationPatches.push(patch);
          }
        } else {
          newQuotations.push({
            ...figures,
            include_in_newsletter: defaultIncluded(row),
          });
        }
      }
    }

    let quotationsCreated = 0;
    let quotationsUpdated = 0;

    for (const batch of chunk(newQuotations)) {
      const { error } = await supabase.from("quotations").insert(batch);
      if (error) throw error;
      quotationsCreated += batch.length;
    }

    for (const group of [existingQuotationPatches, cancelledQuotationPatches]) {
      for (const batch of chunk(group)) {
        const { error } = await supabase
          .from("quotations")
          .upsert(batch, { onConflict: "unit_id,quote_key" });
        if (error) throw error;
        quotationsUpdated += batch.length;
      }
    }

    /**
     * Quotations that have vanished from the sheet.
     *
     * Scoped to units that ARE in this upload: if a whole unit is absent the
     * sheet may simply have been filtered, and marking all of its quotations
     * missing on that basis would be worse than doing nothing. A unit that is
     * present but has lost a quotation is a genuine removal.
     *
     * The row is kept — it holds a schedule, photos and the owner's tick, and the
     * removal might be a mistake — but it is flagged and taken off the newsletter.
     */
    let quotationsMissing = 0;
    const touchedUnitIds = [...unitIdByKey.values()];
    for (const idBatch of chunk(touchedUnitIds, 100)) {
      const { data: gone, error: goneError } = await supabase
        .from("quotations")
        .update({
          missing_from_sheet: true,
          missing_since_upload_id: upload.id,
          include_in_newsletter: false,
        })
        .in("unit_id", idBatch)
        .neq("last_seen_upload_id", upload.id)
        .eq("missing_from_sheet", false)
        .select("id");
      if (goneError) throw goneError;
      quotationsMissing += gone?.length ?? 0;
    }

    if (quotationsMissing > 0) {
      log.info("quotations no longer in the sheet", {
        uploadId: upload.id,
        count: quotationsMissing,
      });
    }

    log.info("sheet import complete", {
      uploadId: upload.id,
      unitsCreated,
      unitsUpdated,
      quotationsCreated,
      quotationsUpdated,
      rowsRejected: rejected.length,
      quotationsMissing,
    });

    /*
      6. Every screen that renders these figures — and that includes each unit's
      own page, which "/units" does NOT cover. Without the route pattern, an
      upload refreshed the list while every unit page kept showing the previous
      sheet's progress, dates and money until its cache expired.
    */
    revalidatePath("/units");
    revalidatePath("/import");
    revalidatePath("/units/[id]", "page");

    // 7. Typed success envelope.
    return toResult({
      uploadId: upload.id,
      unitsCreated,
      unitsUpdated,
      quotationsCreated,
      quotationsUpdated,
      rowsRejected: rejected.length,
      quotationsMissing,
    });
  } catch (err) {
    return fromError(err);
  }
}
