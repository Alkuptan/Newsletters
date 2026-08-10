"use client";

/**
 * Browse this unit's photos straight off the owner's disk, and upload only the
 * ones they pick.
 *
 * Replaces "upload a whole parent folder", which read every file in the tree —
 * about 410,000 of them on the real drive. Here the parent folder is chosen once
 * and remembered; opening a unit walks to that unit's own folder and lists
 * nothing else. Thumbnails are drawn from the files on disk, so nothing is
 * uploaded until it has been chosen.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FolderOpen, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { createClient } from "@/lib/supabase/client";
import { clearUnitPhotos, registerUnitPhotos } from "../actions";
import {
  chooseParentFolder,
  findUnitFolder,
  folderBrowsingSupported,
  folderPermission,
  forgetParentFolder,
  listFolderPhotos,
  recallParentFolder,
  rememberParentFolder,
  requestFolderPermission,
  type FolderPhoto,
  type FsDirectoryHandle,
} from "@/lib/newsletter/photo-folder";

const BUCKET = "unit-photos";

/** How many thumbnails to draw at once. More is slower for no benefit. */
const PAGE = 24;

type Stage =
  | { kind: "unsupported" }
  | { kind: "no-folder" }
  | { kind: "needs-permission"; handle: FsDirectoryHandle }
  | { kind: "looking" }
  | { kind: "not-found"; folderName: string }
  | { kind: "ready"; path: string; photos: FolderPhoto[]; truncated: boolean };

