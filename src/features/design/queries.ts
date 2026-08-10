import "server-only";

/**
 * Reads for the Design screen.
 */

import { createClient } from "@/lib/supabase/server";
import type { ThemeOverrides, TemplateKind } from "@/lib/newsletter/theme";

/** The three master designs, keyed by kind. */
export async function getTemplateOverrides(): Promise<Record<TemplateKind, ThemeOverrides>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("newsletter_templates").select("kind, overrides");
  if (error) throw error;

  // Migration 0010 creates all three, so this is belt and braces rather than a
  // real fallback — but a missing row must never break every newsletter.
  const byKind: Record<TemplateKind, ThemeOverrides> = {
    timeline: {},
    photos: {},
    before_delivery: {},
  };
  for (const row of data ?? []) {
    byKind[row.kind] = (row.overrides as ThemeOverrides) ?? {};
  }
  return byKind;
}

/** One master, for the editor. */
export async function getTemplateOverride(kind: TemplateKind): Promise<ThemeOverrides> {
  return (await getTemplateOverrides())[kind];
}

export interface UnitWithOwnDesign {
  id: string;
  displayName: string;
  unitCode: string;
}

/**
 * Units that differ from their master.
 *
 * Listed on the Design screen so a one-off tweak made months ago cannot quietly
 * haunt the programme (docs/SPEC.md, rule 5).
 */
export async function unitsWithOwnDesign(): Promise<UnitWithOwnDesign[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("units")
    .select("id, display_name, unit_code, design_overrides")
    .not("design_overrides", "is", null)
    .order("display_name");
  if (error) throw error;

  // An override of `{}` is stored but means nothing — filter it out so the list
  // only shows units that genuinely look different.
  return (data ?? [])
    .filter((row) => {
      const overrides = row.design_overrides as ThemeOverrides | null;
      if (!overrides) return false;
      return Object.values(overrides).some(
        (group) => group && Object.keys(group).length > 0,
      );
    })
    .map((row) => ({
      id: row.id,
      displayName: row.display_name,
      unitCode: row.unit_code,
    }));
}

/**
 * A real unit to preview a master against, so the Design screen shows the
 * owner's own data rather than invented sample content.
 *
 * @param wantsSchedule true to find a unit that uses the Timeline layout
 */
export async function pickPreviewUnitId(wantsSchedule: boolean): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("units")
    .select("id, quotations!inner(id, include_in_newsletter, gantt_schedules(id))")
    .eq("delivery", "after_delivery")
    .eq("quotations.include_in_newsletter", true)
    .order("display_name")
    .limit(60);
  if (error) throw error;

  for (const unit of data ?? []) {
    const hasSchedule = unit.quotations.some(
      (quotation) => quotation.gantt_schedules !== null,
    );
    if (hasSchedule === wantsSchedule) return unit.id;
  }
  return null;
}
