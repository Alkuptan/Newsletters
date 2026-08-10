"use server";

/**
 * Record what was actually sent.
 *
 * Called after a successful export. The snapshot is written once per unit per
 * cycle and then left alone, so reopening an old cycle shows the client what they
 * received rather than what the sheet says today.
 *
 * Deliberately forgiving: if recording fails, the owner still has their file. A
 * failed bookkeeping write must never look like a failed export.
 */

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  fromError,
  toResult,
  type Result,
} from "@/lib/errors";
import { log } from "@/lib/log";
import { canReadUnit } from "@/features/units/permissions";
import { currentPmAliases } from "@/features/units/queries";
import { z } from "zod";

const recordExportSchema = z.object({
  editionId: z.guid(),
  unitId: z.guid(),
  /** The frozen newsletter — see src/lib/newsletter/snapshot.ts. */
  snapshot: z.unknown(),
});

export async function recordUnitExport(input: unknown): Promise<Result<null>> {
  try {
    const parsed = recordExportSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues, parsed.error.issues[0]?.message);
    }
    const { editionId, unitId, snapshot } = parsed.data;

    const user = await requireUser();
    const supabase = await createClient();

    const { data: unit, error: unitError } = await supabase
      .from("units")
      .select("id, assigned_pm")
      .eq("id", unitId)
      .maybeSingle();
    if (unitError) throw unitError;
    if (!unit) throw new NotFoundError("That unit no longer exists.");

    // Exporting is a read, so anyone who may SEE the unit may record having sent it.
    const aliases = await currentPmAliases();
    if (!canReadUnit(user, unit, aliases)) throw new ForbiddenError();

    const { error } = await supabase.from("edition_units").upsert(
      {
        edition_id: editionId,
        unit_id: unitId,
        snapshot: snapshot as never,
        exported_at: new Date().toISOString(),
      },
      { onConflict: "edition_id,unit_id" },
    );
    if (error) throw error;

    revalidatePath("/editions");
    return toResult(null);
  } catch (err) {
    log.error("could not record an export", err);
    return fromError(err);
  }
}
