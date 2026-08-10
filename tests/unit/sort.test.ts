import { describe, it, expect } from "vitest";
import { nextSort, rankBy, sortFromParams, sortRows, type SortOption } from "@/lib/sort";

const OPTIONS: SortOption<"name" | "progress">[] = [
  { field: "name", label: "Unit" },
  { field: "progress", label: "Progress", descendingFirst: true },
];

describe("sortRows", () => {
  it("orders numbers both ways", () => {
    const rows = [{ n: 3 }, { n: 1 }, { n: 2 }];
    expect(sortRows(rows, (r) => r.n, "asc").map((r) => r.n)).toEqual([1, 2, 3]);
    expect(sortRows(rows, (r) => r.n, "desc").map((r) => r.n)).toEqual([3, 2, 1]);
  });

  it("reads numbers inside names as numbers", () => {
    // Plain text ordering would put "Ancient Hill 56" before "Ancient Hill 5".
    const rows = [{ n: "Ancient Hill 56" }, { n: "Ancient Hill 5" }, { n: "Ancient Hill 102" }];
    expect(sortRows(rows, (r) => r.n, "asc").map((r) => r.n)).toEqual([
      "Ancient Hill 5",
      "Ancient Hill 56",
      "Ancient Hill 102",
    ]);
  });

  it("puts blanks last whichever way the arrow points", () => {
    const rows = [{ pm: "Mariam" }, { pm: null }, { pm: "Ahmed" }, { pm: "" }];
    expect(sortRows(rows, (r) => r.pm, "asc").map((r) => r.pm)).toEqual([
      "Ahmed",
      "Mariam",
      null,
      "",
    ]);
    expect(sortRows(rows, (r) => r.pm, "desc").map((r) => r.pm)).toEqual([
      "Mariam",
      "Ahmed",
      null,
      "",
    ]);
  });

  it("treats zero as a value, not as a blank", () => {
    // "0 photos" is a real answer and belongs at the top when sorting ascending.
    const rows = [{ photos: 3 }, { photos: 0 }, { photos: 1 }];
    expect(sortRows(rows, (r) => r.photos, "asc").map((r) => r.photos)).toEqual([0, 1, 3]);
  });

  it("breaks ties the same way every time", () => {
    const rows = [
      { name: "Cyan 11", state: "ready" },
      { name: "Ancient Hill 5", state: "ready" },
      { name: "Bay 2", state: "ready" },
    ];
    const sorted = sortRows(
      rows,
      (r) => r.state,
      "asc",
      (r) => r.name,
    );
    expect(sorted.map((r) => r.name)).toEqual(["Ancient Hill 5", "Bay 2", "Cyan 11"]);
  });

  it("breaks ties among blanks too", () => {
    const rows = [{ pm: null, name: "B" }, { pm: null, name: "A" }];
    const sorted = sortRows(
      rows,
      (r) => r.pm,
      "asc",
      (r) => r.name,
    );
    expect(sorted.map((r) => r.name)).toEqual(["A", "B"]);
  });

  it("does not disturb the list it was given", () => {
    const rows = [{ n: 2 }, { n: 1 }];
    sortRows(rows, (r) => r.n, "asc");
    expect(rows.map((r) => r.n)).toEqual([2, 1]);
  });

  it("orders true above false when sorting descending", () => {
    const rows = [{ sent: false }, { sent: true }];
    expect(sortRows(rows, (r) => r.sent, "desc").map((r) => r.sent)).toEqual([true, false]);
  });
});

describe("nextSort", () => {
  it("flips the column already in use", () => {
    expect(nextSort({ field: "name", direction: "asc" }, "name", OPTIONS)).toEqual({
      field: "name",
      direction: "asc" === "asc" ? "desc" : "asc",
    });
  });

  it("starts a new column on its own natural direction", () => {
    // Progress is most useful biggest-first; a name is not.
    expect(nextSort({ field: "name", direction: "asc" }, "progress", OPTIONS)).toEqual({
      field: "progress",
      direction: "desc",
    });
    expect(nextSort({ field: "progress", direction: "desc" }, "name", OPTIONS)).toEqual({
      field: "name",
      direction: "asc",
    });
  });
});

describe("sortFromParams", () => {
  const fallback = { field: "name" as const, direction: "asc" as const };

  it("takes a known field out of the address", () => {
    expect(sortFromParams({ sort: "progress", dir: "desc" }, OPTIONS, fallback)).toEqual({
      field: "progress",
      direction: "desc",
    });
  });

  it("ignores a field this screen does not have", () => {
    // The value comes from a URL anyone can type, so it is checked, not trusted.
    expect(sortFromParams({ sort: "salary", dir: "desc" }, OPTIONS, fallback)).toEqual(fallback);
  });

  it("falls back when nothing is asked for", () => {
    expect(sortFromParams({}, OPTIONS, fallback)).toEqual(fallback);
  });

  it("treats anything but 'desc' as ascending", () => {
    expect(sortFromParams({ sort: "name", dir: "sideways" }, OPTIONS, fallback).direction).toBe(
      "asc",
    );
  });
});

describe("rankBy", () => {
  it("orders by severity rather than by spelling", () => {
    const rank = rankBy(["BEHIND", "ON TRACK", "AHEAD", "COMPLETED"] as const);
    const rows = [{ v: "AHEAD" }, { v: "BEHIND" }, { v: "COMPLETED" }, { v: "ON TRACK" }] as const;
    expect(sortRows(rows, (r) => rank(r.v), "asc").map((r) => r.v)).toEqual([
      "BEHIND",
      "ON TRACK",
      "AHEAD",
      "COMPLETED",
    ]);
  });

  it("puts an unranked or missing value at the end", () => {
    const rank = rankBy(["BEHIND", "AHEAD"] as const);
    expect(rank(null)).toBe(2);
  });
});
