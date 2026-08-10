/**
 * Shrink a photo before it is uploaded.
 *
 * A site photo off a phone is 3–8 MB. Six of those across 152 units is several
 * gigabytes, against a storage allowance measured in one — so this is not an
 * optimisation, it is the difference between the tool working for a full cycle
 * and filling up halfway through one.
 *
 * Nothing is lost on the page. The newsletter's photo panel is 806 × 548 points
 * and the export rasterises at 2.5×, so no photo is ever drawn larger than about
 * 2015 × 1370 — a longest edge of 2000 px is already more than the page can show.
 * It also makes the batch export markedly faster, because every page decodes its
 * photos again to rasterise them.
 *
 * BROWSER ONLY: uses `createImageBitmap` and a canvas. Import dynamically.
 */

/** The longest edge we keep. See the panel arithmetic above. */
export const MAX_PHOTO_EDGE = 2000;

/** JPEG quality. 0.85 is the point where site photos stop looking re-compressed. */
const QUALITY = 0.85;

export interface ShrinkResult {
  file: File;
  /** Bytes before and after, so the tool can tell the owner what it saved. */
  originalBytes: number;
  finalBytes: number;
  /** False when the original was already small enough and was left alone. */
  changed: boolean;
}

/**
 * Shrink one image file, or hand it back untouched.
 *
 * Anything that cannot be decoded — a corrupt file, an exotic format, a browser
 * without `createImageBitmap` — comes back as the original rather than failing
 * the upload. A large photo is a much smaller problem than a lost one.
 */
export async function shrinkPhoto(file: File): Promise<ShrinkResult> {
  const untouched: ShrinkResult = {
    file,
    originalBytes: file.size,
    finalBytes: file.size,
    changed: false,
  };

  if (typeof createImageBitmap !== "function") return untouched;

  let bitmap: ImageBitmap;
  try {
    // `imageOrientation` applies the EXIF rotation, so a portrait photo taken on
    // a phone does not arrive on its side — the browser's own <img> would have
    // rotated it, and a raw canvas draw would not.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return untouched;
  }

  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    // Already small enough AND already a JPEG: nothing to gain from a re-encode,
    // which would only lose a generation of quality.
    if (longest <= MAX_PHOTO_EDGE && file.type === "image/jpeg") return untouched;

    const scale = longest > MAX_PHOTO_EDGE ? MAX_PHOTO_EDGE / longest : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return untouched;

    // JPEG has no transparency; a PNG with a transparent background would come
    // out black without this.
    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, width, height);
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY),
    );
    if (!blob) return untouched;

    // A re-encode that made things worse is not worth keeping — this happens
    // with small, already-optimised images.
    if (blob.size >= file.size && longest <= MAX_PHOTO_EDGE) return untouched;

    return {
      file: new File([blob], jpegName(file.name), {
        type: "image/jpeg",
        lastModified: file.lastModified,
      }),
      originalBytes: file.size,
      finalBytes: blob.size,
      changed: true,
    };
  } finally {
    bitmap.close();
  }
}

/** "DSC_0042.HEIC" → "DSC_0042.jpg", because the bytes are now a JPEG. */
function jpegName(name: string): string {
  const dot = name.lastIndexOf(".");
  return `${dot > 0 ? name.slice(0, dot) : name}.jpg`;
}

/** "4.2 MB" — for telling the owner what was saved. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