export function FolderBrowser({
  unitId,
  unitCode,
  displayName,
  canEdit,
  onUploaded,
}: {
  unitId: string;
  unitCode: string;
  displayName: string;
  canEdit: boolean;
  /** Called after photos are registered, so the picker above can refresh. */
  onUploaded: () => void;
}) {
  const [stage, setStage] = useState<Stage>({ kind: "looking" });
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState(PAGE);
  const [busy, setBusy] = useState(false);
  /*
    On by default. This is a bi-weekly job: each cycle's photos supersede the
    last, and only adding would grow storage by a few hundred megabytes a cycle
    against a one-gigabyte allowance. Photos a sent newsletter still shows are
    kept regardless — see clearUnitPhotos.
  */
  const [replace, setReplace] = useState(true);
  const [progress, setProgress] = useState("");
  /** Object URLs handed to <img>, revoked when this unmounts. */
  const urls = useRef<string[]>([]);

  const look = useCallback(
    async (handle: FsDirectoryHandle) => {
      setStage({ kind: "looking" });
      const found = await findUnitFolder(handle, [unitCode, displayName]);
      if (!found) {
        setStage({ kind: "not-found", folderName: unitCode });
        return;
      }
      const { photos, truncated } = await listFolderPhotos(found.handle);
      setChosen(new Set());
      setShown(PAGE);
      setStage({ kind: "ready", path: found.path, photos, truncated });
    },
    [unitCode, displayName],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!folderBrowsingSupported()) {
        if (!cancelled) setStage({ kind: "unsupported" });
        return;
      }
      const handle = await recallParentFolder();
      if (cancelled) return;
      if (!handle) {
        setStage({ kind: "no-folder" });
        return;
      }
      // Permission lapses when the browser restarts — one click, not an error.
      const permission = await folderPermission(handle);
      if (cancelled) return;
      if (permission !== "granted") {
        setStage({ kind: "needs-permission", handle });
        return;
      }
      await look(handle);
    })();
    return () => {
      cancelled = true;
    };
  }, [look]);

  // Object URLs are a memory leak if they outlive the thumbnails.
  useEffect(
    () => () => {
      for (const url of urls.current) URL.revokeObjectURL(url);
      urls.current = [];
    },
    [],
  );

  async function pickFolder() {
    const handle = await chooseParentFolder();
    if (!handle) return;
    // Use it now whether or not it can be remembered for next time.
    const remembered = await rememberParentFolder(handle);
    if (!remembered) {
      toast.info("Using that folder now, but this browser will ask for it again next time.");
    }
    await look(handle);
  }

  async function grant(handle: FsDirectoryHandle) {
    if (await requestFolderPermission(handle)) await look(handle);
    else toast.error("Without permission the tool cannot read that folder.");
  }

  async function upload() {
    if (stage.kind !== "ready" || chosen.size === 0) return;
    const picked = stage.photos.filter((photo) => chosen.has(photo.name));

    setBusy(true);
    try {
      if (replace) {
        setProgress("Clearing the old ones…");
        const cleared = await clearUnitPhotos({ unitId });
        if (!cleared.ok) {
          toast.error(cleared.error);
          return;
        }
        if (cleared.data.keptForArchive > 0) {
          toast.info(
            `${cleared.data.keptForArchive} kept because a sent newsletter still shows them — unticked, not deleted.`,
          );
        }
      }

      const supabase = createClient();
      const { shrinkPhoto, formatBytes } = await import("@/lib/newsletter/shrink-photo");
      const stored: { storagePath: string; description: string; takenAt: string | null }[] = [];
      let before = 0;
      let after = 0;

      for (const [index, photo] of picked.entries()) {
        setProgress(`${index + 1} of ${picked.length}`);
        const original = await photo.handle.getFile();
        const shrunk = await shrinkPhoto(original);
        before += shrunk.originalBytes;
        after += shrunk.finalBytes;

        const safeName = shrunk.file.name.replace(/[^A-Za-z0-9._-]/g, "-");
        const path = `${unitId}/${crypto.randomUUID()}-${safeName}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, shrunk.file, {
          contentType: shrunk.file.type || "image/jpeg",
          upsert: false,
        });
        if (error) throw new Error(`${photo.name}: ${error.message}`);

        stored.push({
          storagePath: path,
          description: "",
          takenAt: new Date(photo.lastModified).toISOString(),
        });
      }

      const result = await registerUnitPhotos({ unitId, photos: stored });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const saved =
        before > after ? `, shrunk from ${formatBytes(before)} to ${formatBytes(after)}` : "";
      toast.success(
        `${result.data.added} photo${result.data.added === 1 ? "" : "s"} added${saved}.`,
      );
      setChosen(new Set());
      onUploaded();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Those photos could not be added.");
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  if (stage.kind === "unsupported") return null;

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">From the site photos folder</h3>
        {stage.kind === "ready" && (
          <span className="text-muted-foreground text-xs">
            {stage.path} · {stage.photos.length} photo{stage.photos.length === 1 ? "" : "s"}
            {stage.truncated ? " (newest 300)" : ""}
          </span>
        )}
        <div className="ml-auto flex gap-1">
          {stage.kind === "ready" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7"
              onClick={() => void recallParentFolder().then((h) => h && look(h))}
              title="Read the folder again"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-7"
            onClick={() => void forgetParentFolder().then(pickFolder)}
          >
            <FolderOpen className="mr-1 h-3.5 w-3.5" />
            {stage.kind === "no-folder" ? "Choose the photos folder" : "Change folder"}
          </Button>
        </div>
      </div>

      {stage.kind === "no-folder" && (
        <p className="text-muted-foreground text-sm">
          Choose the folder that holds every zone&apos;s photos, once. From then on, opening a unit
          shows just that unit&apos;s pictures — nothing else in the folder is read.
        </p>
      )}

      {stage.kind === "needs-permission" && (
        <div className="space-y-2">
          <p className="text-muted-foreground text-sm">
            The browser needs permission to read that folder again. It asks once per restart.
          </p>
          <Button size="sm" onClick={() => void grant(stage.handle)}>
            Allow reading the folder
          </Button>
        </div>
      )}

      {stage.kind === "looking" && (
        <p className="text-muted-foreground text-sm">Looking for {unitCode}…</p>
      )}

      {stage.kind === "not-found" && (
        <p className="text-muted-foreground text-sm">
          No folder called <strong>{stage.folderName}</strong> in there. Its folder may be named
          differently — use <strong>Choose photos</strong> above to pick the files by hand.
        </p>
      )}

      {stage.kind === "ready" && stage.photos.length === 0 && (
        <p className="text-muted-foreground text-sm">That folder has no pictures in it.</p>
      )}

      {stage.kind === "ready" && stage.photos.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-1.5">
            {stage.photos.slice(0, shown).map((photo) => (
              <Thumb
                key={photo.name}
                photo={photo}
                checked={chosen.has(photo.name)}
                disabled={!canEdit || busy}
                registerUrl={(url) => urls.current.push(url)}
                onToggle={(on) =>
                  setChosen((current) => {
                    const next = new Set(current);
                    if (on) next.add(photo.name);
                    else next.delete(photo.name);
                    return next;
                  })
                }
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {shown < stage.photos.length && (
              <Button variant="ghost" size="sm" onClick={() => setShown((n) => n + PAGE)}>
                Show {Math.min(PAGE, stage.photos.length - shown)} more
              </Button>
            )}
            <span className="text-muted-foreground text-xs">
              {chosen.size} chosen of {stage.photos.length}
            </span>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs">
              <Checkbox
                checked={replace}
                disabled={busy}
                onCheckedChange={(checked) => setReplace(checked === true)}
                aria-label="Replace this unit's photos"
              />
              Replace what is there
            </label>
            {canEdit && (
              <Button
                size="sm"
                className="ml-auto"
                disabled={busy || chosen.size === 0}
                onClick={() => void upload()}
              >
                {busy ? `Adding… ${progress}` : `Add ${chosen.size} to this unit`}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * One thumbnail, read from disk only when it is drawn.
 *
 * This is what keeps a folder of hundreds cheap: the pixels of a photo nobody
 * scrolled to are never read.
 */
function Thumb({
  photo,
  checked,
  disabled,
  onToggle,
  registerUrl,
}: {
  photo: FolderPhoto;
  checked: boolean;
  disabled: boolean;
  onToggle: (on: boolean) => void;
  registerUrl: (url: string) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const file = await photo.handle.getFile();
      if (cancelled) return;
      const objectUrl = URL.createObjectURL(file);
      registerUrl(objectUrl);
      setUrl(objectUrl);
    })();
    return () => {
      cancelled = true;
    };
  }, [photo, registerUrl]);

  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={checked}
      aria-label={`Use ${photo.name}`}
      onClick={() => onToggle(!checked)}
      className={`group relative overflow-hidden rounded border text-left transition-colors ${
        checked ? "border-primary ring-primary/40 ring-2" : "hover:border-primary/40"
      }`}
      title={`${photo.name} · ${new Date(photo.lastModified).toLocaleDateString("en-GB")}`}
    >
      <span className="bg-muted block aspect-square w-full">
        {url && (
          // Deliberately not next/image: this is a local object URL, not a
          // served asset, and it must not be optimised or cached.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={photo.name} className="h-full w-full object-cover" />
        )}
      </span>
      {/*
        A plain marker, not a Checkbox: the tile is itself the button, and a
        Radix checkbox is a button too — nesting one inside the other is invalid
        HTML and React refuses it. The tile carries the state via aria-pressed.
      */}
      <span
        className={`absolute top-1 left-1 flex size-4 items-center justify-center rounded-[4px] border ${
          checked
            ? "border-primary bg-primary text-primary-foreground"
            : "border-input bg-background/80"
        }`}
      >
        {checked && <Check className="size-3" />}
      </span>
      <span className="text-muted-foreground block truncate px-1 py-0.5 text-[10px]">
        {new Date(photo.lastModified).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
        })}
      </span>
    </button>
  );
}
