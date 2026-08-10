/**
 * Serve one unit photo from THIS origin.
 *
 * The only route handler in the tool, and it exists for a concrete reason
 * (docs/template/RULES.md rule 4 allows one where something forces it): both
 * exporters read the pixels of every photo — the JPG through a canvas, the
 * PowerPoint by cover-cropping each one before embedding it — and a browser
 * refuses to let a canvas read an image served from another origin. Storage's own
 * URLs are on a different host, so they cannot be used directly.
 *
 * Permission is not re-implemented here: the row is fetched with the RLS-scoped
 * client, so a photo belonging to a unit the caller cannot see simply is not
 * found. The storage read is scoped the same way by the policies in migration
 * 0009.
 */

import { createClient } from "@/lib/supabase/server";
import { currentUser } from "@/lib/supabase/dal";
import { log } from "@/lib/log";

const BUCKET = "unit-photos";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Anonymous callers get nothing — this is not a public image host.
  const user = await currentUser();
  if (!user) return new Response("Not found", { status: 404 });

  const supabase = await createClient();
  const { data: photo, error } = await supabase
    .from("unit_photos")
    .select("id, storage_path, description")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    log.error("could not look up a photo", error, { photoId: id });
    return new Response("Not found", { status: 404 });
  }
  // Missing, or on a unit this person cannot see — the same answer either way,
  // so the route cannot be used to discover which units exist.
  if (!photo?.storage_path) return new Response("Not found", { status: 404 });

  const { data: file, error: downloadError } = await supabase.storage
    .from(BUCKET)
    .download(photo.storage_path);

  if (downloadError || !file) {
    log.error("could not read a photo's bytes", downloadError, {
      photoId: id,
      path: photo.storage_path,
    });
    return new Response("Not found", { status: 404 });
  }

  return new Response(file, {
    headers: {
      "Content-Type": file.type || "image/jpeg",
      // Photos are immutable once uploaded — a replacement gets a new row and a
      // new id — so they can be cached hard. `private` because the response is
      // permission-dependent and must never land in a shared cache.
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Disposition": "inline",
    },
  });
}
