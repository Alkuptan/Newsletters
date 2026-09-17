/**
 * The Outlook message file.
 *
 * Every failure here is silent and lands in front of a client: a header that
 * becomes body text, a subject that arrives as mojibake, an inline picture that
 * shows as a broken image, or a message Outlook opens read-only so it can never
 * be sent. So the structure is asserted, not eyeballed.
 */

import { describe, expect, it } from "vitest";
import { bodyHtml, buildEml, emlFileName } from "@/lib/newsletter/eml";

const JPEG = "/9j/4AAQSkZJRgABAQEAYABgAAD"; // a short stand-in, not a real image
const PDF = "JVBERi0xLjQKJeLjz9MK";

const message = {
  to: ["client@example.com", "second@example.com"],
  cc: ["pm@elgouna.com", "pmo@elgouna.com"],
  subject: "Ancient Hill 56 Newsletter",
  body: "Dear Mr. Gasser El Sayed Ibrahim,\n\nKindly find attached the latest newsletter.",
  inline: {
    filename: "Ancient Hill 56 Newsletter.jpg",
    mimeType: "image/jpeg",
    base64: JPEG,
    contentId: "newsletter",
  },
  attachments: [
    {
      filename: "Ancient Hill 56 Newsletter.pdf",
      mimeType: "application/pdf",
      base64: PDF,
    },
  ],
};

