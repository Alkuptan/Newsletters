/**
 * Building a real Outlook message file, attachments and all.
 *
 * A compose LINK (`mailto:` or Outlook's web deeplink) can carry addresses and
 * text but never a file — no URL scheme can. A `.eml` file is a different thing:
 * it is the message itself, in the format mail has used since RFC 822, so it can
 * hold the newsletter inline in the body AND the PDF as an attachment.
 *
 * Two details make it behave like a draft rather than a received message:
 *
 * - **`X-Unsent: 1`** — Outlook opens the file in COMPOSE mode, with a working
 *   Send button, instead of read-only. This is the whole trick.
 * - **no `From` header** — Outlook fills in the signed-in account, so the message
 *   goes out as the person sending it, from their own mailbox, with their
 *   signature and their Sent Items. Nothing is impersonated and no password is
 *   involved.
 *
 * `Thread-Topic` is set to the unit's subject so Outlook files each unit's
 * newsletters under one conversation. That is only GROUPING, and only inside
 * Outlook — the client's own mail app ignores it.
 *
 * A real reply needs `In-Reply-To`/`References` carrying the previous message's
 * `Message-ID`, which exists only once Exchange has actually sent something. The
 * tool cannot read that back itself, so the id is captured outside and stored
 * per unit (`units.thread_message_id`); pass it as `inReplyTo` and the message
 * lands in the thread. Without one, the newsletter starts a new thread, which is
 * what it always did.
 *
 * Pure and synchronous: takes already-encoded base64, returns the file's text.
 * Everything fiddly here is line endings, header encoding and boundaries, and all
 * three are unit-tested.
 */

/** Mail requires CRLF. A lone \n makes some clients treat headers as body. */
const CRLF = "\r\n";

export interface EmlAttachment {
  filename: string;
  /** e.g. "application/pdf" */
  mimeType: string;
  /** Base64, unwrapped — this module wraps it. */
  base64: string;
  /**
   * When set, the part is inline and the HTML body can show it with
   * `<img src="cid:THIS">` rather than it arriving as a separate file.
   */
  contentId?: string;
}

export interface EmlMessage {
  to: readonly string[];
  cc?: readonly string[];
  subject: string;
  /** Plain text, as the person typed it. Converted to HTML for the body. */
  body: string;
  /** Shown inside the message body, above the signature. */
  inline?: EmlAttachment;
  /** Arrive as attachments. */
  attachments?: readonly EmlAttachment[];
  /** Stable per unit, so Outlook groups the conversation. Defaults to the subject. */
  threadTopic?: string;
  /**
   * The previous newsletter's `Message-ID`, which turns this from a new email
   * into a genuine reply in the same thread.
   *
   * Ignored unless it is a well-formed `<token@token>` — see `messageIdOrNull`.
   */
  inReplyTo?: string;
  /** Caps the inline picture's width in the message body. */
  imageWidthPx?: number;
  /**
   * The sender's sign-off, appended at the end.
   *
   * Outlook adds a signature to a message IT composes, not to one it opens from a
   * file, so a prepared draft arrives unsigned unless the signature travels with
   * it. Treated as plain text, not HTML: a pasted signature with broken markup
   * would break the whole message, and the failure would be visible only to the
   * client.
   */
  signature?: string;
}

/** Base64 must be wrapped; some servers reject lines over 998 characters. */
function wrap(base64: string, width = 76): string {
  const lines: string[] = [];
  for (let at = 0; at < base64.length; at += width) {
    lines.push(base64.slice(at, at + width));
  }
  return lines.join(CRLF);
}

const isAscii = (value: string) => !/[^ -~]/.test(value);

/**
 * Encode a header value that is not plain ASCII.
 *
 * An Arabic or accented client name in the subject arrives as mojibake without
 * this — RFC 2047 is how mail carries anything outside ASCII in a header.
 */
function encodeHeader(value: string): string {
  if (isAscii(value)) return value;
  const utf8 = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of utf8) binary += String.fromCharCode(byte);
  return `=?UTF-8?B?${btoa(binary)}?=`;
}

/** A header value cannot contain a newline: that would inject a header. */
function safeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/**
 * A `Message-ID`, or nothing.
 *
 * Deliberately VALIDATED rather than escaped, which is the opposite of how every
 * other header here is handled, for two reasons:
 *
 * - A malformed id does not fail loudly. The message sends, looks perfect, and
 *   simply does not join the thread — the exact failure this whole feature
 *   exists to fix, reappearing months later and blamed on something else.
 * - It is the one header whose value comes from another system rather than from
 *   the owner typing it, so it is the one worth refusing outright.
 *
 * `<token@token>` with no whitespace or angle brackets inside is the whole of
 * RFC 5322's `msg-id` that matters here. Anything else is dropped, and the
 * newsletter starts a new thread — which is what it did before this existed, so
 * the failure is a return to the old behaviour rather than a broken message.
 */
function messageIdOrNull(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  // 998 is the RFC 5322 line-length ceiling; a longer header would be folded or
  // rejected by a strict server.
  if (trimmed.length > 998) return null;
  return /^<[^<>\s]+@[^<>\s]+>$/.test(trimmed) ? trimmed : null;
}

function htmlEscape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Where the newsletter picture goes in the message.
 *
 * Put it mid-sentence-order — after "kindly find attached", before "should you
 * have any questions" — rather than always at the bottom. Left out of the
 * wording entirely, the picture goes last, which is what it did before this
 * existed.
 */
export const NEWSLETTER_MARKER = "{newsletter}";

/** How wide the picture is in the message, when nothing says otherwise. */
export const DEFAULT_IMAGE_WIDTH_PX = 500;

