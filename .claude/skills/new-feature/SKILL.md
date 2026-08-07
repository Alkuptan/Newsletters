---
name: new-feature
description: Add a capability to this tool after kickoff — a new thing to track, a new screen, or a changed rule. Runs a scoped mini-interview, updates the spec first, then builds a feature slice with tests. Use whenever the user asks for new functionality or a behavior change.
---

# /new-feature — grow the tool safely

Same vocabulary rules as /kickoff: things / people / journey / screens, one
question at a time, non-developer audience.

## Phase 1 — Mini-interview (scope: ONE capability)

1. "Describe what you want in one or two sentences."
2. Classify silently: new thing • new screen over existing data • changed
   rule (permission/stage/field) • cosmetic. Ask only the questions that
   classification needs (fields? who sees/does it? lifecycle changes? where
   in the nav?).
3. **Scope guard** (RULES.md): if it needs external users, payments, company
   system writes, a 5th role, pipelines/realtime — STOP, record it under
   "Graduation triggers" in `docs/PROJECT.md`, and tell the user this one is
   dev-team territory. Always offer the descoped alternative in the same
   breath (build the rest, park the capped part) — the cap kills the
   feature, not the request.

## Phase 2 — Spec first (mini spec gate)

Update `docs/SPEC.md` (the relevant section only — things/roles matrix/
screens/out-of-scope). Read the change back in plain English. **No code
until they confirm.** If the request contradicts the existing spec, surface
the conflict — don't silently pick a side.

## Phase 3 — Plan + build

1. `docs/plans/NNN-<slug>.md` — half a page: tables/policies, screens,
   tests, explicitly-not-now.
2. Follow the RECIPES.md recipe that matches (new slice / status lifecycle /
   new role / scoping / upload / CSV). The reference shapes are whatever
   slice /kickoff built (originally copied from example-items).
3. Migrations are additive-only; RLS in the same file as any new table;
   apply + regenerate types immediately (RULES.md rule 3).
4. Permissions change in three places or none (RULES.md rule 10).
5. Work on a branch if the repo has one configured with CI; otherwise
   commit in small, labeled steps.

## Phase 4 — Verify (MANDATORY)

The RULES.md verification loop: `pnpm verify` + `pnpm migration-lint` green,
exercise the flow in `pnpm dev`, negative-check as the non-privileged seeded
user when permissions/schema changed. Then update `CLAUDE.md` "Current
focus" + `docs/PROGRESS.md`, and report done in one business-terms sentence
plus "how I verified it". If it's deployed, offer `pnpm run deploy`.
