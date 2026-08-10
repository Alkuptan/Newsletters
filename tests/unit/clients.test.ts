/**
 * A unit's clients: splitting the sheet's cell, and composing the printed line.
 *
 * The separator rules are the whole risk here. Splitting too eagerly invents a
 * client who does not exist; splitting too timidly prints two people's names as
 * one. Both reach a paying customer on a page, so both are tested explicitly.
 */

import { describe, expect, it } from "vitest";
import {
  clientLine,
  clientLineFor,
  parseClientEmails,
  parseClientNames,
  resolveClients,
  splitSheetTitle,
  type ClientPreferences,
} from "@/lib/newsletter/clients";

const undecided: ClientPreferences = { titles: {}, shown: null };

describe("splitting the sheet's Client Name cell", () => {
  it("reads a single name unchanged", () => {
    expect(parseClientNames("Gasser El Sayed Ibrahim")).toEqual(["Gasser El Sayed Ibrahim"]);
  });

  it("splits on a semicolon, a slash and a newline", () => {
    expect(parseClientNames("Mona Ibrahim; Youssef Hakim")).toEqual([
      "Mona Ibrahim",
      "Youssef Hakim",
    ]);
    expect(parseClientNames("Mona Ibrahim / Youssef Hakim")).toEqual([
      "Mona Ibrahim",
      "Youssef Hakim",
    ]);
    expect(parseClientNames("Mona Ibrahim\nYoussef Hakim")).toEqual([
      "Mona Ibrahim",
      "Youssef Hakim",
    ]);
  });

  it("NEVER splits on a comma", () => {
    // "Ibrahim, Gasser" is one person written surname-first. Splitting it would
    // invent a second client and print a name nobody is called.
    expect(parseClientNames("Ibrahim, Gasser El Sayed")).toEqual(["Ibrahim, Gasser El Sayed"]);
  });

  it("tidies stray spacing rather than trusting the typist", () => {
    expect(parseClientNames("  Mona   Ibrahim ;;  Youssef Hakim  ")).toEqual([
      "Mona Ibrahim",
      "Youssef Hakim",
    ]);
  });

  it("drops a repeat of the same person, whatever the capitalisation", () => {
    expect(parseClientNames("Mona Ibrahim; mona ibrahim")).toEqual(["Mona Ibrahim"]);
  });

  it("treats an empty or missing cell as no clients", () => {
    expect(parseClientNames("")).toEqual([]);
    expect(parseClientNames("   ;  / ")).toEqual([]);
    expect(parseClientNames(null)).toEqual([]);
    expect(parseClientNames(undefined)).toEqual([]);
  });
});

describe("reading the email cell", () => {
  it("accepts several addresses separated any of the usual ways", () => {
    const { valid, rejected } = parseClientEmails("a@x.com; b@y.co.uk, c@z.org d@w.net");
    expect(valid).toEqual(["a@x.com", "b@y.co.uk", "c@z.org", "d@w.net"]);
    expect(rejected).toEqual([]);
  });

  it("keeps what is not an address, so the owner can see the typo", () => {
    const { valid, rejected } = parseClientEmails("good@x.com; not-an-email; also bad@");
    expect(valid).toEqual(["good@x.com"]);
    expect(rejected).toEqual(["not-an-email", "also", "bad@"]);
  });

  it("strips the angle brackets Outlook pastes in", () => {
    expect(parseClientEmails("<someone@example.com>").valid).toEqual(["someone@example.com"]);
  });

  it("drops a repeated address", () => {
    expect(parseClientEmails("a@x.com; A@X.com").valid).toEqual(["a@x.com"]);
  });
});

