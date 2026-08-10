/**
 * Sorting, shared by every list in the tool.
 *
 * Two rules that hold everywhere, so a column behaves the same on every screen:
 *
 * 1. **Blanks sink.** A unit with no project manager, no finish date or no
 *    verdict goes to the bottom whichever way the arrow points. Sorting is for
 *    finding the extremes among real values; a wall of blanks at the top is
 *    never what was wanted.
 * 2. **Numbers inside names count as numbers.** "Ancient Hill 5" comes before
 *    "Ancient Hill 56", not after it as plain text ordering would have it.
 */

export type SortDirection = "asc" | "desc";

export interface SortState<Field extends string = string> {
  field: Field;
  direction: SortDirection;
}

/** A field the owner can sort a list by, named as it appears on screen. */
export interface SortOption<Field extends string = string> {
  field: Field;
  label: string;
  /**
   * True when "biggest first" is the useful default for this field — progress,
   * photo counts, anything where the interesting end is the top.
   */
  descendingFirst?: boolean;
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

/** Compare two sortable values, ignoring direction. Blanks are handled by the caller. */
function compare(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

/**
 * Sort a copy of `rows` by whatever `value` reads off each one.
 *
 * `tieBreak` keeps the order stable and predictable when the sorted field is
 * equal — without it, sorting 152 units by "status" would shuffle them within
 * each status on every reload.
 */
export function sortRows<T>(
  rows: readonly T[],
  value: (row: T) => unknown,
  direction: SortDirection,
  tieBreak?: (row: T) => unknown,
): T[] {
  const sign = direction === "asc" ? 1 : -1;

  return [...rows].sort((left, right) => {
    const a = value(left);
    const b = value(right);

    // Blanks last, both ways round.
    const aBlank = isBlank(a);
    const bBlank = isBlank(b);
    if (aBlank && bBlank) return tieBreak ? compare(tieBreak(left), tieBreak(right)) : 0;
    if (aBlank) return 1;
    if (bBlank) return -1;

    const result = compare(a, b);
    if (result !== 0) return result * sign;
    return tieBreak ? compare(tieBreak(left), tieBreak(right)) : 0;
  });
}

/**
 * What clicking a column header should do.
 *
 * Clicking the column already being sorted flips it; clicking a different one
 * starts on that column's own natural direction.
 */
export function nextSort<Field extends string>(
  current: SortState<Field>,
  field: Field,
  options: readonly SortOption<Field>[],
): SortState<Field> {
  if (current.field === field) {
    return { field, direction: current.direction === "asc" ? "desc" : "asc" };
  }
  const option = options.find((candidate) => candidate.field === field);
  return { field, direction: option?.descendingFirst ? "desc" : "asc" };
}

/**
 * Read a sort out of the address bar, falling back to the screen's default.
 *
 * An unknown field name is ignored rather than trusted — the value comes from a
 * URL anyone can type.
 */
export function sortFromParams<Field extends string>(
  params: { sort?: string; dir?: string },
  options: readonly SortOption<Field>[],
  fallback: SortState<Field>,
): SortState<Field> {
  const field = options.find((option) => option.field === params.sort)?.field;
  if (!field) return fallback;
  return { field, direction: params.dir === "desc" ? "desc" : "asc" };
}

/**
 * Rank a set of known labels so a status column sorts by severity rather than
 * by spelling — BEHIND before ON TRACK before AHEAD is what a person means by
 * "sort by status".
 */
export function rankBy<T extends string>(order: readonly T[]): (value: T | null) => number {
  const positions = new Map(order.map((value, index) => [value, index]));
  return (value) => (value === null ? order.length : (positions.get(value) ?? order.length));
}
