import { describe, it, expect } from "vitest";

/**
 * What the work screen chases the owner about.
 *
 * The rule the owner asked for: a unit at 0% is never prompted to send and never
 * counted as outstanding. It applies equally to work that is finished and to a
 * unit with nothing ticked — in all three cases there is nothing to send.
 *
 * This mirrors the derivation in src/features/units/list.ts. It is a unit test
 * rather than an end-to-end one because no seeded unit sits at exactly 0%, and
 * a rule about a boundary should be tested at the boundary.
 */

type State = "needs-quotes" | "complete" | "not-started" | "needs-photos" | "ready";

function stateOf(input: {
  tickedQuotations: number;
  isComplete: boolean;
  progressPercent: number;
  chosenPhotos: number;
}): State {
  if (input.tickedQuotations === 0) return "needs-quotes";
  if (input.isComplete) return "complete";
  if (input.progressPercent === 0) return "not-started";
  if (input.chosenPhotos === 0) return "needs-photos";
  return "ready";
}

const needsNewsletter = (state: State) => state === "ready" || state === "needs-photos";

describe("what the owner is chased about", () => {
  it("chases a unit that is ready to send", () => {
    const state = stateOf({
      tickedQuotations: 2,
      isComplete: false,
      progressPercent: 40,
      chosenPhotos: 3,
    });
    expect(state).toBe("ready");
    expect(needsNewsletter(state)).toBe(true);
  });

  it("chases a unit that only lacks photos", () => {
    const state = stateOf({
      tickedQuotations: 2,
      isComplete: false,
      progressPercent: 40,
      chosenPhotos: 0,
    });
    expect(state).toBe("needs-photos");
    expect(needsNewsletter(state)).toBe(true);
  });

  it("NEVER chases a unit at 0%", () => {
    const state = stateOf({
      tickedQuotations: 2,
      isComplete: false,
      progressPercent: 0,
      chosenPhotos: 3,
    });
    expect(state).toBe("not-started");
    expect(needsNewsletter(state)).toBe(false);
  });

  it("does not chase at 0% even when everything else is in place", () => {
    // Photos chosen, quotations ticked — still nothing to report.
    const state = stateOf({
      tickedQuotations: 5,
      isComplete: false,
      progressPercent: 0,
      chosenPhotos: 6,
    });
    expect(needsNewsletter(state)).toBe(false);
  });

  it("starts chasing as soon as there is a single point of progress", () => {
    const state = stateOf({
      tickedQuotations: 2,
      isComplete: false,
      progressPercent: 1,
      chosenPhotos: 0,
    });
    expect(state).toBe("needs-photos");
    expect(needsNewsletter(state)).toBe(true);
  });

  it("does not chase finished work", () => {
    const state = stateOf({
      tickedQuotations: 2,
      isComplete: true,
      progressPercent: 100,
      chosenPhotos: 3,
    });
    expect(state).toBe("complete");
    expect(needsNewsletter(state)).toBe(false);
  });

  it("does not chase a unit with nothing ticked", () => {
    // Nothing ticked means nothing to put on a page, so a send cannot be owed.
    const state = stateOf({
      tickedQuotations: 0,
      isComplete: false,
      progressPercent: 0,
      chosenPhotos: 0,
    });
    expect(state).toBe("needs-quotes");
    expect(needsNewsletter(state)).toBe(false);
  });

  it("treats finished as finished even at less than 100%", () => {
    // Cancelled and void quotations make a unit complete without reaching 100%.
    const state = stateOf({
      tickedQuotations: 3,
      isComplete: true,
      progressPercent: 62,
      chosenPhotos: 0,
    });
    expect(state).toBe("complete");
    expect(needsNewsletter(state)).toBe(false);
  });
});
