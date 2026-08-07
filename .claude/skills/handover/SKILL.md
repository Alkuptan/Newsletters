---
name: handover
description: Audit the project against the graduation checklist and package it for the dev team — verifies schema replay, RLS coverage, permission tests, docs accuracy, and secrets inventory, then writes docs/HANDOFF-REPORT.md. Use when the tool outgrew the self-serve path, became business-critical, or is changing owners.
---

# /handover — graduate the project to the dev team

Because the project sits on the paved road, handoff is a personnel change,
not a rewrite. Your job: make the receiving developer's first day boring.

## Phase 1 — Audit (read-only)

Work through `docs/template/HANDOFF.md` item by item. For each: PASS / FAIL /
N/A with one line of evidence (command output summary or file reference).
Verify — don't assume:

- `pnpm verify`, `pnpm migration-lint`, `pnpm db:reset` (local replay),
  regenerate types and check for diff, `supabase db diff` vs linked project.
- Permission tests vs the SPEC role matrix: every role × capability cell has
  a covering test, including negatives. List uncovered cells.
- SPEC drift: compare `docs/SPEC.md` roles/things/screens against the actual
  nav, routes, and migrations. List mismatches.
- Secrets: `.env.example` completeness, `git log -p | grep`-style spot check
  that no secret values were ever committed, Worker secrets present
  (`pnpm exec wrangler secret list`).

## Phase 2 — Fix the cheap gaps

Fix anything mechanical (stale docs, missing test for an existing behavior,
unregenerated types) yourself now — with the normal verification loop.
Anything non-mechanical goes in the report as an open item, not a silent fix.

## Phase 3 — Write docs/HANDOFF-REPORT.md

Sections: What this tool is (3 sentences, business terms) · Checklist results
(PASS/FAIL table with evidence) · Open items · Architecture notes (only
deviations from the template — the rest is standard) · Inventory: repo, live
URL, Supabase project ref + region, Cloudflare account/worker name, secret
NAMES and where each lives · Seeded/dev users · Suggested first upgrades from
the RECIPES.md graduation menu · The walkthrough agenda (the tool's happy
path + its weirdest edge case).

## Phase 4 — Close the loop

1. Ensure a second admin exists in the app (create via the Users screen if
   the user names one).
2. Commit the report; update `CLAUDE.md` "Current focus" to "handed over /
   handing over" + `docs/PROGRESS.md`.
3. Give the user a short message to send the dev team: repo link + "the
   handoff report is in docs/HANDOFF-REPORT.md" + the walkthrough-call ask.
