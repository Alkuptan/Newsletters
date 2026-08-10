/**
 * Composing one unit's covering email.
 *
 * Two things here reach a paying client if they are wrong — the greeting and the
 * To line — so both are tested for their failure cases, not just their happy path.
 */

import { describe, expect, it } from "vitest";
import {
  fillTemplate,
  prepareMail,
  recipientsFor,
  unknownPlaceholders,
  withoutImageMarker,
} from "@/lib/newsletter/mail";

const facts = {
  clientLine: "Mr. Gasser El Sayed Ibrahim",
  unitName: "Ancient Hill 56",
  editionDate: new Date(2026, 5, 14),
  pmName: "Nouran Amer",
};

describe("filling the wording", () => {
  it("substitutes every placeholder", () => {
    expect(fillTemplate("Dear {client}, {unit} as of {date}. PM: {pm}.", facts)).toBe(
      "Dear Mr. Gasser El Sayed Ibrahim, Ancient Hill 56 as of 14 June 2026. PM: Nouran Amer.",
    );
  });

  it("substitutes a placeholder used more than once", () => {
    expect(fillTemplate("{unit} — {unit}", facts)).toBe("Ancient Hill 56 — Ancient Hill 56");
  });

  it("never leaves a bare comma where the client's name should be", () => {
    // "Dear ," is the failure that gets remembered. A visible stand-in gets fixed.
    const body = fillTemplate("Dear {client},", { ...facts, clientLine: null });
    expect(body).toBe("Dear Sir or Madam,");
    expect(body).not.toContain("{client}");
  });

  it("falls back readably when there is no project manager", () => {
    expect(fillTemplate("Regards, {pm}", { ...facts, pmName: null })).toBe(
      "Regards, the project team",
    );
  });

  it("leaves ordinary text alone, braces included", () => {
    expect(fillTemplate("Cost {approx} 5%", facts)).toBe("Cost {approx} 5%");
  });
});

describe("the picture marker", () => {
  it("is a known placeholder, not reported as a mistake", () => {
    expect(unknownPlaceholders("Dear {client},\n\n{newsletter}\n\nRegards")).toEqual([]);
  });

  it("is left in place by the substitution, because it is a position not a value", () => {
    expect(fillTemplate("{unit}\n\n{newsletter}", facts)).toContain("{newsletter}");
  });

  it("is stripped for anything that cannot carry a picture", () => {
    // A copy button or a mailto link would otherwise paste the literal word
    // "{newsletter}" into a client's email.
    expect(withoutImageMarker("One.\n\n{newsletter}\n\nTwo.")).toBe("One.\n\nTwo.");
  });

  it("takes its blank line with it rather than leaving a gap", () => {
    expect(withoutImageMarker("One.\n\n{newsletter}\n\nTwo.")).not.toMatch(/\n{3,}/);
  });

  it("leaves wording that never used it untouched", () => {
    expect(withoutImageMarker("One.\n\nTwo.")).toBe("One.\n\nTwo.");
  });
});

describe("catching a placeholder the tool does not know", () => {
  it("reports a near miss rather than sending it verbatim", () => {
    // "{Client}" and "{client_name}" both look right to whoever typed them.
    expect(unknownPlaceholders("Dear {Client}, re {client_name}")).toEqual([
      "{Client}",
      "{client_name}",
    ]);
  });

  it("says nothing when the wording is correct", () => {
    expect(unknownPlaceholders("Dear {client}, {unit} on {date} from {pm}")).toEqual([]);
  });
});

