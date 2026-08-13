"use server";

/**
 * Changing the covering email's wording and its CC rules.
 *
 * Admin-only, and for the same reason the design masters are: one edit here
 * changes the email for all 317 units. The canonical envelope
 * (docs/template/RULES.md rule 4) with RLS as the backstop underneath.
 *
 * Nothing in this file sends mail. There is no mail transport in this tool — see
 * docs/PROJECT.md, "Sending the newsletter email to clients".
 */

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { RateLimitedError, ValidationError, fromError, toResult, type Result } from "@/lib/errors";
import { deletePmRoutingSchema, saveMailSettingsSchema, savePmRoutingSchema } from "./schema";

/** Generous for a person maintaining a list, tight enough to stop a runaway script. */
async function checkEditRate(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: allowed, error } = await supabase.rpc("check_rate_limit", {
    p_scope: "mail-settings",
    p_max: 60,
    p_window_seconds: 60,
  });
  if (error) throw error;
  if (!allowed) throw new RateLimitedError();
}

/** The wording every unit shares, and the people copied on every unit. */
export async function saveMailSettings(input: unknown): Promise<Result<null>> {
  try {
    const parsed = saveMailSettingsSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues, parsed.error.issues[0]?.message);
    }
    const user = await requireRole("admin");
    const supabase = await createClient();
    await checkEditRate(supabase);

    const { error } = await supabase
      .from("mail_settings")
      .update({
        subject_template: parsed.data.subjectTemplate,
        body_template: parsed.data.bodyTemplate,
        always_cc: parsed.data.alwaysCc,
        image_width_px: parsed.data.imageWidthPx,
        signature_html: parsed.data.signature.trim() || null,
        updated_by: user.id,
      })
      .eq("id", true);
    if (error) throw error;

    revalidatePath("/mail");
    revalidatePath("/units");
    // The composed message is shown on each unit's own page, which "/units"
    // does not cover — the dynamic children need the route pattern.
    revalidatePath("/units/[id]", "page");
    return toResult(null);
  } catch (err) {
    return fromError(err);
  }
}

/**
 * Add or replace one project manager's CC rule.
 *
 * Upserted on the PM name so saving twice edits rather than duplicates. The
 * unique index is on `lower(trim(pm_name))`, which is what makes re-saving a
 * differently-cased spelling update the same rule instead of colliding.
 */
export async function savePmRouting(input: unknown): Promise<Result<null>> {
  try {
    const parsed = savePmRoutingSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues, parsed.error.issues[0]?.message);
    }
    const user = await requireRole("admin");
    const supabase = await createClient();
    await checkEditRate(supabase);

    /*
      The unique index is on an EXPRESSION, which PostgREST cannot use as a
      conflict target, so the upsert is done by hand: find the existing rule
      case-insensitively, then update it or insert a new one.
    */
    const { data: existing, error: findError } = await supabase
      .from("pm_mail_routing")
      .select("id")
      .ilike("pm_name", parsed.data.pmName.trim())
      .maybeSingle();
    if (findError) throw findError;

    const row = {
      pm_name: parsed.data.pmName,
      cc_emails: parsed.data.ccEmails,
      updated_by: user.id,
    };
    const { error } = existing
      ? await supabase.from("pm_mail_routing").update(row).eq("id", existing.id)
      : await supabase.from("pm_mail_routing").insert(row);
    if (error) throw error;

    revalidatePath("/mail");
    revalidatePath("/units");
    // The composed message is shown on each unit's own page, which "/units"
    // does not cover — the dynamic children need the route pattern.
    revalidatePath("/units/[id]", "page");
    return toResult(null);
  } catch (err) {
    return fromError(err);
  }
}

export async function deletePmRouting(input: unknown): Promise<Result<null>> {
  try {
    const parsed = deletePmRoutingSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues, parsed.error.issues[0]?.message);
    }
    await requireRole("admin");
    const supabase = await createClient();
    await checkEditRate(supabase);

    const { error } = await supabase.from("pm_mail_routing").delete().eq("id", parsed.data.id);
    if (error) throw error;

    revalidatePath("/mail");
    revalidatePath("/units");
    // The composed message is shown on each unit's own page, which "/units"
    // does not cover — the dynamic children need the route pattern.
    revalidatePath("/units/[id]", "page");
    return toResult(null);
  } catch (err) {
    return fromError(err);
  }
}
