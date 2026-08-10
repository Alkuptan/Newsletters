import { describe, it, expect } from "vitest";
import {
  matchFolders,
  normaliseFolderKey,
  unitFolderOf,
} from "@/lib/newsletter/match-folder";

const UNITS = [
  { id: "u1", unitCode: "AH-56", displayName: "Ancient Hill 56" },
  { id: "u2", unitCode: "AH-5", displayName: "Ancient Hill 5" },
  { id: "u3", unitCode: "CY-11", displayName: "Cyan 11" },
  { id: "u4", unitCode: "Ph4-Villa-2B", displayName: "Phase 4 Villa 2B" },
];

describe("normaliseFolderKey", () => {
  it("ignores case, spaces and separators", () => {
    for (const name of ["AH-56", "ah 56", "AH_56", "  Ah-56  ", "ah.56"]) {
      expect(normaliseFolderKey(name)).toBe("AH56");
    }
  });

  it("ignores zero padding after the letters", () => {
    expect(normaliseFolderKey("AH-056")).toBe("AH56");
    expect(normaliseFolderKey("AH-0056")).toBe("AH56");
  });

  it("keeps a digit that IS zero", () => {
    // "AH-0" must not normalise away to "AH".
    expect(normaliseFolderKey("AH-0")).toBe("AH0");
  });

  it("drops a trailing note in brackets", () => {
    expect(normaliseFolderKey("AH-56 (final)")).toBe("AH56");
    expect(normaliseFolderKey("AH-56 [old]")).toBe("AH56");
  });
});

describe("matchFolders", () => {
  it("matches a folder to its unit by code, however it is written", () => {
    const matched = matchFolders(["AH-56", "ah 56", "AH_056"], UNITS);
    expect(matched.map((m) => m.unit?.id)).toEqual(["u1", "u1", "u1"]);
  });

  it("matches on the display name too", () => {
    expect(matchFolders(["Ancient Hill 56"], UNITS)[0].unit?.id).toBe("u1");
    expect(matchFolders(["phase 4 villa 2b"], UNITS)[0].unit?.id).toBe("u4");
  });

  it("does not confuse a unit with a longer-numbered neighbour", () => {
    // The whole point: AH-5 and AH-56 are different villas.
    expect(matchFolders(["AH-5"], UNITS)[0].unit?.id).toBe("u2");
    expect(matchFolders(["AH-56"], UNITS)[0].unit?.id).toBe("u1");
  });

  it("reports an unknown folder rather than guessing at the nearest unit", () => {
    const [match] = matchFolders(["Site photos 2026"], UNITS);
    expect(match.unit).toBeNull();
    expect(match.ambiguous).toBe(false);
  });

  it("refuses to choose when two units answer to the same name", () => {
    const clashing = [
      { id: "a", unitCode: "X-1", displayName: "Duplicate" },
      { id: "b", unitCode: "X_1", displayName: "Also duplicate" },
    ];
    const [match] = matchFolders(["X1"], clashing);
    expect(match.unit).toBeNull();
    expect(match.ambiguous).toBe(true);
  });

  it("is not confused by a unit reachable through both its code and its name", () => {
    const single = [{ id: "s", unitCode: "Cyan 11", displayName: "Cyan 11" }];
    const [match] = matchFolders(["cyan-11"], single);
    expect(match.unit?.id).toBe("s");
    expect(match.ambiguous).toBe(false);
  });
});

describe("unitFolderOf", () => {
  it("takes the folder the file is directly inside", () => {
    expect(unitFolderOf("Photos/Ancient Hill/AH-56/IMG_1234.jpg")).toBe("AH-56");
  });

  it("works without zone folders in between", () => {
    expect(unitFolderOf("Photos/AH-56/IMG_1234.jpg")).toBe("AH-56");
  });

  it("works however deep the parent is", () => {
    expect(unitFolderOf("2026/July/Photos/Ancient Hill/AH-56/a.jpg")).toBe("AH-56");
  });

  it("returns nothing for a file loose in the chosen folder", () => {
    expect(unitFolderOf("Photos/stray.jpg")).toBeNull();
  });
});
