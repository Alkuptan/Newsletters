/**
 * Schemas for a unit's site photos.
 *
 * Limits match the CHECK constraints in migrations 0006 and 0009: Zod produces
 * the sentence the owner reads, the constraint is the backstop.
 */

import { z } from "zod";

/** How many photos each layout can show (see `PHOTO_SLOTS` in layout.ts). */
export const PHOTO_SLOTS_WITH_SCHEDULE = 2;
export const PHOTO_SLOTS_WITHOUT_SCHEDULE = 6;

/** An uploaded object's key inside the `unit-photos` bucket. */
const storagePathField = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine((value) => !value.includes(".."), "That file path is not allowed.");

export const registerPhotosSchema = z.object({
  unitId: z.guid(),
  photos: z
    .array(
      z.object({
        storagePath: storagePathField,
        description: z
          .string()
          .trim()
          .max(500, "A photo caption must be 500 characters or fewer.")
          .default(""),
        /** When the photo was taken, if the file told us. */
        takenAt: z.string().datetime({ offset: true }).nullable().default(null),
      }),
    )
    .min(1, "No photos to add.")
    // A cycle's worth of site photos for one unit; far above the 6 that fit.
    .max(60, "Sixty photos at a time is the limit."),
});
export type RegisterPhotosInput = z.infer<typeof registerPhotosSchema>;

export const setPhotoSelectedSchema = z.object({
  photoId: z.guid(),
  selected: z.boolean(),
});
export type SetPhotoSelectedInput = z.infer<typeof setPhotoSelectedSchema>;

/** The full order of the ticked photos, top-left to bottom-right. */
export const reorderPhotosSchema = z.object({
  unitId: z.guid(),
  photoIds: z.array(z.guid()).max(60),
});
export type ReorderPhotosInput = z.infer<typeof reorderPhotosSchema>;

export const deletePhotoSchema = z.object({
  photoId: z.guid(),
});
export type DeletePhotoInput = z.infer<typeof deletePhotoSchema>;

export const setOnedriveFolderSchema = z.object({
  unitId: z.guid(),
  url: z
    .string()
    .trim()
    .max(2000, "That link is too long.")
    .refine(
      (value) => value === "" || /^https?:\/\//i.test(value),
      "A folder link should start with https://",
    ),
});
export type SetOnedriveFolderInput = z.infer<typeof setOnedriveFolderSchema>;

/** Clear a unit's photos before adding this cycle's. */
export const clearUnitPhotosSchema = z.object({
  unitId: z.guid(),
});