describe("a title the sheet already wrote in front of the name", () => {
  it("lifts it out, so a chosen title cannot double it", () => {
    // The owner's real newsletters read "Mr. Gasser El Sayed Ibrahim". Left in the
    // name, picking a title too would print "Mr. Mr. Gasser …" to a client.
    const clients = resolveClients("Mr. Gasser El Sayed Ibrahim", undecided);
    expect(clients[0].name).toBe("Gasser El Sayed Ibrahim");
    expect(clients[0].title).toBe("Mr.");
    expect(clients[0].label).toBe("Mr. Gasser El Sayed Ibrahim");
  });

  it("recognises the usual titles, with or without the dot", () => {
    expect(splitSheetTitle("Mrs Mona Ibrahim")).toEqual({
      name: "Mona Ibrahim",
      sheetTitle: "Mrs.",
    });
    expect(splitSheetTitle("eng. Youssef Hakim")).toEqual({
      name: "Youssef Hakim",
      sheetTitle: "Eng.",
    });
    expect(splitSheetTitle("Miss Nadia Fouad")).toEqual({
      name: "Nadia Fouad",
      sheetTitle: "Ms.",
    });
  });

  it("leaves a name that merely starts with a similar word alone", () => {
    expect(splitSheetTitle("Marwan Sabry")).toEqual({ name: "Marwan Sabry", sheetTitle: null });
    // "Drew" begins with "Dr" but carries no dot, so it is a name, not a title.
    expect(splitSheetTitle("Drew Hanson")).toEqual({ name: "Drew Hanson", sheetTitle: null });
    expect(splitSheetTitle("Drew")).toEqual({ name: "Drew", sheetTitle: null });
  });

  it("splits a title written with no space after the dot", () => {
    // Real data from the owner's sheet: "mr.medhat" would otherwise reach a
    // client as "Dear mr.medhat,".
    expect(splitSheetTitle("mr.medhat")).toEqual({ name: "medhat", sheetTitle: "Mr." });
    expect(splitSheetTitle("Dr.Ahmed Zaki")).toEqual({ name: "Ahmed Zaki", sheetTitle: "Dr." });
    expect(splitSheetTitle("Eng.  Nadia Fouad")).toEqual({
      name: "Nadia Fouad",
      sheetTitle: "Eng.",
    });
  });

  it("does not treat a dotted word that is not a title as one", () => {
    expect(splitSheetTitle("St.George Holdings")).toEqual({
      name: "St.George Holdings",
      sheetTitle: null,
    });
  });

  it("does not strip the only word there is", () => {
    // A cell holding just "Mr" is bad data, not a person with no name.
    expect(splitSheetTitle("Mr")).toEqual({ name: "Mr", sheetTitle: null });
  });

  it("lets the owner's own choice override the sheet's title", () => {
    const line = clientLine("Mr. Gasser El Sayed Ibrahim", {
      titles: { "Gasser El Sayed Ibrahim": "Eng." },
      shown: null,
    });
    expect(line).toBe("Eng. Gasser El Sayed Ibrahim");
  });

  it("handles a title on each of several clients", () => {
    expect(clientLine("Mr. Gasser Ibrahim; Mrs. Mona Ibrahim", undecided)).toBe(
      "Mr. Gasser Ibrahim & Mrs. Mona Ibrahim",
    );
  });
});

describe("deciding who appears on the page", () => {
  it("shows every client until the owner decides otherwise", () => {
    const clients = resolveClients("Mona Ibrahim; Youssef Hakim", undecided);
    expect(clients.map((c) => c.shown)).toEqual([true, true]);
    expect(clientLineFor(clients)).toBe("Mona Ibrahim & Youssef Hakim");
  });

  it("shows only the ticked names once the owner has chosen", () => {
    const line = clientLine("Mona Ibrahim; Youssef Hakim", {
      titles: {},
      shown: ["Youssef Hakim"],
    });
    expect(line).toBe("Youssef Hakim");
  });

  it("puts the title in front of each name", () => {
    const line = clientLine("Mona Ibrahim; Youssef Hakim", {
      titles: { "Mona Ibrahim": "Mrs.", "Youssef Hakim": "Eng." },
      shown: null,
    });
    expect(line).toBe("Mrs. Mona Ibrahim & Eng. Youssef Hakim");
  });

  it("prints nothing when the owner has unticked everyone", () => {
    expect(clientLine("Mona Ibrahim", { titles: {}, shown: [] })).toBeNull();
  });

  it("prints nothing when the sheet has no client", () => {
    expect(clientLine(null, undecided)).toBeNull();
  });

  it("keeps the sheet's order, not the order they were ticked in", () => {
    const line = clientLine("Mona Ibrahim; Youssef Hakim", {
      titles: {},
      shown: ["Youssef Hakim", "Mona Ibrahim"],
    });
    expect(line).toBe("Mona Ibrahim & Youssef Hakim");
  });
});

describe("surviving the next sheet refresh", () => {
  const chosen: ClientPreferences = {
    titles: { "mona ibrahim": "Mrs." },
    shown: ["MONA IBRAHIM"],
  };

  it("matches a stored choice regardless of capitalisation", () => {
    // The sheet's capitalisation is not stable — the owner's decision must not
    // depend on it, or a refresh silently reverts the page.
    expect(clientLine("Mona Ibrahim; Youssef Hakim", chosen)).toBe("Mrs. Mona Ibrahim");
  });

  it("ignores a stored choice for someone the sheet no longer lists", () => {
    expect(clientLine("Youssef Hakim", chosen)).toBeNull();
  });

  it("does not show a newly added client that was never ticked", () => {
    // A new part-owner appearing in the sheet must not silently appear on a page
    // the owner has already curated.
    expect(clientLine("Mona Ibrahim; Nadia Fouad", chosen)).toBe("Mrs. Mona Ibrahim");
  });

  it("ignores a title that is not one of the offered ones", () => {
    const line = clientLine("Mona Ibrahim", { titles: { "Mona Ibrahim": "Sir" }, shown: null });
    expect(line).toBe("Mona Ibrahim");
  });
});