describe("the message Outlook opens", () => {
  const eml = buildEml(message);

  it("opens as an editable draft, not a received message", () => {
    // Without X-Unsent Outlook shows it read-only and there is no Send button.
    expect(eml).toContain("X-Unsent: 1");
  });

  it("leaves the sender to Outlook, so it goes from the person's own mailbox", () => {
    expect(eml).not.toMatch(/^From:/m);
  });

  it("addresses everyone, comma separated as mail requires", () => {
    expect(eml).toContain("To: client@example.com, second@example.com");
    expect(eml).toContain("Cc: pm@elgouna.com, pmo@elgouna.com");
  });

  it("groups each unit's newsletters under one conversation", () => {
    expect(eml).toContain("Thread-Topic: Ancient Hill 56 Newsletter");
  });

  it("separates headers from the body with a blank line", () => {
    // Get this wrong and every header is displayed as text in the message.
    const [headers] = eml.split("\r\n\r\n");
    expect(headers).toContain("MIME-Version: 1.0");
    expect(headers).not.toContain("<html>");
  });

  it("uses CRLF throughout, never a bare newline", () => {
    expect(eml.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("nests a related part inside a mixed part", () => {
    // This is what lets a picture sit in the body while a PDF arrives attached.
    expect(eml).toContain(
      'Content-Type: multipart/mixed; boundary="----newsletter-mixed-boundary"',
    );
    expect(eml).toContain(
      'Content-Type: multipart/related; boundary="----newsletter-related-boundary"',
    );
    expect(eml.trimEnd().endsWith("------newsletter-mixed-boundary--")).toBe(true);
  });

  it("shows the newsletter in the body, by content id", () => {
    expect(eml).toContain("Content-ID: <newsletter>");
    expect(eml).toContain('Content-Disposition: inline; filename="Ancient Hill 56 Newsletter.jpg"');
    expect(eml).toContain('<img src="cid:newsletter"');
  });

  it("attaches the PDF as a file rather than inline", () => {
    expect(eml).toContain(
      'Content-Disposition: attachment; filename="Ancient Hill 56 Newsletter.pdf"',
    );
    expect(eml).toContain(PDF);
  });

  it("declares base64 for both files", () => {
    expect(eml.match(/Content-Transfer-Encoding: base64/g)?.length).toBe(2);
  });
});

describe("things that would corrupt the message", () => {
  it("encodes a subject that is not plain ASCII", () => {
    const eml = buildEml({ ...message, subject: "Newsletter — Mrs. Müller" });
    // Raw UTF-8 in a header arrives as mojibake; RFC 2047 is the fix.
    expect(eml).toMatch(/Subject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=/);
    expect(eml).not.toContain("Subject: Newsletter — Mrs. Müller");
  });

  it("refuses to let a newline in a subject inject a header", () => {
    const eml = buildEml({
      ...message,
      subject: "Newsletter\r\nBcc: someone@elsewhere.com",
    });
    expect(eml).not.toMatch(/^Bcc:/m);
    expect(eml).toContain("Newsletter Bcc: someone@elsewhere.com");
  });

  it("wraps base64 so no line is over-long", () => {
    const eml = buildEml({
      ...message,
      attachments: [{ filename: "big.pdf", mimeType: "application/pdf", base64: "A".repeat(500) }],
    });
    const lines = eml.split("\r\n");
    // RFC 5322's hard limit. Some servers reject a longer line outright.
    expect(Math.max(...lines.map((line) => line.length))).toBeLessThanOrEqual(998);
    // The base64 payload itself is wrapped at 76, the conventional width.
    const payload = lines.filter((line) => /^A+$/.test(line));
    expect(payload.length).toBeGreaterThan(1);
    expect(Math.max(...payload.map((line) => line.length))).toBe(76);
  });

  it("escapes HTML in the typed message", () => {
    // A client called "Smith & Sons <Holdings>" must not break the body.
    const html = bodyHtml('Dear Smith & Sons <Holdings>, see "the figure".');
    expect(html).toContain("Smith &amp; Sons &lt;Holdings&gt;");
    expect(html).toContain("&quot;the figure&quot;");
  });

  it("keeps paragraphs and single line breaks apart", () => {
    const html = bodyHtml("Line one\nLine two\n\nNew paragraph");
    expect(html).toContain("Line one<br>Line two");
    expect(html).toContain("<p>New paragraph</p>");
  });

  it("puts the picture where the marker is, not at the end", () => {
    // The owner wants it after "kindly find attached" and above "should you have".
    const html = bodyHtml(
      "Kindly find attached the latest newsletter.\n\n{newsletter}\n\nShould you have any questions.",
      "newsletter",
    );
    const picture = html.indexOf("<img");
    expect(picture).toBeGreaterThan(html.indexOf("Kindly find attached"));
    expect(picture).toBeLessThan(html.indexOf("Should you have"));
    expect(html).not.toContain("{newsletter}");
  });

  it("still puts it last when the wording does not say where", () => {
    const html = bodyHtml("Dear Sir,\n\nRegards.", "newsletter");
    expect(html.indexOf("<img")).toBeGreaterThan(html.indexOf("Regards"));
  });

  it("leaves no empty paragraph where the marker was", () => {
    const html = bodyHtml("One.\n\n{newsletter}\n\nTwo.", "newsletter");
    expect(html).not.toContain("<p></p>");
  });

  it("sets the width as an ATTRIBUTE, which is the one Outlook obeys", () => {
    /*
      Outlook on Windows renders through Word, which ignores max-width and
      width:100% on an image and draws it at its natural pixel size. CSS alone
      left a 3200px newsletter filling the message — the owner reported exactly
      that. The old HTML attribute is what works.
    */
    expect(bodyHtml("x", "newsletter", 500)).toContain('width="500"');
    expect(bodyHtml("x", "newsletter", 900)).toContain('width="900"');
  });

  it("also sets it in CSS, for the clients that prefer that", () => {
    const html = bodyHtml("x", "newsletter", 500);
    expect(html).toContain("width:500px");
    // max-width:100% keeps it inside a narrow reading pane rather than
    // scrolling sideways.
    expect(html).toContain("max-width:100%");
  });

  it("defaults to half the original width", () => {
    expect(bodyHtml("x", "newsletter")).toContain('width="500"');
  });

  it("carries the width through the whole message", () => {
    expect(buildEml({ ...message, imageWidthPx: 700 })).toContain('width="700"');
  });

  it("removes the marker even when there is no picture to place", () => {
    const html = bodyHtml("One.\n\n{newsletter}\n\nTwo.");
    expect(html).not.toContain("{newsletter}");
    expect(html).not.toContain("<img");
  });

  it("omits the picture when there is none", () => {
    expect(bodyHtml("Just text")).not.toContain("<img");
    const eml = buildEml({ ...message, inline: undefined });
    expect(eml).not.toContain("Content-ID");
  });

  it("omits Cc entirely rather than sending an empty header", () => {
    expect(buildEml({ ...message, cc: [] })).not.toMatch(/^Cc:/m);
  });
});

/**
 * Continuing the client's existing thread.
 *
 * This is the part with no visible failure mode. A wrong or missing reply header
 * still produces a message that sends, looks right, and reads correctly — it
 * just quietly starts a new conversation, which is precisely the bug this
 * exists to fix. Nobody notices for a cycle or more, and when they do it gets
 * blamed on Outlook. So every way the id can be wrong is pinned down here.
 */
describe("replying into the existing thread", () => {
  const PREVIOUS =
    "<AM7PR07MB6216505018C229A107D3418EE9A02@AM7PR07MB6216.eurprd07.prod.outlook.com>";

  it("writes both headers a mail client needs to build a conversation", () => {
    const eml = buildEml({ ...message, inReplyTo: PREVIOUS });
    expect(eml).toContain(`In-Reply-To: ${PREVIOUS}`);
    expect(eml).toContain(`References: ${PREVIOUS}`);
  });

  it("still opens as a draft, so a reply is as sendable as a new message", () => {
    // Threading headers and X-Unsent have to coexist: a perfect reply that
    // Outlook opens read-only cannot be sent at all.
    expect(buildEml({ ...message, inReplyTo: PREVIOUS })).toContain("X-Unsent: 1");
  });

  it("writes neither header when the unit has never been sent before", () => {
    const eml = buildEml(message);
    expect(eml).not.toMatch(/^In-Reply-To:/m);
    expect(eml).not.toMatch(/^References:/m);
  });

  it("tolerates the id arriving with whitespace around it", () => {
    expect(buildEml({ ...message, inReplyTo: `  ${PREVIOUS}\t` })).toContain(
      `In-Reply-To: ${PREVIOUS}`,
    );
  });

  describe("refuses an id that is not one, rather than writing it", () => {
    // Each of these would either break threading silently or inject a header.
    const rejected: Record<string, string> = {
      "no angle brackets": "AM7PR07MB6216@example.com",
      "no domain": "<AM7PR07MB6216>",
      "empty string": "",
      "only whitespace": "   ",
      "a newline, which would inject a header": "<a@b.com>\r\nBcc: attacker@evil.com",
      "a space inside": "<a b@example.com>",
      "a nested angle bracket": "<a<b>@example.com>",
      "the word Outlook shows when there is none": "(none)",
    };

    for (const [why, value] of Object.entries(rejected)) {
      it(why, () => {
        const eml = buildEml({ ...message, inReplyTo: value });
        expect(eml).not.toMatch(/^In-Reply-To:/m);
        expect(eml).not.toMatch(/^References:/m);
      });
    }

    it("never lets an injected header reach the file", () => {
      const eml = buildEml({ ...message, inReplyTo: "<a@b.com>\r\nBcc: attacker@evil.com" });
      expect(eml).not.toContain("attacker@evil.com");
    });

    it("drops an id too long to be a legal header line", () => {
      const tooLong = `<${"x".repeat(1000)}@example.com>`;
      expect(buildEml({ ...message, inReplyTo: tooLong })).not.toMatch(/^In-Reply-To:/m);
    });
  });
});

describe("the file name", () => {
  it("keeps the unit's name and adds the extension", () => {
    expect(emlFileName("Ancient Hill 56 Newsletter")).toBe("Ancient Hill 56 Newsletter.eml");
  });

  it("removes characters Windows will not accept in a file name", () => {
    expect(emlFileName('Ph4/Villa: 2B "x" <1>')).toBe("Ph4 Villa 2B x 1.eml");
  });

  it("falls back rather than producing a nameless file", () => {
    expect(emlFileName("///")).toBe("Newsletter.eml");
  });
});
