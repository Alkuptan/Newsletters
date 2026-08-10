/**
 * Composing the covering email for one unit.
 *
 * The tool does not send anything. It fills in the wording, works out who should
 * be on the To and CC lines, and hands the result over for a person to send. That
 * boundary is deliberate and is written up in docs/PROJECT.md — an address here
 * is a suggestion on a screen, not a delivery.
 *
 * Pure functions: no database, no React, no network. The fiddly parts are the
 * placeholder substitution and the de-duplication of addresses, and both are
 * unit-tested rather than trusted.
 */

import { parseClientEmails } from "./clients";
import { formatFooterDate } from "./dates";

/**
 * The placeholders the wording may use.
 *
 * Kept deliberately small. Every one of these is something the owner cannot
 * reasonably type per unit, and anything else belongs in the sentence itself.
 */
export const MAIL_PLACEHOLDERS = [
  { token: "{client}", describes: "the client line, titles included" },
  { token: "{unit}", describes: "the unit's name on the newsletter" },
  { token: "{date}", describes: "the edition date, e.g. 14 June 2026" },
  { token: "{pm}", describes: "the project manager's name" },
] as const;

export interface MailFacts {
  /** The composed client line, e.g. "Mr. Gasser El Sayed Ibrahim". */
  clientLine: string | null;
  unitName: string;
  editionDate: Date;
  pmName: string | null;
}

/**
 * Substitute the placeholders.
 *
 * A placeholder with nothing behind it becomes a readable stand-in rather than an
 * empty gap or the literal "{client}". A greeting reading "Dear ," is the kind of
 * thing that reaches a client and is remembered, so the fallback is a word the
 * sender will notice and fix.
 */
export function fillTemplate(template: string, facts: MailFacts): string {
  return template
    .replaceAll("{client}", facts.clientLine ?? "Sir or Madam")
    .replaceAll("{unit}", facts.unitName)
    .replaceAll("{date}", formatFooterDate(facts.editionDate))
    .replaceAll("{pm}", facts.pmName ?? "the project team");
}

/** Which placeholders a piece of wording actually uses, for the editor's help text. */
export function placeholdersUsed(template: string): string[] {
  return MAIL_PLACEHOLDERS.filter((p) => template.includes(p.token)).map((p) => p.token);
}

/**
 * Anything shaped like a placeholder that the tool does not know.
 *
 * Worth surfacing: "{Client}" and "{client_name}" both look right to a person
 * writing the template, and both would be sent to a client verbatim.
 */
export function unknownPlaceholders(template: string): string[] {
  const known = new Set<string>(MAIL_PLACEHOLDERS.map((p) => p.token));
  const found = template.match(/\{[^{}]{1,40}\}/g) ?? [];
  return [...new Set(found.filter((token) => !known.has(token)))];
}

function tidyAddresses(values: readonly (string | null | undefined)[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    // Each entry may itself hold several addresses, so it goes through the same
    // splitting and validation the client cell does.
    for (const address of parseClientEmails(value ?? "").valid) {
      const key = address.toLocaleLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(address);
    }
  }
  return out;
}

export interface RecipientInput {
  /** The unit's raw `Client Email` cell. */
  clientEmails: string | null;
  /** The unit's project manager, as the sheet spells it. */
  pmName: string | null;
  /** Per-PM CC rules, keyed however the caller likes — matched case-insensitively. */
  routing: readonly { pmName: string; ccEmails: readonly string[] }[];
  /** Copied on every unit. */
  alwaysCc: readonly string[];
}

export interface Recipients {
  to: string[];
  cc: string[];
  /** Addresses in the sheet that are not email-shaped, so a typo is visible. */
  rejected: string[];
  /** True when this unit's PM has no CC rule — the CC line is then incomplete. */
  pmRuleMissing: boolean;
}

/**
 * Work out the To and CC lines for one unit.
 *
 * An address is never on both lines: something already in To is dropped from CC,
 * because a client seeing their own name copied looks like a mistake even though
 * it is harmless.
 */
export function recipientsFor(input: RecipientInput): Recipients {
  const to = tidyAddresses([input.clientEmails]);
  const rejected = parseClientEmails(input.clientEmails).rejected;

  const wanted = input.pmName?.trim().toLocaleLowerCase() ?? "";
  const rule = wanted
    ? input.routing.find((r) => r.pmName.trim().toLocaleLowerCase() === wanted)
    : undefined;

  const inTo = new Set(to.map((a) => a.toLocaleLowerCase()));
  const cc = tidyAddresses([...(rule?.ccEmails ?? []), ...input.alwaysCc]).filter(
    (address) => !inTo.has(address.toLocaleLowerCase()),
  );

  return {
    to,
    cc,
    rejected,
    // Only worth reporting when there IS a PM to have a rule for.
    pmRuleMissing: wanted.length > 0 && rule === undefined,
  };
}

export interface PreparedMail extends Recipients {
  subject: string;
  body: string;
  /** Placeholders in the wording that the tool did not recognise. */
  unknown: string[];
}

/** Everything needed to send one unit's newsletter, ready for a person to send. */
export function prepareMail(
  templates: { subjectTemplate: string; bodyTemplate: string; alwaysCc: readonly string[] },
  unit: { clientEmails: string | null; pmName: string | null } & MailFacts,
  routing: readonly { pmName: string; ccEmails: readonly string[] }[],
): PreparedMail {
  const facts: MailFacts = {
    clientLine: unit.clientLine,
    unitName: unit.unitName,
    editionDate: unit.editionDate,
    pmName: unit.pmName,
  };

  return {
    subject: fillTemplate(templates.subjectTemplate, facts),
    body: fillTemplate(templates.bodyTemplate, facts),
    unknown: [
      ...new Set([
        ...unknownPlaceholders(templates.subjectTemplate),
        ...unknownPlaceholders(templates.bodyTemplate),
      ]),
    ],
    ...recipientsFor({
      clientEmails: unit.clientEmails,
      pmName: unit.pmName,
      routing,
      alwaysCc: templates.alwaysCc,
    }),
  };
}
