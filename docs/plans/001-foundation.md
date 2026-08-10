# Plan 001 — Foundation

Batch one of **Unit Newsletter Studio**. Spec: [`docs/SPEC.md`](../SPEC.md).

## Goal of this batch

The owner can upload the follow-up sheet, open a unit, see its newsletter
rendered on screen exactly like the supplied templates, and export it as JPG and
PDF. Gantt editing, photo picking and PowerPoint export are batch two and three.

## Sequencing note — local database is blocked

Docker Desktop is installed but its engine cannot start: this machine has no
WSL2. `wsl --install --no-distribution` has been run; it needs **one restart**
before the local Supabase stack (and therefore `db:reset`, `db:types:local`,
`pnpm dev` with real sign-in) can come up.

Everything below is ordered so the database-free work happens first. Steps 1–3
are pure TypeScript with Vitest coverage and need no Docker at all — and they are
the highest-risk parts of the tool, so proving them early is the right order
regardless.

## Step 1 — The calculation engine (`src/lib/newsletter/`) — no DB

Pure functions, no I/O. The single source of truth for every number on the
dashboard, imported by the renderer, the exporters and the tests alike.

- `aggregate.ts` — combine N ticked quotations into one newsletter's figures:
  quote references, summed invoice value, distinct scopes, dominant PM, earliest
  planned start, latest `Max Contractual`, duration in calendar days,
  money-weighted progress, elapsed days, and the AHEAD / ON TRACK / BEHIND
  verdict on the agreed 5-point band.
- `stage.ts` — `Project Status` → which of the five stage icons lights up.
- `area-of-concern.ts` — split `Notes` on commas into bullets.
- `display-name.ts` — suggest "Cyan 11" from zone `Cyan` + unit `CY-11`, and
  "Phase 4 Villa 2B" from `Ph4-Villa-2B`.

**Tests (must be green before step 2):** the three sample newsletters are
regression fixtures. The day count between `Planned Start Date` and
`Max Contractual` must equal the Duration printed on each sample — 150 for
CY-11, 180 for Ph4-Villa-2B, 60 for AH-56 — and the 5-point rule must reproduce
each Status pill (85% against 48% → AHEAD, 90% against 69% → AHEAD, 3% against
0% → ON TRACK). Plus the multi-quote case: AH-56 with quotes 20415 + 20423
ticked totals 1,424,488 LE, starts 16 Jun 2026, finishes 17 Sep 2026 (93 days),
and is 36% done by money weighting where a flat average would say 20%.

**Status: done.** 90 tests green.

## Step 2 — The sheet reader (`src/lib/follow-up-sheet/`) — no DB

- `parse.ts` — read the `After Delivery Extra works` tab from an uploaded
  `.xlsm`. Header row is **row 2**, data from row 3. Runs in the browser
  (SheetJS) so the 1.5 MB workbook never crosses the wire and the Worker never
  parses it; only clean JSON rows are posted to the server action.
- `schema.ts` — Zod row schema. Rows missing `Unit` or `Quote #` are rejected
  with a plain-English reason, never silently dropped.
- Zone normalisation: case-insensitive, so `Ancient Hill` and `Ancient hill`
  are one zone; near-duplicate pairs are reported for the owner to confirm.
- `Client Name` is read when present and left blank when absent (the owner is
  adding it to the Power Query).

**Tests:** parse the real `Sample/Follow-up sheet (Don't Delete).xlsm` and assert
645 accepted rows, 39 zones collapsing to the expected set, and that AH-56 comes
back with its three quotes.

## Step 3 — The newsletter renderer (`src/features/newsletters/components/`) — no DB

One React component, fixed 1600×900, that reproduces the supplied design from a
plain data object — so it renders identically on screen, in the JPG and in the
PDF.

- `newsletter-canvas.tsx` — the frame, grey unit header, El Gouna logo, orange
  accent, footer bar with label and date.
- `left-column.tsx` — PM / quote refs / summary block, quotation amount,
  start→finish calendar cards, status pill, duration, Area of Concern, the
  progress dial and the elapsed-time ring.
- `gantt.tsx` — month ruler and activity bars, with the orange "attention"
  variant.
- `stage-track.tsx` — the five icons, current one filled.
- `photo-grid.tsx` — 2 photos with a schedule; 2 / 2×2 / 2×3 without, adapting
  to how many are ticked.
- Layout switch: schedule present → Gantt layout; absent → stage track on top and
  the photo grid taking the right side.

Icons and the logo are extracted from the supplied `.pptx` files into
`public/newsletter/` rather than redrawn.

**Verification:** render all three samples from fixture data and compare against
`Sample/CY-11 Newsletter.jpg` and the two rendered PNGs side by side.

## Step 4 — Exports — no DB

- JPG and PDF from the rendered component, client-side, at 1600×900 and
  300 DPI-equivalent. No headless browser, so nothing heavy reaches the Worker
  bundle (RULES.md free-tier budget).
- PPTX is **batch three** — the editable-shapes rebuild the owner chose is the
  finickiest piece and must not hold up a working tool.

## Step 5 — Schema (after the restart)

One migration, `0005_newsletters.sql`, RLS in the same file:

| Table              | Purpose                                                                  |
| ------------------ | ------------------------------------------------------------------------ |
| `sheet_uploads`    | one row per upload, with accepted/rejected counts                        |
| `units`            | unit code, zone, display name, client, PM, OneDrive link, stage override |
| `quotations`       | imported figures per quote + `include_in_newsletter`                     |
| `gantt_schedules`  | one per quotation: row label                                             |
| `gantt_activities` | name, start, finish, colour, sort order                                  |
| `unit_photos`      | image, taken-at, ticked, sort order                                      |
| `editions`         | footer label, footer date, lifecycle status                              |
| `edition_units`    | the exported snapshot per unit per edition                               |

`0006_roles.sql` adds `project_manager` to `app_role`. `member` stays as the
default for new sign-ups and is presented in the UI as "Viewer (read-only)" —
so the tool has three effective roles without a fourth enum value. Recorded in
`docs/DECISIONS.md`.

Scoping in the RLS `USING` clauses straight from the spec's role matrix: admin
sees everything, `project_manager` sees rows whose unit's assigned PM maps to
them, `member` reads everything and writes nothing.

## Step 6 — Slices, routes, nav

`src/features/units/`, `src/features/sheet-import/`, `src/features/newsletters/`,
each with the canonical `schema` / `queries` / `actions` / `permissions` shape
copied from `src/features/example-items/`. Routes under `src/app/(app)/units/`,
`/import/`, `/editions/`; nav entries in `src/components/shell/nav-config.ts`;
`SHELL_CONFIG.toolName` → "Unit Newsletter Studio".

## Step 7 — Delete the example feature

Once `units` works: remove the `example-items` slice, its route folder, nav entry
and unit tests; keep migration `0004` (history is append-only). Replace the
example rows in `supabase/seed.sql` with a handful of real units drawn from the
sample sheet, keeping the dev users.

## Deferred to later batches

Batch two: Gantt editor, OneDrive photo pull and the tick-to-use picker, Area of
Concern editing, dashboard readiness filters.
Batch three: editable PPTX, batch export of a whole edition, editions history.
Later: Before Delivery newsletters.

## Definition of done for batch one

`pnpm verify` and `pnpm migration-lint` green; the three sample newsletters
reproduced from the real sample sheet; JPG and PDF exported and compared against
the supplied files; and — after the restart — sign-in tested as admin and as the
least-privileged seeded user, confirming the latter cannot upload a sheet.
