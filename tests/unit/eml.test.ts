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

  it("omits the picture when there is none", () => {
    expect(bodyHtml("Just text")).not.toContain("<img");
    const eml = buildEml({ ...message, inline: undefined });
    expect(eml).not.toContain("Content-ID");
  });

  it("omits Cc entirely rather than sending an empty header", () => {
    expect(buildEml({ ...message, cc: [] })).not.toMatch(/^Cc:/m);
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