/**
 * The typed message as HTML, with the newsletter picture in it.
 *
 * Deliberately plain: no styling beyond the font, because Outlook will add the
 * person's own signature underneath and a designed block above it looks wrong.
 *
 * `widthPx` caps the picture rather than setting it, so a narrow reading pane
 * shrinks it further instead of forcing a sideways scroll.
 */
export function bodyHtml(
  body: string,
  inlineContentId?: string,
  widthPx: number = DEFAULT_IMAGE_WIDTH_PX,
  signature?: string,
): string {
  const paragraphs = (text: string) =>
    text
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean)
      .map((block) => `<p>${htmlEscape(block).replace(/\n/g, "<br>")}</p>`)
      .join("\n");

  /*
    The `width` ATTRIBUTE, not just CSS.

    Outlook on Windows renders mail through Word, which ignores `max-width` and
    `width:100%` on an image entirely — it draws the picture at its natural pixel
    size. A 3200px-wide newsletter therefore filled the message however small the
    CSS said it should be, which is exactly what the owner reported after the
    first attempt at this. The old HTML attribute is the one Word obeys.

    The embedded picture is also scaled down before it gets here (see
    `exportNewsletterEml`), so its natural size is already close to this number —
    belt and braces, and a much smaller email.
  */
  const picture = inlineContentId
    ? `<p><img src="cid:${inlineContentId}" alt="Newsletter" width="${widthPx}" ` +
      `style="width:${widthPx}px;max-width:100%;height:auto;display:block;border:0"></p>`
    : "";

  const [before, ...rest] = body.split(NEWSLETTER_MARKER);
  const content =
    rest.length > 0
      ? // The marker says where. Anything after it follows the picture.
        [paragraphs(before), picture, paragraphs(rest.join(""))]
      : [paragraphs(body), picture];

  /*
    Escaped, not trusted as HTML. A signature is pasted in by a person, and one
    stray unclosed tag would break the rest of the message — visibly, and only to
    the client.
  */
  const signedOff = signature?.trim()
    ? `<p>${htmlEscape(signature.trim()).replace(/\n/g, "<br>")}</p>`
    : "";

  return [
    "<html><body>",
    '<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#000">',
    ...content.filter(Boolean),
    signedOff,
    "</div>",
    "</body></html>",
  ]
    .filter(Boolean)
    .join("\n");
}

function part(attachment: EmlAttachment, disposition: "inline" | "attachment"): string {
  const name = safeHeader(attachment.filename);
  const headers = [
    `Content-Type: ${attachment.mimeType}; name="${name}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: ${disposition}; filename="${name}"`,
  ];
  if (attachment.contentId) headers.push(`Content-ID: <${attachment.contentId}>`);
  return headers.join(CRLF) + CRLF + CRLF + wrap(attachment.base64);
}

/**
 * Build the `.eml` file.
 *
 * Structure — multipart/mixed wrapping a multipart/related, which is what lets an
 * inline picture and a separate attachment coexist:
 *
 *     mixed
 *       related
 *         text/html          the covering note
 *         image/jpeg inline  the newsletter, shown in the body
 *       application/pdf      the attachment
 */
export function buildEml(message: EmlMessage): string {
  // Fixed boundaries: nothing here is random, so the same message builds
  // identically every time and can be compared in a test.
  const mixed = "----newsletter-mixed-boundary";
  const related = "----newsletter-related-boundary";

  const attachments = message.attachments ?? [];
  const replyTo = messageIdOrNull(message.inReplyTo);
  const html = bodyHtml(
    message.body,
    message.inline?.contentId,
    message.imageWidthPx,
    message.signature,
  );

  const headers = [
    `To: ${message.to.map(safeHeader).join(", ")}`,
    ...(message.cc && message.cc.length > 0
      ? [`Cc: ${message.cc.map(safeHeader).join(", ")}`]
      : []),
    `Subject: ${encodeHeader(safeHeader(message.subject))}`,
    `Thread-Topic: ${encodeHeader(safeHeader(message.threadTopic ?? message.subject))}`,
    /*
      What actually makes this a reply.

      `Thread-Topic` above only makes Outlook GROUP the messages in its own
      window; these two are what every mail client — including the client's,
      which is the one that matters — uses to build a conversation.

      `References` carries the same single id rather than the full chain. A
      complete chain would be more correct, but the tool holds only the last
      message, and a References naming one real ancestor threads correctly
      everywhere. Claiming a chain we cannot verify would be worse.
    */
    ...(replyTo ? [`In-Reply-To: ${replyTo}`, `References: ${replyTo}`] : []),
    // Opens as an editable draft with a Send button rather than read-only.
    "X-Unsent: 1",
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
  ];

  const relatedBody = [
    `--${related}`,
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    html,
    ...(message.inline ? [`--${related}`, part(message.inline, "inline")] : []),
    `--${related}--`,
  ].join(CRLF);

  const body = [
    `--${mixed}`,
    `Content-Type: multipart/related; boundary="${related}"`,
    "",
    relatedBody,
    ...attachments.flatMap((attachment) => [`--${mixed}`, part(attachment, "attachment")]),
    `--${mixed}--`,
    "",
  ].join(CRLF);

  /*
    Normalised at the end rather than being careful in twenty places. The HTML is
    assembled with plain newlines for readability, and a bare LF inside a MIME
    part is tolerated by most clients but not all — and "most" is not a standard
    to send a client's message on.
  */
  return (headers.join(CRLF) + CRLF + CRLF + body).replace(/\r\n/g, "\n").replace(/\n/g, CRLF);
}

/** A filename Windows will accept, keeping the unit's name readable. */
export function emlFileName(base: string): string {
  const safe = base
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${safe || "Newsletter"}.eml`;
}
