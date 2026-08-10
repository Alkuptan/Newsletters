/**
 * Handing a message to Outlook, and counting how often a unit has gone out.
 *
 * The encoding is the risk here: a subject or a name with an ampersand, a plus, or
 * a non-Latin character has to survive the round trip, or the client receives a
 * mangled subject line.
 */

import { describe, expect, it } from "vitest";
import {
  mailtoLink,
  outlookWebComposeLink,
  sendHistoryFrom,
  type ComposeMessage,
} from "@/lib/newsletter/outlook";

const message: ComposeMessage = {
  to: ["client@example.com", "second@example.com"],
  cc: ["pm@elgouna.com", "pmo@elgouna.com"],
  subject: "Ancient Hill 56 Newsletter",
  body: "Dear Mr. Gasser El Sayed Ibrahim,\n\nKindly find attached the latest newsletter.",
};

describe("the Outlook on the web link", () => {
  const { url, truncated } = outlookWebComposeLink(message);

  it("points at Outlook's compose window", () => {
    expect(url.startsWith("https://outlook.office.com/mail/deeplink/compose?")).toBe(true);
    expect(truncated).toBe(false);
  });

  it("separates recipients with semicolons, which Outlook's own fields use", () => {
    const to = new URL(url).searchParams.get("to");
    expect(to).toBe("client@example.com;second@example.com");
  });

  it("carries the subject and body through unchanged", () => {
    const params = new URL(url).searchParams;
    expect(params.get("subject")).toBe("Ancient Hill 56 Newsletter");
    expect(params.get("body")).toBe(message.body);
  });

  it("survives characters that would otherwise break the link", () => {
    const { url: tricky } = outlookWebComposeLink({
      ...message,
      subject: "Cyan 11 & 12 — Newsletter #2 (50% done)",
      body: "Dear Mrs. Müller,\n\nA + B = C, see item #3 & the 100% figure.",
    });
    const params = new URL(tricky).searchParams;
    expect(params.get("subject")).toBe("Cyan 11 & 12 — Newsletter #2 (50% done)");
    expect(params.get("body")).toContain("A + B = C");
    expect(params.get("body")).toContain("Müller");
  });

  it("leaves out an empty Cc rather than sending an empty parameter", () => {
    const { url: noCc } = outlookWebComposeLink({ ...message, cc: [] });
    expect(new URL(noCc).searchParams.has("cc")).toBe(false);
  });

  it("shortens a very long body and says so, keeping every recipient", () => {
    const { url: long, truncated: cut } = outlookWebComposeLink({
      ...message,
      body: "word ".repeat(4000),
    });
    expect(cut).toBe(true);
    expect(long.length).toBeLessThanOrEqual(6000);
    // Recipients must survive: a half-typed message is recoverable, a missing
    // client is not.
    expect(new URL(long).searchParams.get("to")).toBe("client@example.com;second@example.com");
    expect(new URL(long).searchParams.get("body")).toContain("[…]");
  });
});

describe("the mailto link", () => {
  it("addresses the message and carries the rest as parameters", () => {
    const { url } = mailtoLink(message);
    expect(url.startsWith("mailto:client%40example.com,second%40example.com?")).toBe(true);
    expect(url).toContain("cc=");
    expect(url).toContain("subject=Ancient%20Hill%2056%20Newsletter");
  });

  it("still works with a single recipient and nothing copied", () => {
    const { url } = mailtoLink({ ...message, to: ["one@example.com"], cc: [] });
    expect(url.startsWith("mailto:one%40example.com?")).toBe(true);
    expect(url).not.toContain("cc=");
  });
});

describe("how often a unit has been sent", () => {
  it("reports the first, the latest and the count", () => {
    const history = sendHistoryFrom([
      "2026-07-08T09:00:00Z",
      null,
      "2026-06-14T09:00:00Z",
      "2026-08-07T09:00:00Z",
    ]);
    expect(history.count).toBe(3);
    expect(history.first?.toISOString()).toBe("2026-06-14T09:00:00.000Z");
    expect(history.last?.toISOString()).toBe("2026-08-07T09:00:00.000Z");
  });

  it("treats a unit that has never been sent as never sent", () => {
    expect(sendHistoryFrom([null, null])).toEqual({ first: null, last: null, count: 0 });
    expect(sendHistoryFrom([])).toEqual({ first: null, last: null, count: 0 });
  });

  it("reports one send as both the first and the latest", () => {
    const history = sendHistoryFrom(["2026-06-14T09:00:00Z"]);
    expect(history.count).toBe(1);
    expect(history.first).toEqual(history.last);
  });

  it("ignores a timestamp it cannot read rather than counting it", () => {
    expect(sendHistoryFrom(["not a date", "2026-06-14T09:00:00Z"]).count).toBe(1);
  });
});
