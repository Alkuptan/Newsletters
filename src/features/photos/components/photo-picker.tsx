"use client";

/**
 * Choose which of a unit's photos go on the newsletter, and in what order.
 *
 * Files are uploaded straight from here to Storage, so several multi-megabyte
 * photos never pass through the server. The rows are then registered by a server
 * action, which is what governs them.
 *
 * Ticks and order are remembered per unit, so next cycle only the newly-arrived
 * photos need a decision.
 */

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { FolderBrowser } from "./folder-browser";
import {
  deleteUnitPhoto,
  registerUnitPhotos,
  reorderUnitPhotos,
  setOnedriveFolder,
  setPhotoSelected,
} from "../actions";

const BUCKET = "unit-photos";
/**
 * The ceiling on what we will even try to open. Everything under it is shrunk
 * automatically (see shrink-photo.ts), so this is a guard against a video or a
 * RAW file being dropped in, not a size the owner has to think about.
 */
const MAX_FILE_BYTES = 60 * 1024 * 1024;

export interface PickablePhoto {
  id: string;
  /** Same-origin URL — see src/app/photo/[id]/route.ts. */
  url: string;
  description: string;
  isSelected: boolean;
}

export function PhotoPicker({
  unitId,
  unitCode,
  displayName,
  photos,
  /** How many the current layout can show: 2 with a schedule, up to 6 without. */
  maxSlots,
  onedriveFolderUrl,
  canEdit,
}: {
  unitId: string;
  /** Used to find this unit's folder on disk. */
  unitCode: string;
  displayName: string;
  photos: PickablePhoto[];
  maxSlots: number;
  onedriveFolderUrl: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [folderUrl, setFolderUrl] = useState(onedriveFolderUrl ?? "");
  const [pending, startTransition] = useTransition();

  const selected = photos.filter((photo) => photo.isSelected);
  const overflow = Math.max(0, selected.length - maxSlots);

  async function upload(files: FileList | File[]) {
    // Picking a whole folder brings everything in it, so keep only the images —
    // a site folder routinely holds spreadsheets and PDFs too.
    const chosen = [...files].filter((file) => file.type.startsWith("image/"));
    const skipped = [...files].length - chosen.length;
    if (chosen.length === 0) {
      toast.error("No images in that selection.");
      return;
    }
    if (skipped > 0) {
      toast.info(
        `Skipping ${skipped} file${skipped === 1 ? "" : "s"} that ${skipped === 1 ? "is" : "are"} not a photo.`,
      );
    }

    const tooBig = chosen.find((file) => file.size > MAX_FILE_BYTES);
    if (tooBig) {
      toast.error(`${tooBig.name} is far too large to be a photo — please check that file.`);
      return;
    }

    setUploading(true);
    try {
      const supabase = createClient();
      const { shrinkPhoto, formatBytes } = await import("@/lib/newsletter/shrink-photo");
      const stored: { storagePath: string; description: string; takenAt: string | null }[] = [];
      let before = 0;
      let after = 0;

      for (const [index, original] of chosen.entries()) {
        setProgress(`Preparing ${index + 1} of ${chosen.length}…`);
        // Shrunk before it leaves the laptop: a camera original is ten to twenty
        // times bigger than anything the page can show.
        const shrunk = await shrinkPhoto(original);
        const file = shrunk.file;
        before += shrunk.originalBytes;
        after += shrunk.finalBytes;

        setProgress(`Uploading ${index + 1} of ${chosen.length}…`);
        // Keep the original name for recognisability but make the key unique, so
        // uploading the same filename twice does not overwrite the first.
        const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "-");
        const path = `${unitId}/${crypto.randomUUID()}-${safeName}`;

        const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
          contentType: file.type || "image/jpeg",
          upsert: false,
        });
        if (error) throw new Error(`${file.name}: ${error.message}`);

        stored.push({
          storagePath: path,
          description: "",
          // The file's own timestamp is the best guess at when it was taken.
          takenAt: original.lastModified ? new Date(original.lastModified).toISOString() : null,
        });
      }

      const saved = before - after;

      setProgress("Saving…");
      const result = await registerUnitPhotos({ unitId, photos: stored });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `${result.data.added} photo${result.data.added === 1 ? "" : "s"} added${
          saved > 0 ? `, shrunk from ${formatBytes(before)} to ${formatBytes(after)}` : ""
        }. Tick the ones to use.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Those photos could not be uploaded.");
    } finally {
      setUploading(false);
      setProgress("");
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function toggle(photo: PickablePhoto, next: boolean) {
    startTransition(async () => {
      const result = await setPhotoSelected({ photoId: photo.id, selected: next });
      if (!result.ok) toast.error(result.error);
    });
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= photos.length) return;
    const order = photos.map((photo) => photo.id);
    [order[index], order[target]] = [order[target], order[index]];
    startTransition(async () => {
      const result = await reorderUnitPhotos({ unitId, photoIds: order });
      if (!result.ok) toast.error(result.error);
    });
  }

  function remove(photo: PickablePhoto) {
    startTransition(async () => {
      const result = await deleteUnitPhoto({ photoId: photo.id });
      if (!result.ok) toast.error(result.error);
    });
  }

  function saveFolder() {
    startTransition(async () => {
      const result = await setOnedriveFolder({ unitId, url: folderUrl });
      if (!result.ok) toast.error(result.error);
      else toast.success("Photo folder link saved.");
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Photos</h2>
        <span className="text-muted-foreground text-xs">
          {selected.length} of {maxSlots} slot{maxSlots === 1 ? "" : "s"} used
        </span>
      </div>

      {overflow > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          This layout shows {maxSlots} photo{maxSlots === 1 ? "" : "s"}, so the last {overflow}{" "}
          ticked {overflow === 1 ? "one" : "ones"} will not appear. Untick {overflow} or reorder the
          ones you want first.
        </p>
      )}

      {canEdit && (
        <div
          className={`space-y-2 rounded-md border border-dashed p-3 transition-colors ${
            dragging ? "border-primary bg-primary/5" : ""
          }`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const files = event.dataTransfer.files;
            if (files && files.length > 0) void upload(files);
          }}
        >
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              const files = event.target.files;
              if (files && files.length > 0) void upload(files);
            }}
          />

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={uploading || pending}
              onClick={() => fileInput.current?.click()}
            >
              <Upload className="mr-1 h-3.5 w-3.5" />
              {uploading ? progress || "Uploading…" : "Choose photos"}
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            Opens Windows Explorer to pick individual files. You can also drag photos onto this box.
            For the usual case, use the folder browser below instead.
          </p>
        </div>
      )}

      {canEdit && (
        <FolderBrowser
          unitId={unitId}
          unitCode={unitCode}
          displayName={displayName}
          canEdit={canEdit}
          // The list above is server-rendered, so it has to be told to refetch.
          onUploaded={() => router.refresh()}
        />
      )}

      {photos.length === 0 ? (
        <p className="text-muted-foreground text-xs">No photos yet.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-2">
          {photos.map((photo, index) => {
            // Which slot this photo lands in, counting only ticked ones.
            const slot = photo.isSelected
              ? photos.filter((p, i) => p.isSelected && i <= index).length
              : null;
            const willShow = slot !== null && slot <= maxSlots;

            return (
              <li
                key={photo.id}
                className={`space-y-1 rounded border p-1.5 ${
                  photo.isSelected && !willShow ? "border-amber-400" : ""
                }`}
              >
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element -- served by
                      our own route handler at a size we control; next/image would
                      add an optimizer hop for no benefit. */}
                  <img
                    src={photo.url}
                    alt={photo.description || "Site photo"}
                    className="aspect-[4/3] w-full rounded object-cover"
                  />
                  {photo.isSelected && (
                    <span
                      className={`absolute top-1 left-1 rounded px-1.5 py-0.5 text-xs font-semibold ${
                        willShow ? "bg-primary text-primary-foreground" : "bg-amber-500 text-white"
                      }`}
                    >
                      {willShow ? slot : "extra"}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between gap-1">
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs">
                    <Checkbox
                      checked={photo.isSelected}
                      disabled={!canEdit || pending}
                      onCheckedChange={(checked) => toggle(photo, checked === true)}
                      aria-label={`Use this photo on the newsletter`}
                    />
                    Use
                  </label>
                  {canEdit && (
                    <span className="flex">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        aria-label="Move earlier"
                        disabled={pending}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowLeft className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        aria-label="Move later"
                        disabled={pending}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowRight className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        aria-label="Remove photo"
                        disabled={pending}
                        onClick={() => remove(photo)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {canEdit && (
        <div className="space-y-1 border-t pt-3">
          <Label htmlFor={`folder-${unitId}`} className="text-xs">
            OneDrive folder for this unit
          </Label>
          <Input
            id={`folder-${unitId}`}
            value={folderUrl}
            placeholder="https://…"
            onChange={(event) => setFolderUrl(event.target.value)}
            className="h-8"
          />
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={saveFolder} disabled={pending}>
              Save link
            </Button>
            {onedriveFolderUrl && (
              <a
                href={onedriveFolderUrl}
                target="_blank"
                rel="noreferrer"
                className="text-primary text-xs hover:underline"
              >
                Open the folder
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
