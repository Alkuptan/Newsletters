"use server";

/**
 * A unit's site photos: registering uploads, choosing which go on the
 * newsletter, ordering them, and removing them.
 *
 * The bytes themselves are uploaded straight from the browser to Storage, which
 * keeps a handful of multi-megabyte photos out of the Worker entirely. These
 * actions record and govern them; the storage policies in migration 0009 scope
 * the objects the same way these actions scope the rows.
 */

import { revalidatePath } from "next/cache";
import { PHOTO_SLOTS } from "@/lib/newsletter/layout";
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
import { log } from "@/lib/log";
import { canWriteUnit } from "@/features/units/permissions";
import { currentPmAliases } from "@/features/units/queries";
import {
  deletePhotoSchema,
  clearUnitPhotosSchema,
  registerPhotosSchema,
  reorderPhotosSchema,
  setOnedriveFolderSchema,
  setPhotoSelectedSchema,
} from "./schema";

const BUCKET = "unit-photos";

async function assertCanWriteUnit(unitId: string, scope: string) {
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

  const { data: allowed, error: rateError } = await supabase.rpc("check_rate_limit", {
    p_scope: scope,
    p_max: 120,
    p_window_seconds: 60,
  });
  if (rateError) throw rateError;
  if (!allowed) throw new RateLimitedError();

  return { supabase };
}

/** Find the unit a photo belongs to, then check permission on that unit. */
async function assertCanWritePhoto(photoId: string, scope: string) {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: photo, error } = await supabase
    .from("unit_photos")
    .select("id, unit_id, storage_path, units(id, assigned_pm)")
    .eq("id", photoId)
    .maybeSingle();
  if (error) throw error;
  if (!photo?.units) throw new NotFoundError("That photo is no longer there.");

  const aliases = await currentPmAliases();
  if (!canWriteUnit(user, photo.units, aliases)) throw new ForbiddenError();

  const { data: allowed, error: rateError } = await supabase.rpc("check_rate_limit", {
    p_scope: scope,
    p_max: 120,
    p_window_seconds: 60,
  });
  if (rateError) throw rateError;
  if (!allowed) throw new RateLimitedError();

  return { supabase, photo };
}

/**
 * Record photos that have just been uploaded to Storage.
 *
 * New photos arrive UNticked. They are added at the end of the order, so an
 * upload never rearranges what the owner already chose.
 */
export async function registerUnitPhotos(input: unknown): Promise<Result<{ added: number }>> {
  try {
    const parsed = registerPhotosSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues, parsed.error.issues[0]?.message);
    }
    const { unitId, photos } = parsed.data;

    const { supabase } = await assertCanWriteUnit(unitId, "photo-upload");

    // Every object must sit under this unit's folder, or the storage policies
    // and these rows would disagree about who owns it.
    const stray = photos.find((photo) => !photo.storagePath.startsWith(`${unitId}/`));
    if (stray) {
      throw new ValidationError([], "Those photos were not stored against this unit.");
    }

    const { data: existing } = await supabase
      .from("unit_photos")
      .select("sort_order, is_selected")
      .eq("unit_id", unitId)
      .order("sort_order", { ascending: false });
    const startOrder = (existing?.[0]?.sort_order ?? -1) + 1;

    /*
      A unit with nothing ticked shows no photos at all, so the FIRST upload
      ticks itself — up to the six the widest layout can show. Anything after
      that arrives unticked, because by then the owner has made a choice and
      the tool must not overrule it. Same reasoning as new quotations arriving
      ticked: the useful default is the one that produces a newsletter.
    */
    const alreadyChosen = (existing ?? []).filter((row) => row.is_selected).length;
    const autoTick = Math.max(0, PHOTO_SLOTS.withoutSchedule - alreadyChosen);

    const { error } = await supabase.from("unit_photos").insert(
      photos.map((photo, index) => ({
        unit_id: unitId,
        storage_path: photo.storagePath,
        description: photo.description,
        taken_at: photo.takenAt,
        is_selected: alreadyChosen === 0 && index < autoTick,
        sort_order: startOrder + index,
      })),
    );
    if (error) throw error;

    log.info("photos registered", { unitId, count: photos.length });
    revalidatePath(`/units/${unitId}`);
    revalidatePath("/units");
    return toResult({ added: photos.length });
  } catch (err) {
    return fromError(err);
  }
}

/**
 * Tick or untick a photo.
 *
 * The layout's slot count is NOT enforced here: the newsletter renders the first
 * few ticked photos and ignores the rest, so an extra tick is harmless. The
 * picker tells the owner how many will fit, which is the useful place to say it.
 */
export async function setPhotoSelected(input: unknown): Promise<Result<null>> {
  try {
    const parsed = setPhotoSelectedSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues, parsed.error.issues[0]?.message);
    }
    const { photoId, selected } = parsed.data;

    const { supabase, photo } = await assertCanWritePhoto(photoId, "photo-tick");

    const { error } = await supabase
      .from("unit_photos")
      .update({ is_selected: selected })
      .eq("id", photoId);
    if (error) throw error;

    revalidatePath(`/units/${photo.unit_id}`);
    revalidatePath("/units");
    return toResult(null);
  } catch (err) {
    return fromError(err);
  }
}

