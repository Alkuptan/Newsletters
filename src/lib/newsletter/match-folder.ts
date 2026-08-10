/**
 * Match a photo folder's name to a unit.
 *
 * Site folders are named by hand, so the same unit turns up as "AH-56",
 * "AH 56", "ah_56", "AH-056" and "AH-56 (final)". None of those should need the
 * owner to rename anything, so matching is done on a normalised form rather than
 * on the literal text.
 *
 * What is deliberately NOT done: fuzzy or nearest-match guessing. A folder that
 * does not clearly belong to a unit is reported as unmatched, because quietly
 * filing a villa's photos under the wrong villa is far worse than saying "these
 * three folders need a look".
 */

/** "AH-056 (final)" → "AH56". Case, padding, separators and trailing notes go. */
export function normaliseFolderKey(name: string): string {
  const withoutNote = name.replace(/\s*[([{].*$/, "");
  const bare = withoutNote.toLocaleUpperCase().replace(/[^A-Z0-9]/g, "");
  // "AH056" and "AH56" are the same unit — strip zeros padding a number that
  // follows letters, but never the digits themselves ("AH-0" stays "AH0").
  return bare.replace(/([A-Z])0+(\d)/g, "$1$2");
}

export interface MatchableUnit {
  id: string;
  unitCode: string;
  displayName: string;
}

export interface FolderMatch {
  folder: string;
  unit: MatchableUnit | null;
  /** Set when more than one unit answers to the same folder name. */
  ambiguous: boolean;
}

/**
 * Decide which unit each folder belongs to.
 *
 * A folder matches on its unit code first, then on its display name — codes are
 * what folders are usually named after, but "Ancient Hill 56" happens too.
 */
export function matchFolders(
  folders: readonly string[],
  units: readonly MatchableUnit[],
): FolderMatch[] {
  const byKey = new Map<string, MatchableUnit[]>();
  const add = (key: string, unit: MatchableUnit) => {
    if (!key) return;
    const existing = byKey.get(key);
    if (existing) {
      // The same unit reached by both its code and its name is not a clash.
      if (!existing.some((candidate) => candidate.id === unit.id)) existing.push(unit);
    } else {
      byKey.set(key, [unit]);
    }
  };

  for (const unit of units) {
    add(normaliseFolderKey(unit.unitCode), unit);
    add(normaliseFolderKey(unit.displayName), unit);
  }

  return folders.map((folder) => {
    const candidates = byKey.get(normaliseFolderKey(folder)) ?? [];
    return {
      folder,
      unit: candidates.length === 1 ? candidates[0] : null,
      ambiguous: candidates.length > 1,
    };
  });
}

/**
 * The unit-level folder for a file inside a picked directory.
 *
 * `webkitRelativePath` is "parent/Ancient Hill/AH-56/IMG_1234.jpg", and the
 * folder that identifies the unit is the one the file is directly in — whatever
 * depth the parent happens to be, and whether or not zone folders are used.
 * Returns null for a file sitting loose in the parent, which belongs to no unit.
 */
export function unitFolderOf(relativePath: string): string | null {
  const parts = relativePath.split("/").filter(Boolean);
  // [parent, ...maybe zone, unit, file] — fewer than three means no unit folder.
  return parts.length >= 3 ? parts[parts.length - 2] : null;
}
