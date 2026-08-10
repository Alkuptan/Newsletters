/**
 * The role matrix from docs/SPEC.md, as tests.
 *
 * One positive AND one negative case per cell that matters. These guard the
 * TypeScript half of the rules; the SQL half was exercised against the real
 * database by signing in as each seeded role. Both halves have to agree —
 * if you change one, change the other and update this file.
 */

import { describe, expect, it } from "vitest";
import {
  canCreateEdition,
  canExportUnit,
  canReadUnit,
  canUploadSheet,
  canWriteUnit,
  isMyUnit,
} from "@/features/units/permissions";

const admin = { id: "u-admin", role: "admin" as const, is_active: true };
const pm = { id: "u-pm", role: "project_manager" as const, is_active: true };
const viewer = { id: "u-viewer", role: "member" as const, is_active: true };

/** Mariam Sobhy's unit. */
const MINE = { assigned_pm: "Mariam Sobhy" };
/** Heba Kamal's unit. */
const THEIRS = { assigned_pm: "Heba Kamal" };
const UNASSIGNED = { assigned_pm: null };

const MARIAM = ["Mariam Sobhy"];
const NOBODY: string[] = [];

describe("seeing units", () => {
  it("lets an admin see every unit", () => {
    expect(canReadUnit(admin, MINE, NOBODY)).toBe(true);
    expect(canReadUnit(admin, THEIRS, NOBODY)).toBe(true);
  });

  it("lets a viewer see every unit — that is the point of the role", () => {
    expect(canReadUnit(viewer, MINE, NOBODY)).toBe(true);
    expect(canReadUnit(viewer, THEIRS, NOBODY)).toBe(true);
  });

  it("shows a project manager their own units and hides everyone else's", () => {
    expect(canReadUnit(pm, MINE, MARIAM)).toBe(true);
    expect(canReadUnit(pm, THEIRS, MARIAM)).toBe(false);
  });

  it("hides an unassigned unit from a project manager", () => {
    // A blank Assigned PM must not read as "belongs to everyone".
    expect(canReadUnit(pm, UNASSIGNED, MARIAM)).toBe(false);
  });

  it("shows a project manager nothing when nobody has mapped their name yet", () => {
    expect(canReadUnit(pm, MINE, NOBODY)).toBe(false);
  });
});

describe("changing units", () => {
  it("lets an admin change any unit", () => {
    expect(canWriteUnit(admin, THEIRS, NOBODY)).toBe(true);
  });

  it("lets a project manager change their own unit only", () => {
    expect(canWriteUnit(pm, MINE, MARIAM)).toBe(true);
    expect(canWriteUnit(pm, THEIRS, MARIAM)).toBe(false);
  });

  it("never lets a viewer change anything", () => {
    // The negative case that matters most: a viewer can see this unit, so it
    // would be easy to let reading imply writing.
    expect(canReadUnit(viewer, MINE, NOBODY)).toBe(true);
    expect(canWriteUnit(viewer, MINE, NOBODY)).toBe(false);
    expect(canWriteUnit(viewer, THEIRS, NOBODY)).toBe(false);
  });
});

describe("uploading the follow-up sheet", () => {
  it("is admin-only, because one upload rewrites every unit's figures", () => {
    expect(canUploadSheet(admin)).toBe(true);
    expect(canUploadSheet(pm)).toBe(false);
    expect(canUploadSheet(viewer)).toBe(false);
  });
});

describe("opening a new edition", () => {
  it("is admin-only, because an edition covers the whole programme", () => {
    expect(canCreateEdition(admin)).toBe(true);
    expect(canCreateEdition(pm)).toBe(false);
    expect(canCreateEdition(viewer)).toBe(false);
  });
});

describe("exporting", () => {
  it("follows what the person can see", () => {
    expect(canExportUnit(viewer, THEIRS, NOBODY)).toBe(true);
    expect(canExportUnit(pm, MINE, MARIAM)).toBe(true);
    expect(canExportUnit(pm, THEIRS, MARIAM)).toBe(false);
  });
});

describe("deactivated people", () => {
  it("can do nothing at all, whatever their role says", () => {
    const suspended = { ...admin, is_active: false };
    expect(canReadUnit(suspended, MINE, NOBODY)).toBe(false);
    expect(canWriteUnit(suspended, MINE, NOBODY)).toBe(false);
    expect(canUploadSheet(suspended)).toBe(false);
    expect(canCreateEdition(suspended)).toBe(false);
  });
});

describe("matching a PM to the sheet's spelling", () => {
  it("ignores case and any amount of stray spacing", () => {
    // A doubled space typed into the spreadsheet must not silently hide a PM's
    // own units — the worst failure mode this rule has.
    expect(isMyUnit({ assigned_pm: "  mariam   sobhy" }, ["Mariam Sobhy"])).toBe(true);
    expect(isMyUnit({ assigned_pm: "  Mariam Sobhy  " }, ["mariam sobhy"])).toBe(true);
    expect(isMyUnit({ assigned_pm: "Mariam Sobhy" }, ["MARIAM SOBHY"])).toBe(true);
  });

  it("still refuses a genuinely different name", () => {
    expect(isMyUnit({ assigned_pm: "Heba Kamal" }, ["Mariam Sobhy"])).toBe(false);
  });

  it("supports one person appearing under several spellings", () => {
    const aliases = ["Mariam Sobhy", "N. Amer"];
    expect(isMyUnit({ assigned_pm: "N. Amer" }, aliases)).toBe(true);
  });

  it("never matches a blank name to a blank alias", () => {
    expect(isMyUnit({ assigned_pm: null }, [""])).toBe(false);
    expect(isMyUnit({ assigned_pm: "" }, ["Mariam Sobhy"])).toBe(false);
  });
});