/** Put the photos in the order the owner arranged them. */
export async function reorderUnitPhotos(input: unknown): Promise<Result<null>> {
  try {
    const parsed = reorderPhotosSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues, parsed.error.issues[0]?.message);
    }
    const { unitId, photoIds } = parsed.data;

    const { supabase } = await assertCanWriteUnit(unitId, "photo-reorder");

    // Only rows already on this unit can be reordered; a forged id from another
    // unit simply matches nothing.
    for (const [index, photoId] of photoIds.entries()) {
      const { error } = await supabase
        .from("unit_photos")
        .update({ sort_order: index })
        .eq("id", photoId)
        .eq("unit_id", unitId);
      if (error) throw error;
    }

    revalidatePath(`/units/${unitId}`);
    return toResult(null);
  } catch (err) {
    return fromError(err);
  }
}

/** Remove a photo, and its bytes with it. */
export async function deleteUnitPhoto(input: unknown): Promise<Result<null>> {
  try {
    const parsed = deletePhotoSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues, parsed.error.issues[0]?.message);
    }

    const { supabase, photo } = await assertCanWritePhoto(parsed.data.photoId, "photo-delete");

    const { error } = await supabase.from("unit_photos").delete().eq("id", photo.id);
    if (error) throw error;

    // The row is what the tool reads, so it goes first. A leftover object is
    // invisible clutter; a leftover row would be a broken image.
    if (photo.storage_path) {
      const { error: removeError } = await supabase.storage
        .from(BUCKET)
        .remove([photo.storage_path]);
      if (removeError) {
        log.error("photo row deleted but its file remains", removeError, {
          path: photo.storage_path,
        });
      }
    }

    revalidatePath(`/units/${photo.unit_id}`);
    revalidatePath("/units");
    return toResult(null);
  } catch (err) {
    return fromError(err);
  }
}

/** Save the unit's OneDrive folder link, for reference alongside the photos. */
export async function setOnedriveFolder(input: unknown): Promise<Result<null>> {
  try {
    const parsed = setOnedriveFolderSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues, parsed.error.issues[0]?.message);
    }
    const { unitId, url } = parsed.data;

    const { supabase } = await assertCanWriteUnit(unitId, "unit-edit");

    const { error } = await supabase
      .from("units")
      .update({ onedrive_folder_url: url === "" ? null : url })
      .eq("id", unitId);
    if (error) throw error;

    revalidatePath(`/units/${unitId}`);
    return toResult(null);
  } catch (err) {
    return fromError(err);
  }
}

/**
 * Clear a unit's photos, keeping only what an archived cycle still needs.
 *
 * WHY THIS EXISTS: photos otherwise accumulate forever. Six per unit across 152
 * units is a few hundred megabytes a cycle, against a storage allowance of one
 * gigabyte — so "add this cycle's photos" with no way to drop last cycle's runs
 * out of room within a few cycles.
 *
 * WHY IT IS NOT A PLAIN DELETE: a cycle's snapshot records each photo by its
 * address (`/photo/<id>`), so deleting one blanks the picture in the archived
 * copy of a newsletter that was actually sent. Those are kept and merely
 * unticked — they stop appearing on new newsletters but the archive still
 * renders. Everything else goes, rows and stored files together.
 */
export async function clearUnitPhotos(
  input: unknown,
): Promise<Result<{ removed: number; keptForArchive: number }>> {
  try {
    const parsed = clearUnitPhotosSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues, parsed.error.issues[0]?.message);
    }
    const { unitId } = parsed.data;

    const { supabase } = await assertCanWriteUnit(unitId, "photo-clear");

    const { data: photos, error } = await supabase
      .from("unit_photos")
      .select("id, storage_path")
      .eq("unit_id", unitId);
    if (error) throw error;
    if (!photos || photos.length === 0) return toResult({ removed: 0, keptForArchive: 0 });

    // Which of them a past cycle still shows.
    const { data: links, error: linkError } = await supabase
      .from("edition_units")
      .select("snapshot")
      .eq("unit_id", unitId)
      .not("snapshot", "is", null);
    if (linkError) throw linkError;

    const referenced = new Set<string>();
    for (const link of links ?? []) {
      const snapshot = link.snapshot as { view?: { photos?: { url?: string }[] } } | null;
      for (const photo of snapshot?.view?.photos ?? []) {
        const id = photo.url?.match(/\/photo\/([0-9a-f-]{36})/i)?.[1];
        if (id) referenced.add(id);
      }
    }

    const disposable = photos.filter((photo) => !referenced.has(photo.id));
    const kept = photos.length - disposable.length;

    if (disposable.length > 0) {
      const paths = disposable
        .map((photo) => photo.storage_path)
        .filter((path): path is string => Boolean(path));
      if (paths.length > 0) {
        // Best effort: an object that has already gone must not stop the rows
        // going, or the unit is stuck with photos it cannot clear.
        await supabase.storage.from("unit-photos").remove(paths);
      }
      const { error: deleteError } = await supabase
        .from("unit_photos")
        .delete()
        .in(
          "id",
          disposable.map((photo) => photo.id),
        );
      if (deleteError) throw deleteError;
    }

    // Anything kept for the archive must stop appearing on new newsletters.
    if (kept > 0) {
      const { error: untickError } = await supabase
        .from("unit_photos")
        .update({ is_selected: false })
        .eq("unit_id", unitId)
        .in("id", [...referenced]);
      if (untickError) throw untickError;
    }

    log.info("unit photos cleared", { unitId, removed: disposable.length, keptForArchive: kept });
    revalidatePath(`/units/${unitId}`);
    revalidatePath("/units");
    return toResult({ removed: disposable.length, keptForArchive: kept });
  } catch (err) {
    return fromError(err);
  }
}
