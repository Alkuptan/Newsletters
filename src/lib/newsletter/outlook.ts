/**
 * Handing a finished message to Outlook.
 *
 * The tool composes; Outlook sends. Two routes, because they fail in different
 * places:
 *
 * - **Outlook on the web** — a compose deeplink. Works on any machine with a
 *   browser, which is the point: the owner wanted to send from somewhere other
 *   than the one laptop.
 * - **`mailto:`** — hands the message to whatever mail program the machine has.
 *   Universal, but on a machine with no configured client it does nothing.
 *
 * **Neither can carry an attachment.** No URL scheme can — a link cannot hand
 * over a file. The JPG and the PDF are downloaded separately and attached by
 * hand, and that is the one manual step left. Removing it needs the tool to send
 * the mail itself, which needs Orascom IT (docs/PROJECT.md).
 */

export interface ComposeMessage {
  to: readonly string[];
  cc: readonly string[];
  subject: string;
  body: string;
}

/**
 * A cautious ceiling for the whole URL.
 *
 * Browsers accept far more, but Outlook's own handling of a very long deeplink is
 * not something to discover with a client's message half-written. The covering
 * note is a few hundred characters, so this is headroom rather than a constraint.
 */
const MAX_URL = 6000;

export interface ComposeLink {
  url: string;
  /** True when the body had to be shortened to fit — the caller should say so. */
  truncated: boolean;
}

function build(base: string, params: [string, string][], body: string): ComposeLink {
  const withBody = (text: string) => {
    const all = [...params, ["body", text] as [string, string]]
      .filter(([, value]) => value.length > 0)
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join("&");
    return `${base}${all ? (base.includes("?") ? "&" : "?") + all : ""}`;
  };

  const full = withBody(body);
  if (full.length <= MAX_URL) return { url: full, truncated: false };

  /*
    Shorten the body rather than the addresses: a message the sender can finish
    typing is recoverable, a missing recipient is not. Trimmed to a word boundary
    so it does not end mid-word.
  */
  let text = body;
  while (text.length > 0 && withBody(text + "\n\n[…]").length > MAX_URL) {
    const cut = text.lastIndexOf(" ", Math.floor(text.length * 0.9));
    text = text.slice(0, cut > 0 ? cut : Math.floor(text.length * 0.9));
  }
  return { url: withBody(text + "\n\n[…]"), truncated: true };
}

/**
 * Outlook on the web, with the message pre-filled.
 *
 * Recipients are semicolon-separated: that is what Outlook's own fields use, and
 * a comma-separated list is read as one malformed address by some versions.
 */
export function outlookWebComposeLink(message: ComposeMessage): ComposeLink {
  return build(
    "https://outlook.office.com/mail/deeplink/compose",
    [
      ["to", message.to.join(";")],
      ["cc", message.cc.join(";")],
      ["subject", message.subject],
    ],
    message.body,
  );
}

/** Whatever mail program this machine has. */
export function mailtoLink(message: ComposeMessage): ComposeLink {
  return build(
    `mailto:${message.to.map((a) => encodeURIComponent(a)).join(",")}`,
    [
      ["cc", message.cc.join(",")],
      ["subject", message.subject],
    ],
    message.body,
  );
}

/**
 * How often this unit's newsletter has gone out.
 *
 * Derived from the per-cycle sent ticks rather than stored again: one source of
 * truth, and it stays right when a cycle is re-sent.
 */
export interface SendHistory {
  first: Date | null;
  last: Date | null;
  count: number;
}

export function sendHistoryFrom(sentAt: readonly (string | null)[]): SendHistory {
  const dates = sentAt
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  return {
    first: dates[0] ?? null,
    last: dates[dates.length - 1] ?? null,
    count: dates.length,
  };
}
