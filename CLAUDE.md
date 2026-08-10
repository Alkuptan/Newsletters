# CLAUDE.md

**Tool:** Unit Newsletter Studio — produces a one-page progress newsletter for
each unit in El Gouna's Extra Works programme and exports it as JPG, PDF and an
editable PowerPoint slide. The owner refreshes the Power Query in
*Follow-up sheet (Don't Delete).xlsm*, uploads it, and every unit's newsletter is
already filled in: several quotations combined into one page, money-weighted
progress, an ahead/on-track/behind verdict, a Gantt schedule held in the tool,
and site photos chosen from the unit's OneDrive folder. Version 1 covers **After
Delivery** extra works; Before Delivery is designed for but not built.

This project was scaffolded from `internal-tool-template` (see
`TEMPLATE_VERSION`). It is an Orascom internal tool, driven day-to-day by a
non-developer through Claude Code, on the org-standard stack.

@AGENTS.md
@docs/template/RULES.md
@docs/PROJECT.md

## Live

**https://newsletter-system.pmoteam.workers.dev** — Cloudflare Workers, with the
cloud Supabase project `newsletter-system` (Frankfurt) behind it. Sign-in is
invite-only; public signup is off.

**Deploys must be built on Linux.** Use the `deploy` workflow on GitHub
(Actions → deploy → Run workflow). A Windows-built bundle deploys fine and then
fails at runtime — see `docs/PROJECT.md`.

## Current focus

Spec approved (`docs/SPEC.md`). Batches one to three are built and verified —
see `docs/plans/` and `docs/PROGRESS.md`.

**Working end to end against the local stack**, with the real 645-row sheet
imported (317 units):

- upload → import → per-unit page → Gantt editor → photo picker, plus **bulk
  photo import** from one parent folder matched to units by code,
- the Quick screen (`/quick`): patches, a per-cycle "sent" tick, and one click
  through to a pre-filtered batch export,
- three exports — JPG, PDF and an editable PowerPoint — plus a whole cycle as
  one deck, one PDF, or **a separate PDF and image per unit in a zip**,
- the Design screen: three master templates plus per-unit overrides,
- cycles that freeze what was sent, and re-render a past cycle from snapshots,
- **What changed** against the last cycle, including a timeline the sheet has
  moved the dates under.

Photos are shrunk to 2000px on upload (11.7 MB → 1.3 MB measured), and the batch
export mounts eight newsletters at a time rather than all of them.

`pnpm verify` green (203 unit tests), `pnpm e2e` green (16), `pnpm migration-lint`
clean on 13 migrations.

**Note for e2e:** the suite assumes the seeded three units, and its last test
replaces them with the whole sheet. Run `pnpm db:reset` before `pnpm e2e`.

**Not done:** Before Delivery is designed for but not built.

**Waiting on the owner:** a `Client Name` column added to the Power Query, and
OneDrive unit folders shared "anyone with the link". Reading the SharePoint
folder directly needs IT — a real link returned 403, and creating an Azure app
registration returned 401 (a graduation trigger, see `docs/PROJECT.md`).

## The five commands

| Skill          | When                                                                      |
| -------------- | ------------------------------------------------------------------------- |
| `/kickoff`     | START HERE — describe your idea; interview → spec → first working version |
| `/go-live`     | put it on the internet (sign-ins, cloud project, deploy) — and re-deploys |
| `/new-feature` | add a capability after kickoff                                            |
| `/fix-it`      | anything is broken, or a fresh machine where nothing runs yet             |
| `/handover`    | audit + package the project for the dev team                              |
