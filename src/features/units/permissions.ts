/**
 * Who may do what — the TypeScript half of the rules.
 *
 * Every function here mirrors a policy in migration `0006_newsletters.sql` and a
 * row of the matrix in `docs/SPEC.md`. Permissions change in three places or
 * none (docs/template/RULES.md rule 10): the SQL policy, these helpers, and the
 * spec — plus the tests in `tests/unit/units-permissions.test.ts`.
 *
 * The same helper is used by the page (to decide which controls to render) and
 * by the server action (before it writes), so the button a person can see and
 * the action they may call can never disagree. RLS is the backstop underneath.
 *
 * Pure and structurally typed on purpose: no Supabase, no mocks, trivially
 * testable.
 */

import type { Profile } from "@/lib/supabase/dal";
import type { Tables } from "@/lib/supabase/database.types";

type Actor = Pick<Profile, "id" | "role" | "is_active">;

/** Just enough of a unit to judge who owns it. */
type UnitScope = Pick<Tables<"units">, "assigned_pm">;

/**
 * The PM name(s) a person answers to, as spelled in the follow-up sheet.
 *
 * The sheet identifies project managers by typed name ("Mariam Sobhy"), not by
 * login, so the tool keeps a mapping — and one person may appear under more than
 * one spelling. Mirrors the `pm_aliases` table.
 */
export type PmAliases = readonly string[];

/**
 * Case- and whitespace-insensitive name comparison.
 *
 * Internal runs of whitespace are collapsed, not just trimmed: "Mariam  Sobhy"
 * has to match "Mariam Sobhy". Assigned PM is typed by hand into a spreadsheet,
 * and the failure mode of being strict is the worst kind — a project manager
 * silently loses sight of their own units with no error to notice. Mirrors
 * migration 0007.
 */
function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  const normalise = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
  if (!a || !b) return false;
  const left = normalise(a);
  const right = normalise(b);
  // A blank alias must never match a blank Assigned PM, which would hand every
  // unassigned unit to whoever had an empty alias row.
  if (left === "" || right === "") return false;
  return left === right;
}

/**
 * Is this unit assigned to the signed-in project manager?
 *
 * Mirrors the SQL helper `public.is_my_unit`.
 */
export function isMyUnit(unit: UnitScope, aliases: PmAliases): boolean {
  return aliases.some((alias) => sameName(alias, unit.assigned_pm));
}

/**
 * Who may SEE a unit: admins and viewers see every unit; a project manager sees
 * only their own. Mirrors `public.can_read_unit`.
 */
export function canReadUnit(user: Actor, unit: UnitScope, aliases: PmAliases): boolean {
  if (!user.is_active) return false;
  if (user.role === "admin") return true;
  // 'member' is the read-only role, shown in the UI as "Viewer" (DECISIONS 0004).
  if (user.role === "member") return true;
  if (user.role === "project_manager") return isMyUnit(unit, aliases);
  return false;
}

/**
 * Who may CHANGE a unit — its display name, client, stage, Area of Concern,
 * photos, Gantt schedule, and which quotations count.
 *
 * Deliberately excludes 'member': a viewer can look and export, nothing more.
 * Mirrors `public.can_write_unit`.
 */
export function canWriteUnit(user: Actor, unit: UnitScope, aliases: PmAliases): boolean {
  if (!user.is_active) return false;
  if (user.role === "admin") return true;
  if (user.role === "project_manager") return isMyUnit(unit, aliases);
  return false;
}

/**
 * Who may upload the follow-up sheet.
 *
 * Admin only — an upload rewrites the imported figures for every unit in the
 * programme, not just one person's. Mirrors `sheet_uploads_admin_insert` and
 * `units_admin_insert`.
 */
export function canUploadSheet(user: Pick<Profile, "role" | "is_active">): boolean {
  return user.is_active && user.role === "admin";
}

/**
 * Who may open a new dated cycle. Admin only — an edition is programme-wide.
 * Mirrors `editions_admin_insert`.
 */
export function canCreateEdition(user: Pick<Profile, "role" | "is_active">): boolean {
  return user.is_active && user.role === "admin";
}

/**
 * Who may export a unit's newsletter as JPG, PDF or PowerPoint.
 *
 * Anyone who can see it — exporting reads, it does not write, and the board and
 * upper management are meant to be able to take a copy.
 */
export function canExportUnit(user: Actor, unit: UnitScope, aliases: PmAliases): boolean {
  return canReadUnit(user, unit, aliases);
}
