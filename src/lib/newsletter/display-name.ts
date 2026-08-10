/**
 * Suggest the unit name shown in the newsletter's grey header.
 *
 * The sheet holds terse codes (`CY-11`, `AH-56`, `Ph4-Villa-2B`) but the
 * newsletter goes to a client, so it needs "Cyan 11", "Ancient Hill 56",
 * "Phase 4 Villa 2B". This produces the suggestion; the owner can correct it
 * once per unit and the tool remembers the correction.
 */

/** Words that stay lowercase when a zone name is tidied up. */
const MINOR_WORDS = new Set(["the", "of", "and", "at", "on", "in"]);

/**
 * Tidy a zone's capitalisation. The Power Query emits the same zone with
 * different casing on different rows (`Ancient Hill` and `Ancient hill`), and
 * the client should never see the sloppy one.
 */
export function tidyZone(zone: string): string {
  return zone
    .trim()
    .split(/\s+/)
    .map((word, index) => {
      const lower = word.toLocaleLowerCase();
      if (index > 0 && MINOR_WORDS.has(lower)) return lower;
      return lower.charAt(0).toLocaleUpperCase() + lower.slice(1);
    })
    .join(" ");
}

/**
 * The suggested display name for a unit.
 *
 * Two shapes cover the sheet's 39 zones:
 *
 *   `Ph4-Villa-2B`  → "Phase 4 Villa 2B"   (the Phases zone codes its own name)
 *   `CY-11`, `AH-56`→ zone + number        ("Cyan 11", "Ancient Hill 56")
 *
 * Anything else falls back to zone + code, which is always readable even if it
 * is not pretty — and the owner can fix it.
 */
export function suggestDisplayName(unitCode: string, zone: string): string {
  const code = unitCode.trim();
  const tidiedZone = tidyZone(zone);

  // "Ph4-Villa-2B" → "Phase 4 Villa 2B". The zone is "Phases", so using it
  // would produce "Phases 4-Villa-2B" — the code itself is the better source.
  const phaseMatch = /^Ph(\d+)[-\s]+(.+)$/i.exec(code);
  if (phaseMatch) {
    const [, phaseNumber, remainder] = phaseMatch;
    return `Phase ${phaseNumber} ${remainder.replace(/[-_]+/g, " ").trim()}`;
  }

  // "CY-11" → "Cyan 11": a letter prefix abbreviating the zone, then the number.
  const prefixedMatch = /^[A-Za-z]{1,4}[-\s]+(.+)$/.exec(code);
  if (prefixedMatch && tidiedZone) {
    return `${tidiedZone} ${prefixedMatch[1].replace(/[-_]+/g, " ").trim()}`;
  }

  return tidiedZone ? `${tidiedZone} ${code}` : code;
}
