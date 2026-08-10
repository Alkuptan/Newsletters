/**
 * A unit's clients: several people, their titles, and which of them the
 * newsletter names.
 *
 * A unit can be owned by more than one person, and the sheet holds them in one
 * cell. The owner decides per unit which names appear on the page and what each
 * person is called, and those decisions have to survive the next sheet refresh —
 * so they are stored against the NAME, not against a row number. Re-importing a
 * sheet that lists the same people in a different order changes nothing.
 *
 * Pure functions only: no database, no React. The rules about what counts as a
 * separator are the fiddly part, and they are unit-tested rather than trusted.
 */

/** Titles the owner can pick, in the order the dropdown shows them. */
export const CLIENT_TITLES = ["Mr.", "Mrs.", "Ms.", "Dr.", "Eng.", "Arch."] as const;

export type ClientTitle = (typeof CLIENT_TITLES)[number];

export function isClientTitle(value: string): value is ClientTitle {
  return (CLIENT_TITLES as readonly string[]).includes(value);
}

/**
 * How names are separated inside one cell.
 *
 * Semicolon, slash and newline — deliberately NOT the comma. Egyptian and Arabic
 * names are written "Gasser El Sayed Ibrahim" but a person filling a spreadsheet
 * may well type "Ibrahim, Gasser", and splitting that produces two clients who
 * do not exist. A comma is too ambiguous to guess from, so it stays part of the
 * name and the owner separates people with a semicolon.
 */
const NAME_SEPARATORS = /[;/\n\r]+/;

/** Emails cannot contain any of these, so a comma is safe here. */
const EMAIL_SEPARATORS = /[;,\s\n\r]+/;

/** Deliberately loose: enough to catch a typo, not a standards implementation. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Titles the sheet may already carry in front of a name, and their bare forms.
 *
 * The owner's existing newsletters read "Mr. Gasser El Sayed Ibrahim", so the
 * Client Name column will often include the title. Left alone, a name like that
 * plus a title chosen here prints "Mr. Mr. Gasser …" on a page a client reads.
 * So a leading title is lifted OUT of the name and used as that person's default
 * title, which the owner can then change like any other.
 */
const TITLE_PREFIX = new Map<string, ClientTitle>([
  ["mr", "Mr."],
  ["mr.", "Mr."],
  ["mrs", "Mrs."],
  ["mrs.", "Mrs."],
  ["ms", "Ms."],
  ["ms.", "Ms."],
  ["miss", "Ms."],
  ["dr", "Dr."],
  ["dr.", "Dr."],
  ["eng", "Eng."],
  ["eng.", "Eng."],
  ["arch", "Arch."],
  ["arch.", "Arch."],
]);

/** One name as the sheet holds it, split into a title and the name proper. */
export interface SheetClient {
  name: string;
  /** A title found in front of the name in the sheet, if any. */
  sheetTitle: ClientTitle | null;
}

/**
 * Lift a leading title off a name.
 *
 * Only ever removes a word it recognises, and never the last word — "Mr" on its
 * own stays a name, because a cell containing only a title is bad data, not a
 * person with no name.
 */
export function splitSheetTitle(name: string): SheetClient {
  /*
    A title written with no space after the dot — "mr.medhat" — is real data from
    the owner's own sheet, and printing it verbatim gives a client "Dear
    mr.medhat,". The dot is what makes this safe to split on: a name like "Drew"
    begins with "Dr" but has no dot, so it is never touched.
  */
  const glued = name.match(/^(mr|mrs|ms|miss|dr|eng|arch)\.\s*(\S.*)$/i);
  if (glued) {
    const title = TITLE_PREFIX.get(`${glued[1].toLocaleLowerCase()}.`);
    if (title) return { name: glued[2].trim(), sheetTitle: title };
  }

  const [first, ...rest] = name.split(/\s+/);
  if (rest.length === 0) return { name, sheetTitle: null };
  const title = TITLE_PREFIX.get(first.toLocaleLowerCase());
  return title ? { name: rest.join(" "), sheetTitle: title } : { name, sheetTitle: null };
}

