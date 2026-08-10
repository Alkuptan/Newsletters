import { describe, it, expect } from "vitest";
import {
  describeChanges,
  findScheduleDrift,
  type ComparableFigures,
} from "@/lib/newsletter/changes";

const BASE: ComparableFigures = {
  progressPercent: 40,
  verdict: "ON TRACK",
  isComplete: false,
  startDate: "2026-06-16",
  finishDate: "2026-09-17",
  concerns: ["Pending Client Scope"],
};

const kinds = (changes: ReturnType<typeof describeChanges>) => changes.map((c) => c.kind);

describe("describeChanges", () => {
  it("says nothing about a unit that did not move", () => {
    expect(describeChanges(BASE, { ...BASE })).toEqual([]);
  });

  it("ignores progress that barely moved", () => {
    // Money-weighted progress wobbles by fractions; a point is the floor.
    expect(describeChanges(BASE, { ...BASE, progressPercent: 40 })).toEqual([]);
  });

  it("reports progress going up without asking for action", () => {
    const [change] = describeChanges(BASE, { ...BASE, progressPercent: 55 });
    expect(change.kind).toBe("progress");
    expect(change.summary).toContain("up 15 points");
    expect(change.needsAction).toBe(false);
  });

  it("asks the owner to look when progress goes BACKWARDS", () => {
    const [change] = describeChanges(BASE, { ...BASE, progressPercent: 30 });
    expect(change.summary).toContain("down 10 points");
    expect(change.needsAction).toBe(true);
  });

  it("flags a slip into BEHIND", () => {
    const [change] = describeChanges(BASE, { ...BASE, verdict: "BEHIND" });
    expect(change.kind).toBe("verdict");
    expect(change.needsAction).toBe(true);
  });

  it("does not flag recovering out of BEHIND", () => {
    const previous = { ...BASE, verdict: "BEHIND" as const };
    const [change] = describeChanges(previous, { ...BASE, verdict: "AHEAD" });
    expect(change.needsAction).toBe(false);
  });

  it("reports finishing, and does not also report the verdict change", () => {
    const changes = describeChanges(BASE, {
      ...BASE,
      isComplete: true,
      verdict: "COMPLETED",
      progressPercent: 100,
    });
    expect(kinds(changes)).toContain("completed");
    expect(kinds(changes)).not.toContain("verdict");
  });

  it("reports a unit that had no newsletter last cycle as new, not as changed", () => {
    const changes = describeChanges(null, BASE);
    expect(kinds(changes)).toEqual(["new"]);
  });

  it("lists what was added to and cleared from the Area of Concern", () => {
    const [change] = describeChanges(BASE, {
      ...BASE,
      concerns: ["Waiting on client reply", "Access blocked"],
    });
    expect(change.kind).toBe("concerns");
    expect(change.summary).toContain("added");
    expect(change.summary).toContain("Access blocked");
    expect(change.summary).toContain("cleared");
    expect(change.needsAction).toBe(true);
  });

  it("does not care what order the concerns are in", () => {
    const reordered = { ...BASE, concerns: [...BASE.concerns].reverse() };
    expect(describeChanges(BASE, reordered)).toEqual([]);
  });

  it("reports a moved finish date", () => {
    const [change] = describeChanges(BASE, { ...BASE, finishDate: "2026-10-30" });
    expect(change.kind).toBe("finish-date");
    expect(change.summary).toContain("2026-09-17");
    expect(change.summary).toContain("2026-10-30");
  });

  it("tells the owner a timeline needs editing when its dates moved under it", () => {
    const changes = describeChanges(BASE, BASE, [
      {
        quoteNumber: "20415",
        builtStart: "2026-06-16",
        builtFinish: "2026-09-17",
        currentStart: "2026-06-16",
        currentFinish: "2026-10-30",
      },
    ]);
    expect(kinds(changes)).toEqual(["schedule-stale"]);
    expect(changes[0].needsAction).toBe(true);
    expect(changes[0].summary).toContain("20415");
    expect(changes[0].summary).toContain("needs editing");
  });

  it("does not say the same thing twice when the date move is already reported", () => {
    const changes = describeChanges(BASE, { ...BASE, finishDate: "2026-10-30" }, [
      {
        quoteNumber: "20415",
        builtStart: null,
        builtFinish: "2026-09-17",
        currentStart: null,
        currentFinish: "2026-10-30",
      },
    ]);
    const finish = changes.find((c) => c.kind === "finish-date");
    expect(finish?.needsAction).toBe(false);
    expect(changes.find((c) => c.kind === "schedule-stale")?.needsAction).toBe(true);
  });

  it("reports drift even for a unit with nothing to compare against", () => {
    const changes = describeChanges(null, BASE, [
      {
        quoteNumber: "20415",
        builtStart: "2026-01-01",
        builtFinish: null,
        currentStart: "2026-02-01",
        currentFinish: null,
      },
    ]);
    expect(kinds(changes)).toEqual(["schedule-stale", "new"]);
  });
});

describe("findScheduleDrift", () => {
  const quotation = (over: Partial<Parameters<typeof findScheduleDrift>[0][number]> = {}) => ({
    quoteNumber: "20415",
    plannedStartDate: "2026-06-16",
    maxContractualDate: "2026-09-17",
    schedule: { sourceStartDate: "2026-06-16", sourceFinishDate: "2026-09-17" },
    ...over,
  });

  it("finds nothing when the schedule still matches", () => {
    expect(findScheduleDrift([quotation()])).toEqual([]);
  });

  it("finds a moved finish date", () => {
    const drift = findScheduleDrift([quotation({ maxContractualDate: "2026-10-30" })]);
    expect(drift).toHaveLength(1);
    expect(drift[0].currentFinish).toBe("2026-10-30");
  });

  it("ignores a quotation with no schedule", () => {
    expect(findScheduleDrift([quotation({ schedule: null })])).toEqual([]);
  });

  it("says nothing about a schedule built before we recorded its dates", () => {
    // Every schedule that existed before migration 0013 has nulls here. Treating
    // unknown as stale would flag the entire programme at once.
    const drift = findScheduleDrift([
      quotation({ schedule: { sourceStartDate: null, sourceFinishDate: null } }),
    ]);
    expect(drift).toEqual([]);
  });

  it("does not report drift when the sheet has no date to compare to", () => {
    expect(findScheduleDrift([quotation({ maxContractualDate: null })])).toEqual([]);
  });
});
