---
name: kickoff
description: THE entry point for a new tool. Interviews the user about their business idea in plain language FIRST (no prerequisites — it's just conversation), writes the spec, then bootstraps the local environment and builds the first working version. Use on a fresh project, or whenever the user starts describing what they want the tool to do.
---

# /kickoff — from idea to first working version

You are interviewing a NON-DEVELOPER domain expert. Vocabulary rules for the
whole session: say **things** (not entities/tables), **people** (not
roles/permissions), **journey/stages** (not state machine/status enum),
**screens** (not routes/views). One question at a time. After every phase,
play back what you understood in their words.

**The interview comes FIRST and needs nothing installed.** The machine works
while the human talks: kick off the environment bootstrap in the background
(Phase B below) as soon as the interview starts, and never make the user wait
on tooling to answer a question about their own business.

## Phase B — Background bootstrap (start it silently, in parallel with Phase 1)

Before asking the first interview question, check quickly and start whatever
is missing AS BACKGROUND WORK (never narrate beyond one short sentence like
"I'm preparing your workspace in the background while we talk"):

1. `pnpm install` if `node_modules/` is absent.
2. Docker: `docker info` — if missing/not running, `brew install --cask docker`
   (if needed) then `open -a Docker`.
3. Rename the Supabase project BEFORE the first start (mechanical, no user
   input needed): set `project_id` in `supabase/config.toml` to this folder's
   name. Starting the stack under the template's name collides with any other
   template-derived project on the same machine (same container/volume names —
   a later `db:reset` can wipe the OTHER project's local data) and orphans the
   running stack when it gets renamed later.
4. Once Docker is up: `pnpm exec supabase start` (first run pulls images —
   minutes; that's why it runs during the interview).
5. Node ≥ 20 / pnpm / git — if missing and Homebrew exists, install; if
   Homebrew itself is missing, note it and continue the interview — only the
   BUILD is blocked, and the spec is valuable regardless. Tell the user at the
   spec gate, with one sentence to send IT.

Check on this work between interview phases, not mid-question.

## Phase 1 — Interview (no files touched)

**Written-brief fast-path.** If the user arrives with a document (a spec, a
brief from their boss, a pasted requirements email), read it FIRST and map it
onto the phases below. Then ask ONLY the questions the document leaves open —
never re-ask what it already answers — and play the mapped understanding back
at the spec gate as usual. The hard caps below still apply to the document's
content.

Work through these in order; keep it conversational, not a form:

1. **One-liner.** "In one sentence: what does this tool do, and for whom?"
2. **Today.** "How does this work today — a spreadsheet, WhatsApp group,
   email, paper?" If a spreadsheet exists: **"Can you paste its column
   headers?"** (highest-value question — columns ≈ fields, tabs ≈ things,
   the sheet owner ≈ admin). Then: "What's painful about the current way?"
   (the pains become v1 success criteria).
3. **Things.** "What things does it keep track of?" For each: "What do you
   write down about a ___?" Classify each field by offering plain choices:
   short text / long text / number / money / date / yes-no / choice from a
   fixed list / photo or file / link to another thing. Ask which are
   must-fill, and for lists: "Who can change the list of options later?"
   (fixed → enum; admin-editable → lookup table + admin screen).
4. **People.** "Who will use this? Job titles, not names." Per role: "What
   should they see — everything, or only their own department/area/items?"
   and "What can they do — create, edit, approve, delete, only view?"
   Always: "Who manages users and settings?" (forces an admin).
5. **Journey.** "Pick one ___ and walk me through its life from creation
   until nobody touches it again. What are the stages?" Per transition: who
   moves it, can it go backwards, what must be attached first.
6. **Screens.** Per role: "When they open this at 8am, what must they see
   first?" And: "Phone in the field, laptop at a desk, or both?"
7. **Numbers.** "What would your boss ask this tool at the end of the
   month?" (→ a reports page, later batch). "Should anyone get an email when
   something happens?" — RECOMMEND "not in version 1" (notifications are the
   single biggest complexity trap; in-app lists first).
8. **Scope cut.** Play back: "Version 1 will do X, Y, Z. It will NOT do:
   emails, external users, mobile app, integration with ___. Agreed?"

**Hard caps — if exceeded, STOP and recommend the dev team** (offer to write
the summary for them): more than 7 things, more than 4 roles beyond admin,
more than 10 screens, external/public users, payments, writes to company
systems (CRM/ERP/Portals), guest or HR-sensitive data.
**Always offer the descoped alternative** in the same breath: park the capped
part as a graduation trigger in `docs/PROJECT.md` and build everything else —
the cap kills the feature, not the tool. Only when the capped part IS the
tool does the whole project go to the dev team.

## Phase 2 — Spec gate (MANDATORY STOP)

Fill `docs/SPEC.md`: Purpose / Users & roles (matrix table: one row per role,
columns = capabilities) / Things (fields in business terms + lifecycle
diagram in a fenced block) / Screens (v1) / **Explicitly OUT of scope**
(verbatim from the scope cut) / Open questions.

Read it back **section by section, in prose** ("A permit belongs to one beach
zone; only supervisors can approve — right?"). Iterate until they say yes.
**Write no code before the user approves the spec.** Commit the spec alone.

The spec also decides which optional recipes activate in Phase 4: photo/file
fields → the storage recipe; "boss questions" → a reports page (usually batch
two); "only their own …" answers → scoping columns + policies.

## Phase 3 — Finish the local environment

By now the background bootstrap is usually done. Complete it:

1. Rename the project off the template name (only if still
   `internal-tool-template`): `wrangler.jsonc` (worker `name` AND
   WORKER_SELF_REFERENCE `service` — must match), `package.json` (`name`),
   and the `<TOOL_NAME>`/purpose placeholders in `CLAUDE.md`
   (`supabase/config.toml` was already renamed in Phase B, before the stack
   started). Derive from the repo/folder name (kebab-case); confirm with the
   user in one question.
2. Write `.env.local` from `.env.example` with the LOCAL values from
   `pnpm exec supabase status -o env` (`API_URL` → `NEXT_PUBLIC_SUPABASE_URL`,
   `PUBLISHABLE_KEY`, `SECRET_KEY`). Never print them.
3. `pnpm db:reset` (migrations + fake dev users: `admin@dev.local` /
   `member@dev.local`, password `devpassword123`), `pnpm db:types:local`,
   then `pnpm verify` — must be green before you build on top.

## Phase 4 — Plan, then build the foundation

1. Write `docs/plans/001-foundation.md`: the tables + policies, the 2–3
   screens of batch one (always: the role's "8am screen" + create flow),
   the tests that prove the role matrix, what's deferred to batch two.
2. Schema: new migrations via `pnpm db:new` — copy the pattern of
   `0004_example_items.sql` (enum + table + trigger + **RLS in the same
   file**). Scoping from the role matrix goes into USING clauses. Apply +
   regenerate types (`pnpm db:reset` + `pnpm db:types:local`).
3. Slices: copy `src/features/example-items/` per thing; adjust schema/
   queries/actions/permissions/status-machine/components. Keep the canonical
   action envelope EXACTLY (RULES.md rule 4).
4. Routes + nav: pages under `src/app/(app)/…`, entries in
   `src/components/shell/nav-config.ts`. Update `SHELL_CONFIG.toolName`.
5. Tests: retarget the example unit tests; write permission tests straight
   from the SPEC role matrix — one positive AND one negative case per cell
   that matters.
6. **Delete the example feature once its replacement exists**: the slice
   folder, its route folder, its nav entry, its unit tests. Leave migration
   `0004` (history is append-only); just remove UI/nav/code references.
   Replace the example sample rows in `supabase/seed.sql` with sample rows
   for the real things (keep the dev users).
7. Update `supabase/seed.sql` + `scripts/seed-dev.ts` roles if the role set
   changed (keep one seeded user per role for the verification loop).

## Phase 5 — Verify & demo (MANDATORY)

1. `pnpm verify` + `pnpm migration-lint` green.
2. Full verification loop from RULES.md — including logging in as each
   seeded role and confirming both what they CAN and CANNOT do.
3. Update `CLAUDE.md` (tool name + purpose paragraph + "Current focus"),
   append to `docs/PROGRESS.md`, and REWRITE `README.md` for the tool itself
   (what it is, local run steps, the seeded logins per role, project
   structure, deliberately-deferred list) — the template's README describes
   the template, not your tool, and a fresh clone must work from README alone.
4. Finish with a demo script for the user: "Open /…, log in as …, create a
   …, then log in as … and confirm you can't approve it." Then offer:
   "Want it on the internet? Say the word and I'll run `/go-live`."
