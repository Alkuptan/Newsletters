/**
 * Reading the site-photos folder straight off the owner's disk, one unit at a
 * time.
 *
 * The previous approach asked the browser for an entire folder tree and read
 * every file in it. The owner's real parent folder holds around 410,000 files,
 * so that is not slow — it is impossible. Nothing there can be tuned; it has to
 * not happen.
 *
 * Instead: the parent folder is chosen ONCE and a handle to it is kept. Opening
 * a unit walks the handle to that unit's own sub-folder and lists only what is
 * inside it. Every other folder in the tree is never touched. Photos are read
 * when a thumbnail is drawn, and uploaded only when ticked.
 *
 * BROWSER ONLY, and Chromium only: the File System Access API is in Chrome and
 * Edge, which is what the office uses. Everything here degrades to "not
 * supported" elsewhere, and the per-unit file picker remains as the fallback.
 */

import { normaliseFolderKey } from "./match-folder";

/*
  Minimal typings for the File System Access API — TypeScript's DOM library does
  not ship them. Only the handful of members actually used are declared, so this
  cannot drift into claiming support for things that were never tested.
*/
export interface FsDirectoryHandle {
  kind: "directory";
  name: string;
  values(): AsyncIterableIterator<FsDirectoryHandle | FsFileHandle>;
  queryPermission?(options: { mode: "read" | "readwrite" }): Promise<PermissionState>;
  requestPermission?(options: { mode: "read" | "readwrite" }): Promise<PermissionState>;
}

export interface FsFileHandle {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
}

interface PickerWindow {
  showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<FsDirectoryHandle>;
}

/** Whether this browser can do any of it. */
export function folderBrowsingSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as PickerWindow).showDirectoryPicker === "function"
  );
}

const DB_NAME = "newsletter-photo-folder";
const STORE = "handles";
const KEY = "parent";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Remember the chosen folder.
 *
 * A directory handle is structured-cloneable, so IndexedDB can hold it — which
 * is what makes "choose it once" possible rather than once per visit.
 */
export async function rememberParentFolder(handle: FsDirectoryHandle): Promise<boolean> {
  /*
    Remembering is a convenience, never a prerequisite. If the store refuses —
    private browsing, a quota, a handle the browser will not clone — the folder
    must still be usable for this visit. Returning false lets the caller say
    "you will have to pick it again next time" instead of failing outright.
  */
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(handle, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return true;
  } catch {
    return false;
  }
}

export async function recallParentFolder(): Promise<FsDirectoryHandle | null> {
  if (!folderBrowsingSupported()) return null;
  try {
    const db = await openDb();
    const handle = await new Promise<FsDirectoryHandle | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(KEY);
      request.onsuccess = () => resolve((request.result as FsDirectoryHandle) ?? null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return handle;
  } catch {
    return null;
  }
}

export async function forgetParentFolder(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
  } catch {
    // Nothing stored, nothing to forget.
  }
}

/** Ask the browser for the parent folder. Returns null if the person cancels. */
export async function chooseParentFolder(): Promise<FsDirectoryHandle | null> {
  const picker = (window as PickerWindow).showDirectoryPicker;
  if (!picker) return null;
  try {
    return await picker({ mode: "read" });
  } catch {
    // The picker throws on cancel; that is a choice, not a failure.
    return null;
  }
}

/**
 * Whether we may still read the remembered folder.
 *
 * Permission does not survive a browser restart, so this is expected to return
 * "prompt" from time to time — one click, not an error.
 */
export async function folderPermission(
  handle: FsDirectoryHandle,
): Promise<PermissionState | "unsupported"> {
  if (!handle.queryPermission) return "unsupported";
  try {
    return await handle.queryPermission({ mode: "read" });
  } catch {
    return "denied";
  }
}

export async function requestFolderPermission(handle: FsDirectoryHandle): Promise<boolean> {
  if (!handle.requestPermission) return false;
  try {
    return (await handle.requestPermission({ mode: "read" })) === "granted";
  } catch {
    return false;
  }
}

/**
 * How deep to look for a unit's folder.
 *
 * The real layout is `parent / <zone> / <unit code> /`, so two levels is enough.
 * A limit matters: without one, a mistyped parent could walk an entire drive.
 */
const MAX_DEPTH = 2;

/** Never enumerate more than this many entries at one level — a runaway guard. */
const MAX_ENTRIES_PER_LEVEL = 5000;

export interface FoundFolder {
  handle: FsDirectoryHandle;
  /** "Ancient Hill / AH-56", for showing where the photos came from. */
  path: string;
}

/**
 * Find one unit's folder, by unit code or display name.
 *
 * Only DIRECTORY entries are walked, and only to `MAX_DEPTH`. The files inside
 * the parent and inside the zone folders are never listed — which is the whole
 * point, since listing them is what made the old approach impossible.
 */
export async function findUnitFolder(
  parent: FsDirectoryHandle,
  candidates: readonly string[],
): Promise<FoundFolder | null> {
  const wanted = new Set(candidates.map(normaliseFolderKey).filter(Boolean));
  if (wanted.size === 0) return null;

  async function walk(
    dir: FsDirectoryHandle,
    depth: number,
    trail: string[],
  ): Promise<FoundFolder | null> {
    let seen = 0;
    const subdirs: FsDirectoryHandle[] = [];

    for await (const entry of dir.values()) {
      if (++seen > MAX_ENTRIES_PER_LEVEL) break;
      if (entry.kind !== "directory") continue;
      const directory = entry as FsDirectoryHandle;
      if (wanted.has(normaliseFolderKey(directory.name))) {
        return { handle: directory, path: [...trail, directory.name].join(" / ") };
      }
      subdirs.push(directory);
    }

    if (depth >= MAX_DEPTH) return null;
    for (const child of subdirs) {
      const found = await walk(child, depth + 1, [...trail, child.name]);
      if (found) return found;
    }
    return null;
  }

  return walk(parent, 1, []);
}

export interface FolderPhoto {
  name: string;
  handle: FsFileHandle;
  lastModified: number;
  size: number;
}

const IMAGE = /\.(jpe?g|png|webp|heic|heif|gif|bmp|tiff?)$/i;

/**
 * The photos inside one unit's folder, newest first.
 *
 * `getFile()` is called per entry to read the date and size — metadata only; the
 * pixels are not read until a thumbnail asks for them.
 */
export async function listFolderPhotos(
  folder: FsDirectoryHandle,
  limit = 300,
): Promise<{ photos: FolderPhoto[]; truncated: boolean }> {
  const handles: FsFileHandle[] = [];
  let seen = 0;
  let truncated = false;

  for await (const entry of folder.values()) {
    if (entry.kind !== "file") continue;
    if (!IMAGE.test(entry.name)) continue;
    if (++seen > limit) {
      truncated = true;
      break;
    }
    handles.push(entry as FsFileHandle);
  }

  const photos = await Promise.all(
    handles.map(async (handle) => {
      const file = await handle.getFile();
      return { name: handle.name, handle, lastModified: file.lastModified, size: file.size };
    }),
  );

  // Newest first: the current state of the site is what a newsletter is for.
  photos.sort((a, b) => b.lastModified - a.lastModified);
  return { photos, truncated };
}
