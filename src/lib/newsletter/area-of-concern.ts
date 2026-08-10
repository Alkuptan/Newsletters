/**
 * Seed the Area of Concern box from the sheet's `Notes` column.
 *
 * This is a starting point, not the final text — the owner reviews and edits it
 * before exporting (docs/SPEC.md, "Photo"/"Area of Concern"). Real notes are
 * written as comma-separated concerns, e.g.
 *
 *   "Hold by client until further notice, Waiting Reply's on queries by client ,
 *    Client Rep changed, New design is in progress"
 *
 * which reads far better as four bullets than as one paragraph. The cost of
 * splitting on commas is that a note carrying commas inside one thought gets
 * over-split; that is a one-click fix in the box, whereas an unreadable wall of
 * text is not.
 */

/** How many bullets the box can show before the text starts to overflow. */
export const MAX_CONCERN_BULLETS = 6;

/** Split one note into its separate concerns. */
function splitNote(note: string): string[] {
  return note
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * Turn the ticked quotations' notes into bullets for the Area of Concern box.
 *
 * Duplicates are dropped — several quotations on one unit routinely carry the
 * same note ("Pending Client Scope"), and repeating it makes the unit look
 * worse than it is.
 */
export function areaOfConcernBullets(notes: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const bullets: string[] = [];

  for (const note of notes) {
    const trimmed = note?.trim();
    if (!trimmed) continue;
    for (const bullet of splitNote(trimmed)) {
      const key = bullet.toLocaleLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      bullets.push(bullet);
    }
  }

  return bullets;
}
