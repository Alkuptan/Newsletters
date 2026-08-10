"use server";

/**
 * Changing a unit: its name, client, photo folder, stage, Area of Concern, and
 * which quotations count towards its newsletter.
 *
 * Every one of these follows the canonical envelope (docs/template/RULES.md
 * rule 4) and re-checks permission with the SAME helper the page uses, so a
 * control someone can see and an action they may call can never disagree. RLS is
 * the backstop underneath.
 */

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import {
  ForbiddenError,
  NotFoundError,
  RateLimitedError,
  ValidationError,
  fromError,
  toResult,
  type Result,
} from "@/lib/errors";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import { canWriteUnit } from "./permissions";
import { currentPmAliases } from "./queries";
import {
  setConcernsSchema,
  setQuotationIncludedSchema,
  setUnitClientsSchema,
  updateUnitSchema,
} from "./schema";

/** 60 edits a minute is generous for a person and stops a runaway script. */
async function checkEditRate(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: allowed, error } = await supabase.rpc("check_rate_limit", {
    p_scope: "unit-edit",
    p_max: 60,
    p_window_seconds: 60,
  });
  if (error) throw error;
  if (!allowed) throw new RateLimitedError();
}

/**
 * Load a unit's owner information and confirm the caller may change it.
 *
 * Fetching first means "no longer exists" and "not yours" produce distinct,
 * accurate messages — RLS alone would report both as zero rows changed.
 */
async function assertCanWriteUnit(unitId: string) {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: unit, error } = await supabase
    .from("units")
    .select("id, assigned_pm")
    .eq("id", unitId)
    .maybeSingle();
  if (error) throw error;
  if (!unit) throw new NotFoundError("That unit no longer exists.");

  const aliases = await currentPmAliases();
  if (!canWriteUnit(user, unit, aliases)) throw new ForbiddenError();

  return { supabase, unitId: unit.id };
}

/** Edit the details the owner types once per unit. */
export async function updateUnit(input: unknown): Promise<Result<null>> {
  try {
    const parsed = updateUnitSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues, parsed.error.issues[0]?.message);
    }
    const { id, displayName, clientName, onedriveFolderUrl, stageOverride } = parsed.data;

    const { supabase } = await assertCanWriteUnit(id);
    await checkEditRate(supabase);

    const patch: TablesUpdate<"units"> = {};
    if (displayName !== undefined) patch.display_name = displayName;
    if (clientName !== undefined) patch.client_name = clientName;
    if (onedriveFolderUrl !== undefined) patch.onedrive_folder_url = onedriveFolderUrl;
    if (stageOverride !== undefined) patch.stage_override = stageOverride;
    if (Object.keys(patch).length === 0) return toResult(null);

    const { error } = await supabase.from("units").update(patch).eq("id", id);
    if (error) throw error;

    revalidatePath("/units");
    revalidatePath(`/units/${id}`);
    return toResult(null);
  } catch (err) {
    return fromError(err);
  }
}

/**
 * Record which of a unit's clients the newsletter names, and what each is called.
 *
 * Stored against the client's NAME, so the next sheet refresh cannot lose it.
 * `shown: null` means "no decision" and puts the unit back to naming everyone,
 * which is why the column is nullable rather than defaulting to an empty array.
 */
export async function setUnitClients(input: unknown): Promise<Result<null>> {
  try {
    const parsed = setUnitClientsSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues, parsed.error.issues[0]?.message);
    }
    const { id, titles, shown } = parsed.data;

    const { supabase } = await assertCanWriteUnit(id);
    await checkEditRate(supabase);

    const { error } = await supabase
      .from("units")
      .update({ client_titles: titles, client_shown: shown })
      .eq("id", id);
    if (error) throw error;

    revalidatePath("/units");
    revalidatePath(`/units/${id}`);
    return toResult(null);
  } catch (err) {
    return fromError(err);
  }
}

/**
 * Replace the Area of Concern bullets.
 *
 * `null` clears the override so the box goes back to following the sheet's
 * Notes; an empty array means the owner deliberately emptied it.
 */
export async function setUnitConcerns(input: unknown): Promise<Result<null>> {
  try {
    const parsed = setConcernsSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues, parsed.error.issues[0]?.message);
    }
    const { id, concerns } = parsed.data;

    const { supabase } = await assertCanWriteUnit(id);
    await checkEditRate(supabase);

    const { error } = await supabase
      .from("units")
      .update({ concerns_override: concerns })
      .eq("id", id);
    if (error) throw error;

    revalidatePath(`/units/${id}`);
    return toResult(null);
  } catch (err) {
    return fromError(err);
  }
}

/**
 * Tick or untick one quotation.
 *
 * The choice is remembered, so the next upload does not undo it — that is
 * enforced on the import side, which never writes this column for a quotation
 * it has seen before.
 */
export async function setQuotationIncluded(input: unknown): Promise<Result<null>> {
  try {
    const parsed = setQuotationIncludedSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues, parsed.error.issues[0]?.message);
    }
    const { quotationId, include } = parsed.data;

    const user = await requireUser();
    const supabase = await createClient();

    // Find which unit this quotation belongs to before judging permission.
    const { data: quotation, error: fetchError } = await supabase
      .from("quotations")
      .select("id, unit_id, units(id, assigned_pm)")
      .eq("id", quotationId)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!quotation?.units) throw new NotFoundError("That quotation no longer exists.");

    const aliases = await currentPmAliases();
    if (!canWriteUnit(user, quotation.units, aliases)) throw new ForbiddenError();

    await checkEditRate(supabase);

    const { error } = await supabase
      .from("quotations")
      .update({ include_in_newsletter: include })
      .eq("id", quotationId);
    if (error) throw error;

    revalidatePath("/units");
    revalidatePath(`/units/${quotation.unit_id}`);
    return toResult(null);
  } catch (err) {
    return fromError(err);
  }
}