/** Split one cell into people, each with any title the sheet wrote in front. */
export function parseClients(raw: string | null | undefined): SheetClient[] {
  return parseClientNames(raw).map(splitSheetTitle);
}

/** Split one cell into people, trimmed, blank-free and de-duplicated. */
export function parseClientNames(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const names: string[] = [];
  for (const part of raw.split(NAME_SEPARATORS)) {
    const name = part.trim().replace(/\s+/g, " ");
    if (!name) continue;
    // Case-insensitive de-duplication: "Mona Ibrahim" and "mona ibrahim" are one.
    const key = name.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

export interface ParsedEmails {
  valid: string[];
  /** Anything that is not email-shaped, kept so the owner can see and fix it. */
  rejected: string[];
}

export function parseClientEmails(raw: string | null | undefined): ParsedEmails {
  const valid: string[] = [];
  const rejected: string[] = [];
  if (!raw) return { valid, rejected };
  const seen = new Set<string>();
  for (const part of raw.split(EMAIL_SEPARATORS)) {
    const candidate = part.trim().replace(/^[<]|[>]$/g, "");
    if (!candidate) continue;
    const key = candidate.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (EMAIL_SHAPE.test(candidate)) valid.push(candidate);
    else rejected.push(candidate);
  }
  return { valid, rejected };
}

/** One person, as the unit page shows them. */
export interface UnitClient {
  name: string;
  title: ClientTitle | null;
  /** Whether this person's name is printed on the newsletter. */
  shown: boolean;
  /** `title + name`, e.g. "Mr. Gasser El Sayed Ibrahim". */
  label: string;
}

/** Stored per unit, keyed by name so a sheet refresh cannot lose it. */
export interface ClientPreferences {
  titles: Record<string, string>;
  /** Names to print. `null` means "not decided yet" — see `resolveClients`. */
  shown: string[] | null;
}

function titleFor(name: string, titles: Record<string, string>): ClientTitle | null {
  // Look up case-insensitively: the sheet's capitalisation is not stable.
  const wanted = name.toLocaleLowerCase();
  for (const [key, value] of Object.entries(titles)) {
    if (key.toLocaleLowerCase() === wanted && isClientTitle(value)) return value;
  }
  return null;
}

export function clientLabel(name: string, title: ClientTitle | null): string {
  return title ? `${title} ${name}` : name;
}

/**
 * Combine the sheet's names with the owner's stored choices.
 *
 * When nothing has been decided yet (`shown` is null) EVERY name is shown. That
 * is the safe default: a newsletter naming all the owners is correct but
 * cluttered, whereas one silently naming none looks like a bug, and one naming
 * an arbitrary single owner is wrong in a way nobody would notice.
 */
export function resolveClients(
  rawNames: string | null | undefined,
  preferences: ClientPreferences,
): UnitClient[] {
  const clients = parseClients(rawNames);
  const shownKeys =
    preferences.shown === null
      ? null
      : new Set(preferences.shown.map((n) => n.toLocaleLowerCase()));

  return clients.map(({ name, sheetTitle }) => {
    // The owner's choice wins; the sheet's own title is only the starting point.
    const title = titleFor(name, preferences.titles) ?? sheetTitle;
    return {
      name,
      title,
      shown: shownKeys === null ? true : shownKeys.has(name.toLocaleLowerCase()),
      label: clientLabel(name, title),
    };
  });
}

/**
 * The single line the newsletter prints under the unit name.
 *
 * Returns null when there is nothing to print, which is what the page already
 * expects for a unit whose client is unknown.
 */
export function clientLineFor(clients: readonly UnitClient[]): string | null {
  const shown = clients.filter((c) => c.shown);
  if (shown.length === 0) return null;
  return shown.map((c) => c.label).join(" & ");
}

/** Convenience for the render path, which holds the raw cell and the prefs. */
export function clientLine(
  rawNames: string | null | undefined,
  preferences: ClientPreferences,
): string | null {
  return clientLineFor(resolveClients(rawNames, preferences));
}
