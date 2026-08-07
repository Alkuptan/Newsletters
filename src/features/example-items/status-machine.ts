// ★ TEACHING FILE: the status lifecycle in one place. RLS answers WHO may
// write a row; this file answers WHAT transitions are legal. Both are
// enforced in the server action (actions.ts) — never in the client alone.
import { ValidationError } from "@/lib/errors";
import { ITEM_STATUSES, type ItemStatus } from "./schema";

/** Human copy for each status — the ONLY place status labels are written. */
export const STATUS_LABELS: Record<ItemStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  done: "Done",
};

/** Display order for filters, board columns, and reports. */
export const STATUS_ORDER: readonly ItemStatus[] = ITEM_STATUSES;

/**
 * The whole lifecycle as data. Record<ItemStatus, ...> means adding a status
 * without deciding its transitions is a compile error, and the UI can render
 * exactly one button per legal move (see transition-buttons.tsx).
 */
export const TRANSITIONS: Record<ItemStatus, ItemStatus[]> = {
  open: ["in_progress", "done"],
  in_progress: ["done", "open"],
  done: ["open"], // reopening is allowed
};

export function canTransition(from: ItemStatus, to: ItemStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/**
 * Throws a ValidationError whose message is derived from STATUS_LABELS, e.g.
 * "An item that is Done can only move to Open." — fromError() forwards it to
 * the client verbatim as Result.error, so keep the copy end-user friendly.
 */
export function assertTransition(from: ItemStatus, to: ItemStatus): void {
  if (canTransition(from, to)) return;
  const allowed = TRANSITIONS[from].map((status) => STATUS_LABELS[status]).join(" or ");
  throw new ValidationError(
    { from, to },
    `An item that is ${STATUS_LABELS[from]} can only move to ${allowed}.`,
  );
}
