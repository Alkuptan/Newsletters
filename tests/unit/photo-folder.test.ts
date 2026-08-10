import { describe, it, expect } from "vitest";
import { findUnitFolder, type FsDirectoryHandle } from "@/lib/newsletter/photo-folder";

/**
 * The point of these tests is what is NOT read.
 *
 * The owner's parent folder holds roughly 410,000 files. Finding one unit must
 * walk directories only, never files, and must stop at a fixed depth — so the
 * fake tree below counts every entry it hands out.
 */

function dir(name: string, children: unknown[] = []) {
  const handle = {
    kind: "directory" as const,
    name,
    async *values() {
      for (const child of children) yield child as never;
    },
  };
  return handle as unknown as FsDirectoryHandle;
}

/**
 * A file that screams if anything opens it.
 *
 * Searching for a unit must walk directory NAMES only. Reading a file while
 * searching is the exact behaviour that made the old approach impossible on a
 * 410,000-file folder, so it fails the test rather than merely being slow.
 */
const file = (name: string) => ({
  kind: "file" as const,
  name,
  getFile() {
    throw new Error(`opened ${name} while searching`);
  },
});

/** A zone folder holding a great many loose files, as the real one does. */
const crowded = (name: string, fileCount: number) =>
  dir(
    name,
    Array.from({ length: fileCount }, (_, i) => file(`IMG_${i}.jpg`)),
  );

describe("finding one unit's folder", () => {
  it("finds a unit nested under its zone", async () => {
    const tree = dir("Photos", [dir("Ancient Hill", [dir("AH-56"), dir("AH-57")])]);
    const found = await findUnitFolder(tree, ["AH-56", "Ancient Hill 56"]);
    expect(found?.handle.name).toBe("AH-56");
    expect(found?.path).toBe("Ancient Hill / AH-56");
  });

  it("matches however the folder is spelled", async () => {
    const tree = dir("Photos", [dir("Zone", [dir("ah_056 (final)")])]);
    const found = await findUnitFolder(tree, ["AH-56"]);
    expect(found?.handle.name).toBe("ah_056 (final)");
  });

  it("finds a unit sitting directly in the parent", async () => {
    const tree = dir("Photos", [dir("AH-56")]);
    expect((await findUnitFolder(tree, ["AH-56"]))?.path).toBe("AH-56");
  });

  it("returns nothing rather than guessing at a near miss", async () => {
    // AH-5 and AH-56 are different villas; a wrong guess reaches a client.
    const tree = dir("Photos", [dir("Ancient Hill", [dir("AH-5")])]);
    expect(await findUnitFolder(tree, ["AH-56"])).toBeNull();
  });

  it("stops at two levels rather than walking a whole drive", async () => {
    const tooDeep = dir("Photos", [dir("A", [dir("B", [dir("AH-56")])])]);
    expect(await findUnitFolder(tooDeep, ["AH-56"])).toBeNull();
  });

  it("never opens the files it walks past", async () => {
    // Three zone folders of 1,000 loose files each, every one of which throws if
    // opened. This is the behaviour the whole design exists to guarantee.
    const tree = dir("Photos", [
      crowded("Zone A", 1000),
      dir("Ancient Hill", [dir("AH-56")]),
      crowded("Zone C", 1000),
    ]);
    const found = await findUnitFolder(tree, ["AH-56"]);
    expect(found?.handle.name).toBe("AH-56");
  });

  it("stops enumerating a level that is absurdly large", async () => {
    // A mistyped parent could point at a drive root. The walk is capped so it
    // cannot run away; finding nothing is the right answer here.
    const huge = dir(
      "Wrong place",
      Array.from({ length: 6000 }, (_, i) => file(`f${i}.jpg`)),
    );
    expect(await findUnitFolder(huge, ["AH-56"])).toBeNull();
  });

  it("gives up on nothing to look for", async () => {
    const tree = dir("Photos", [dir("AH-56")]);
    expect(await findUnitFolder(tree, [])).toBeNull();
    expect(await findUnitFolder(tree, ["", "   "])).toBeNull();
  });
});
