import "server-only";

/**
 * Reads for units, their quotations, schedules and photos.
 *
 * Every query runs through the RLS-scoped server client, so a project manager
 * signing in simply does not see other people's units — the filtering is the
 * database's job, not a WHERE clause we could forget.
 */

import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";

export type UnitRow = Tables<"units">;
export type QuotationRow = Tables<"quotations">;
export type PhotoRow = Tables<"unit_photos">;

/** A unit with everything needed to render its newsletter. */
export type UnitDetail = UnitRow & {
  quotations: (QuotationRow & {
    gantt_schedules:
      (Tables<"gantt_schedules"> & { gantt_activities: Tables<"gantt_activities">[] }) | null;
  })[];
  unit_photos: PhotoRow[];
};

/** A dashboard card: enough to judge whether a unit is ready to send. */
export type UnitSummary = UnitRow & {
  quotations: Pick<
    QuotationRow,
    | "id"
    | "quote_number"
    | "invoice_value"
    | "progress"
    | "scope_of_work"
    | "planned_start_date"
    | "max_contractual_date"
    | "project_status"
    | "notes"
    | "include_in_newsletter"
  >[];
  unit_photos: Pick<PhotoRow, "id" | "is_selected">[];
};

const UNIT_DETAIL_SELECT = `
  *,
  quotations (
    *,
    gantt_schedules (
      *,
      gantt_activities ( * )
    )
  ),
  unit_photos ( * )
`;

const UNIT_SUMMARY_SELECT = `
  *,
  quotations (
    id, quote_number, invoice_value, progress, scope_of_work,
    planned_start_date, max_contractual_date, project_status, notes,
    include_in_newsletter,
    gantt_schedules ( id, source_start_date, source_finish_date )
  ),
  unit_photos ( id, is_selected ),
  edition_units ( edition_id, sent_at, exported_at )
`;

export interface UnitFilters {
  zone?: string;
  /** Match against the sheet's Assigned PM. */
  assignedPm?: string;
  /** Free text over unit code, display name and client name. */
  search?: string;
}

/** Units visible to the signed-in person, in display-name order. */
export async function listUnits(filters: UnitFilters = {}) {
  const supabase = await createClient();
  let query = supabase
    .from("units")
    .select(UNIT_SUMMARY_SELECT)
    .eq("delivery", "after_delivery")
    .order("display_name", { ascending: true });

  if (filters.zone) query = query.ilike("zone", filters.zone);
  if (filters.assignedPm) query = query.ilike("assigned_pm", filters.assignedPm);
  if (filters.search) {
    const term = `%${filters.search.trim()}%`;
    query = query.or(
      `unit_code.ilike.${term},display_name.ilike.${term},client_name.ilike.${term}`,
    );
  }

  const { data, error } = await query;
  // Queries THROW; server actions are the layer that returns Result<T>.
  if (error) throw error;
  return data;
}

/** One unit with its quotations, schedules and photos, or null. */
export async function getUnit(id: string): Promise<UnitDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("units")
    .select(UNIT_DETAIL_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as UnitDetail | null;
}

/**
 * When this unit's newsletter has gone out, across every cycle.
 *
 * Read from the per-cycle sent ticks rather than a second stored count, so
 * re-sending a cycle or unticking one cannot leave the two disagreeing.
 */
export async function unitSentDates(unitId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("edition_units")
    .select("sent_at")
    .eq("unit_id", unitId)
    .not("sent_at", "is", null);
  if (error) throw error;
  return (data ?? []).map((row) => row.sent_at).filter((value): value is string => Boolean(value));
}

/** Whether this unit is already ticked as sent for the cycle in progress. */
export async function unitSentThisCycle(unitId: string, editionId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("edition_units")
    .select("sent_at")
    .eq("unit_id", unitId)
    .eq("edition_id", editionId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.sent_at);
}

/**
 * The PM name(s) the signed-in person answers to.
 *
 * Needed by the permission helpers, which are pure and take the aliases as an
 * argument rather than reaching for the database themselves.
 */
export async function currentPmAliases(): Promise<string[]> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const sub = claims?.claims?.sub;
  if (!sub) return [];
  const { data, error } = await supabase.from("pm_aliases").select("pm_name").eq("profile_id", sub);
  if (error) throw error;
  return (data ?? []).map((row) => row.pm_name);
}

/** The zones and PMs present in the data, for the dashboard's filters. */
export async function listUnitFacets(): Promise<{
  zones: string[];
  pms: string[];
  patches: string[];
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("units")
    .select("zone, assigned_pm, patch")
    .eq("delivery", "after_delivery");
  if (error) throw error;

  const zones = new Map<string, string>();
  const pms = new Map<string, string>();
  const patches = new Set<string>();
  for (const row of data ?? []) {
    const zone = row.zone?.trim();
    if (zone) zones.set(zone.toLocaleLowerCase(), zone);
    const pm = row.assigned_pm?.trim();
    if (pm) pms.set(pm.toLocaleLowerCase(), pm);
    const patch = row.patch?.trim();
    if (patch) patches.add(patch);
  }
  return {
    zones: [...zones.values()].sort((a, b) => a.localeCompare(b)),
    pms: [...pms.values()].sort((a, b) => a.localeCompare(b)),
    // Numeric so "Patch 2" sorts before "Patch 10".
    patches: [...patches].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
  };
}

/** The most recent edition, which supplies the footer label and date. */
export async function latestEdition(): Promise<Tables<"editions"> | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("editions")
    .select("*")
    .order("footer_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** The last few uploads, for the import screen's history. */
export async function recentUploads(limit = 5) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sheet_uploads")
    .select("*, uploaded_by_profile:profiles!sheet_uploads_uploaded_by_fkey(full_name)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}