describe("working out who is addressed", () => {
  const routing = [
    { pmName: "Nouran Amer", ccEmails: ["nouran@example.com", "her.manager@example.com"] },
    { pmName: "Mariam Sobhy", ccEmails: ["mariam@example.com"] },
  ];
  const alwaysCc = ["pmo@example.com", "town.projects@example.com"];

  it("puts the clients on To and the rules on CC", () => {
    const r = recipientsFor({
      clientEmails: "client1@example.com; client2@example.com",
      pmName: "Nouran Amer",
      routing,
      alwaysCc,
    });
    expect(r.to).toEqual(["client1@example.com", "client2@example.com"]);
    expect(r.cc).toEqual([
      "nouran@example.com",
      "her.manager@example.com",
      "pmo@example.com",
      "town.projects@example.com",
    ]);
    expect(r.pmRuleMissing).toBe(false);
  });

  it("matches the PM however the sheet spelled the name", () => {
    const r = recipientsFor({
      clientEmails: null,
      pmName: "  nouran amer ",
      routing,
      alwaysCc: [],
    });
    expect(r.cc).toEqual(["nouran@example.com", "her.manager@example.com"]);
  });

  it("still copies the standing list when the PM has no rule, and says so", () => {
    const r = recipientsFor({
      clientEmails: null,
      pmName: "Someone New",
      routing,
      alwaysCc,
    });
    expect(r.cc).toEqual(["pmo@example.com", "town.projects@example.com"]);
    expect(r.pmRuleMissing).toBe(true);
  });

  it("does not claim a missing rule when the unit has no PM at all", () => {
    const r = recipientsFor({ clientEmails: null, pmName: null, routing, alwaysCc });
    expect(r.pmRuleMissing).toBe(false);
  });

  it("never copies someone who is already addressed", () => {
    const r = recipientsFor({
      clientEmails: "shared@example.com",
      pmName: "Mariam Sobhy",
      routing,
      alwaysCc: ["SHARED@example.com", "pmo@example.com"],
    });
    expect(r.to).toEqual(["shared@example.com"]);
    expect(r.cc).toEqual(["mariam@example.com", "pmo@example.com"]);
  });

  it("drops a repeated address, whatever its capitalisation", () => {
    const r = recipientsFor({
      clientEmails: null,
      pmName: "Mariam Sobhy",
      routing: [{ pmName: "Mariam Sobhy", ccEmails: ["a@x.com", "A@X.com"] }],
      alwaysCc: ["a@x.com"],
    });
    expect(r.cc).toEqual(["a@x.com"]);
  });

  it("keeps a malformed address out of To and reports it", () => {
    const r = recipientsFor({
      clientEmails: "good@example.com; typo-at-example.com",
      pmName: null,
      routing,
      alwaysCc: [],
    });
    expect(r.to).toEqual(["good@example.com"]);
    expect(r.rejected).toEqual(["typo-at-example.com"]);
  });

  it("leaves To empty rather than inventing a recipient", () => {
    const r = recipientsFor({ clientEmails: null, pmName: null, routing, alwaysCc });
    expect(r.to).toEqual([]);
  });
});

describe("the whole prepared message", () => {
  it("brings the wording and the addresses together", () => {
    const mail = prepareMail(
      {
        subjectTemplate: "{unit} Newsletter",
        bodyTemplate: "Dear {client},\n\nAs of {date}.",
        alwaysCc: ["pmo@example.com"],
      },
      { ...facts, clientEmails: "client@example.com" },
      [{ pmName: "Nouran Amer", ccEmails: ["nouran@example.com"] }],
    );
    expect(mail.subject).toBe("Ancient Hill 56 Newsletter");
    expect(mail.body).toBe("Dear Mr. Gasser El Sayed Ibrahim,\n\nAs of 14 June 2026.");
    expect(mail.to).toEqual(["client@example.com"]);
    expect(mail.cc).toEqual(["nouran@example.com", "pmo@example.com"]);
    expect(mail.unknown).toEqual([]);
  });

  it("reports an unknown placeholder from either the subject or the body", () => {
    const mail = prepareMail(
      { subjectTemplate: "{Unit} news", bodyTemplate: "Dear {client_name},", alwaysCc: [] },
      { ...facts, clientEmails: null },
      [],
    );
    expect(mail.unknown).toEqual(["{Unit}", "{client_name}"]);
  });
});
