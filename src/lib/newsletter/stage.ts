/**
 * Which of the five stage icons lights up on the track.
 *
 * Worked out from the sheet's `Project Status` so the owner types nothing, but
 * overridable per unit and remembered — some units sit at a stage the status
 * column cannot express.
 */

import type { Stage } from "./types";

/**
 * `Project Status` → stage.
 *
 * Verified against the supplied samples: Ancient Hill 56 is "Hold" and its
 * newsletter lights Construction, so Hold means work has started and stalled,
 * not that it never began.
 */
const STATUS_TO_STAGE: Record<string, Stage> = {
  "not started": "quotation",
  grace: "quotation",
  "in progress": "construction",
  hold: "construction",
  "on track": "construction",
  completed: "handover",
  cancelled: "quotation",
  void: "quotation",
};

/**
 * The stage suggested by a quotation's `Project Status`.
 *
 * Returns "construction" for anything unrecognised: an unknown status means
 * work of some kind is under way, and Construction is the stage that reads
 * correctly for the widest range of real cases.
 */
export function stageFromProjectStatus(projectStatus: string | null | undefined): Stage {
  const key = projectStatus?.trim().toLocaleLowerCase();
  if (!key) return "construction";
  return STATUS_TO_STAGE[key] ?? "construction";
}

/**
 * The stage for a unit covering several quotations.
 *
 * The furthest-along stage wins: once any part of a unit has reached handover
 * the client sees a unit that is being handed over, and a unit with any work in
 * progress is in construction even if another quotation is still at quotation
 * stage.
 */
export function stageForUnit(
  projectStatuses: readonly (string | null | undefined)[],
  override?: Stage | null,
): Stage {
  if (override) return override;
  if (projectStatuses.length === 0) return "construction";

  // Ordered least- to furthest-along, matching the track left to right.
  const order: Stage[] = ["initiation", "design", "quotation", "construction", "handover"];
  return projectStatuses
    .map(stageFromProjectStatus)
    .reduce((furthest, stage) =>
      order.indexOf(stage) > order.indexOf(furthest) ? stage : furthest,
    );
}
