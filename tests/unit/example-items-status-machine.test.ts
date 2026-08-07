// Teaches: test the FULL transition matrix, not a happy-path sample. The
// expected pairs are written out BY HAND — if someone edits TRANSITIONS they
// must consciously update this list too, which is the point.
import { describe, expect, it } from "vitest";
import { ValidationError } from "@/lib/errors";
import type { ItemStatus } from "@/features/example-items/schema";
import {
  STATUS_LABELS,
  STATUS_ORDER,
  TRANSITIONS,
  assertTransition,
  canTransition,
} from "@/features/example-items/status-machine";

const ALL: readonly ItemStatus[] = ["open", "in_progress", "done"];

const LEGAL: ReadonlyArray<readonly [ItemStatus, ItemStatus]> = [
  ["open", "in_progress"],
  ["open", "done"],
  ["in_progress", "done"],
  ["in_progress", "open"],
  ["done", "open"], // reopening is allowed
];

describe("status machine", () => {
  it("declares every status, in display order, with a label", () => {
    expect(STATUS_ORDER).toEqual(ALL);
    for (const status of ALL) {
      expect(STATUS_LABELS[status]).toBeTruthy();
      expect(TRANSITIONS[status]).toBeDefined();
    }
  });

  // The full 3x3 matrix — including self-transitions, which are all illegal.
  for (const from of ALL) {
    for (const to of ALL) {
      const legal = LEGAL.some(([f, t]) => f === from && t === to);
      it(`${from} -> ${to} is ${legal ? "legal" : "illegal"}`, () => {
        expect(canTransition(from, to)).toBe(legal);
        if (legal) {
          expect(() => assertTransition(from, to)).not.toThrow();
        } else {
          expect(() => assertTransition(from, to)).toThrowError(ValidationError);
        }
      });
    }
  }

  it("explains an illegal move with friendly, label-based copy", () => {
    try {
      assertTransition("done", "in_progress");
      expect.unreachable("assertTransition should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      const validationError = err as ValidationError;
      expect(validationError.code).toBe("validation");
      // Derived from STATUS_LABELS — this is what the end user's toast shows.
      expect(validationError.message).toBe("An item that is Done can only move to Open.");
      expect(validationError.details).toEqual({ from: "done", to: "in_progress" });
    }
  });

  it("only ever transitions to known statuses", () => {
    for (const targets of Object.values(TRANSITIONS)) {
      for (const target of targets) {
        expect(ALL).toContain(target);
      }
    }
  });
});
