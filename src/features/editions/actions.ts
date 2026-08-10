"use server";

/**
 * Opening and adjusting a newsletter edition.
 *
 * Admin only: an edition covers the whole programme, and its footer date is what
 * every unit's elapsed time is measured against — so creating one moves the
 * numbers on every newsletter at once.
 */

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { RateLimitedError, ValidationError, fromError, toResult, type Result } from "@/lib/errors";
import { log } from "@/lib/log";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import { createEditionSchema, updateEditionSchema } from "./schema";

/**
 * Open a new cycle.
 *
 * The newest edition by footer date is the one the unit pages use, so creating
 * one is how the owner moves the whole programme on to the next cycle.
 */
export async function createEdition(input: unknown): Promise<Result<{ id: string }>> {
  try {
    const user = await requireRole("admin");
    const supabase = await createClient();

    const { data: allowed, error: rateError } = await supabase.rpc("check_rate_limit", {
      p_scope: "edition-create",
      p_max: 10,
      p_window_seconds: 300,
    });
    if (rateError) throw rateError;
    if (!allowed) throw new RateLimitedError();

    const parsed = createEditionSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues, parsed.error.issues[0]?.message);
    }

    const { data, error } = await supabase
      .from("editions")
      .insert({
        footer_label: parsed.data.footerLabel,
        footer_date: parsed.data.footerDate,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error) throw error;

    log.info("edition opened", { editionId: data.id, footerDate: parsed.data.footerDate });

    // Every newsletter's elapsed time is measured to this date — and its footer
    // date, and the covering email's {date}. So each unit's own page too, which
    // "/units" does not cover: the dynamic children need the route pattern.
    revalidatePath("/editions");
    revalidatePath("/units");
    revalidatePath("/units/[id]", "page");
    return toResult({ id: data.id });
  } catch (err) {
    return fromError(err);
  }
}

/** Correct an edition's wording, its date, or archive it. */
export async function updateEdition(input: unknown): Promise<Result<null>> {
  try {
    await requireRole("admin");
    const supabase = await createClient();

    const parsed = updateEditionSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues, parsed.error.issues[0]?.message);
    }
    const { id, footerLabel, footerDate, status } = parsed.data;

    const patch: TablesUpdate<"editions"> = {};
    if (footerLabel !== undefined) patch.footer_label = footerLabel;
    if (footerDate !== undefined) patch.footer_date = footerDate;
    if (status !== undefined) patch.status = status;
    if (Object.keys(patch).length === 0) return toResult(null);

    const { error } = await supabase.from("editions").update(patch).eq("id", id);
    if (error) throw error;

    revalidatePath("/editions");
    revalidatePath("/units");
    // The footer label and date are on every newsletter, unit pages included.
    revalidatePath("/units/[id]", "page");
    return toResult(null);
  } catch (err) {
    return fromError(err);
  }
}
