# PROGRESS.md — session log

> Append one short entry per working session: date, what changed (business
> terms), what's next. This is how a new session (or a new person) catches up.

## 2026-08-07 — scaffolded

Project created from internal-tool-template.

## 2026-08-07 — kickoff: spec agreed, newsletter engine and design built

**Agreed what the tool is.** Unit Newsletter Studio: upload the refreshed
follow-up sheet, get a one-page newsletter per unit, export it as JPG, PDF and
an editable PowerPoint slide. After Delivery only in version 1. Spec written and
approved section by section — see `docs/SPEC.md`.

**Decisions the owner made:** photos come from a pasted OneDrive folder link and
the owner ticks which ones to use; the PowerPoint export is to be a real editable
slide; the Gantt chart lives in the tool (built once per quotation, saved,
recalled and editable); quotations are ticked in the tool and remembered; the
finish date is the sheet's `Max Contractual` and the duration is the day count
from `Planned Start Date` to it; a unit is On Track within 5 points of its
expected progress; the footer label and date are chosen per edition.

**Built and verified (no database needed for any of it):**

- The calculation engine — combining several quotations into one unit's
  newsletter, money-weighted progress, elapsed time, and the ahead / on track /
  behind verdict.
- The follow-up sheet reader, working against the real 645-row `.xlsm`,
  including its row-2 header and the trailing space in "Progress % Current ".
- The newsletter itself: both layouts (Gantt with two photos, and the
  no-schedule photo grid), using the icons and logo lifted out of the supplied
  templates.

**How it was verified.** `pnpm verify` green — 90 unit tests. The engine
reproduces all three supplied sample newsletters: the day count between the two
chosen date columns gives exactly the Duration printed on each one (150, 180 and
60), and the 5-point rule reproduces each Status pill. All three newsletters were
rendered in a browser and compared against `Sample/CY-11 Newsletter.jpg` and the
two `.pptx` templates.

**One bug worth recording.** Sheet dates were coming out a day early — Excel
hands them over as local midnight and Egypt runs ahead of UTC, so the usual
date-to-text conversion rolled 29 April back to 28 April. Caught by a test;
every date now goes through a calendar-date helper. See DECISIONS 0003.

**All three exports work.** JPG (3200 × 1800), a one-page PDF at exactly the
slide's 13.333 × 7.5 inches, and an **editable** PowerPoint slide — 100 real
shapes for Cyan 11, opening cleanly in PowerPoint at the right size. Verified by
driving the actual buttons in a browser, saving the six files, and opening the
PowerPoint files in PowerPoint to render and inspect them.

Two bugs found and fixed that way: the vertical scope band read "Unit Extensio /
n" because PowerPoint rotates a text box without swapping its width and height;
and the current stage's icon stayed dark on its orange circle, because the
preview achieved white line-work with a CSS filter that neither PowerPoint nor the
rasteriser can apply — there are now real white icon variants used by all three
outputs. A third mismatch was PowerPoint choosing a different photo crop from the
preview; the tool now does the cover-crop itself so all three agree.

**Blocked on the environment**, in three stages — WSL2 feature, WSL2 kernel, and
finally SVM Mode in the BIOS. All recorded in `docs/PROJECT.md`.

## 2026-08-07 — the database is live and the access rules are proven

**The environment is finally sorted.** The owner enabled SVM Mode in the BIOS;
Docker's engine (29.6.2) started, and the local Supabase stack is up and healthy
under its own project name. `.env.local` now holds the real local values.

**The database exists.** Eight tables plus a PM name-alias table, every one with
its access rules in the same migration. Applied cleanly on the first attempt.
Types regenerated. Seeded with real units from the sample sheet, chosen so the
rules can actually be exercised: Cyan 11 and Ancient Hill 56 belong to "Mariam
Amer", Phase 4 Villa 2B belongs to "Heba Kamal".

**The access rules were tested against the real database, not just asserted.**
Signed in as each of the three dev logins through the same API the app uses:

| Signed in as            | Sees                                       | Can change           |
| ----------------------- | ------------------------------------------ | -------------------- |
| `admin@dev.local`       | all 3 units                                | everything           |
| `pm@dev.local` (Mariam) | Cyan 11, Ancient Hill 56 — **not** Phase 4 | only their own units |
| `member@dev.local`      | all 3 units                                | **nothing**          |

The project manager could not rename another PM's unit, record a sheet upload,
invent a unit, or promote themselves. The viewer could see Cyan 11 and still not
retick its quotations. All 15 permission cases are also unit-tested, so the SQL
and the TypeScript halves are pinned to each other.

**One fragility fixed forward** (migration 0007). PM names were matched on
`lower(trim(name))`, which misses a doubled internal space — "Mariam Sobhy"
would not have matched "Mariam Sobhy". The real sheet is clean today, but that
column is typed by hand and the failure mode is the worst kind: a project manager
silently loses sight of their own units with no error to notice. Both halves now
collapse internal whitespace, and a blank name can never match a blank alias.

`pnpm verify` green with **116 tests**; `pnpm migration-lint` clean on 7
migrations.

**Next:** the upload screen, then the unit page.

## 2026-08-07 — the tool works end to end on the real sheet

**The whole cycle now runs.** Signed in as admin, uploaded the real
_Follow-up sheet (Don't Delete).xlsm_, and got **317 units from 645 quotations in
about 16 seconds**, with 0 rows rejected and the duplicate-zone spellings flagged
for confirmation. Opened a unit, saw its newsletter, unticked a quotation and
watched the figures change, then exported all three formats.

Screens built: **Units** (the 8am screen — a card per unit with progress, the
ahead/on-track/behind verdict, how many quotations are ticked and whether photos
are in), **Upload sheet** (admin only, with a preview of what was read before
anything is saved, and a history of recent uploads), and the **unit page** (the
newsletter beside the quotation tick list).

**Verified as all three roles in the running app**, not just in tests: the project
manager saw 45 of the 317 units, had no Upload sheet menu item, and was bounced
to the home page when typing `/import` by hand. The viewer saw all 317 with every
tick box disabled and was told the unit is read-only. No page errors anywhere.

**Three real bugs the run exposed, all fixed:**

1. **The upload timed out.** The import wrote one row at a time — over a thousand
   sequential round trips for the real sheet. Now batched, which needed migration
   0008: the unique keys were expression indexes, which PostgREST's upsert cannot
   target, so units and quotations gained stored normalised key columns. 3 minutes
   and failing → 5 seconds.
2. **"URI too long."** Looking up existing quotations passed ~400 unit ids into
   one query, which became an over-long URL. Chunked.
3. **The preview was cut off.** 1280px does not fit beside the controls, so the
   preview now scales to 74% — and an export from that page was checked to still
   produce a full-size 3200 × 1800 JPG and a 13.333 × 7.5in slide.

**One design decision reversed.** New quotations were being left UNticked, which
meant 317 units arriving with empty newsletters and the owner ticking every one by
hand. Since the tool exists to combine a unit's quotations with a way to leave
some out, a new quotation is now included by default — except where the sheet says
Cancelled or VOID, which never belong in front of a client.

`pnpm verify` green with 116 tests; `pnpm migration-lint` clean on 8 migrations.

**Open question for the owner:** unit display names. Simple codes come out well
(`CY-11` → "Cyan 11", `AH-56` → "Ancient Hill 56"), but compound ones do not:
`AH-15A-0` becomes "Ancient Hill 15A 0" and `ASR03-3-02` becomes "Ancient Sands
Building 3 ASR03-3-02". 39 of 317 names read awkwardly. Every name is editable and
remembered, so nothing is blocked — but the naming convention is domain knowledge
the tool does not have.

**Next:** the Gantt schedule editor, then the photo picker.

## 2026-08-07 — the Gantt schedule editor

**The schedule now lives in the tool, as the owner asked.** On a unit page, each
ticked quotation gets an editor: a band label plus a list of activities with a
name, a start and finish date, and a "needs attention" tick that paints the bar
orange (the "Pending Neighbour consent" bar on the Phase 4 Villa 2B sample). Bars
can be reordered and removed. Adding a bar pre-fills its dates from the previous
bar's finish, or from the quotation's own planned start and contractual finish —
an empty form is far more work than one row to correct.

**Verified by building a real schedule through the UI**, on Ancient Hill 10: four
bars saved, the page reloaded, the schedule came back ("Edit schedule (4 bars)"),
and the newsletter switched from the photo layout to the Gantt layout with a month
ruler running Aug 2025 → Jan 2026. The exported PowerPoint carried all four bars,
the orange attention bar, the vertical "Unit Extension" band and the month ruler —
85 editable shapes, opened and inspected in PowerPoint.

Clearing every bar removes the schedule and puts the unit back on the photo
layout, which is the right behaviour for quotations that have no time schedule.

**Access rules checked against the real database.** The schedule tables' policies
route through nested helpers (`unit_of_quotation`, `unit_of_schedule`), which
nothing had exercised until now: a project manager can save a schedule on their
own unit, is refused on another PM's, and a viewer is refused everywhere.

**One fidelity fix.** The elapsed-time ring came out visibly smaller in PowerPoint
than on screen, because a PowerPoint chart reserves margin inside its frame. The
frame is now oversized and re-centred so the drawn ring matches the preview.

`pnpm verify` green with **129 tests**; `pnpm migration-lint` clean on 8.

**Next:** reusable schedules, then the photo picker.

## 2026-08-07 — schedules are reusable per scope of work

**Build a schedule once, reuse it forever, and let the dates move.** On a
quotation with no schedule the editor now offers the schedules already built on
OTHER units doing the same kind of work — "Copy a Unit Extension schedule
(1 available)". Pick one, pick the date this unit's work starts, and every
activity moves with it: each keeps its own length and its gap from the one
before. Then it is an ordinary draft, editable bar by bar, and nothing is saved
until the owner says so.

This is the owner's own refinement of the idea they had earlier turned down: not a
template the tool imposes, but their real schedules, re-dated. The library grows
out of their own work.

The new-start date defaults to that quotation's own `Planned Start Date`, which is
usually exactly right.

**Verified through the UI**, copying Ancient Hill 10's four-bar Unit Extension
schedule onto Ancient Sands 120 and forcing a start of 1 Mar 2027:
Mobilization stayed 29 days, Handing Over stayed 22, and the whole span stayed
120 — just moved. The "needs attention" flag and the band label came across too.
Saved, reloaded, and the shifted dates appeared on the newsletter.

The re-dating maths is a pure function (`src/lib/newsletter/schedule-shift.ts`)
with 14 tests covering durations, gaps, the total span, shifting backwards, a leap
day, Egypt's daylight-saving change, reordered bars, and refusing to touch
anything when the date is unreadable.

**Two notes for whoever picks this up.** A unit can have several ticked
quotations, each with its own editor — the buttons name the quote number
("Build a time schedule for 19898") because the first editor on the page is not
necessarily the one you want. And schedules are only offered from units the
signed-in person can already see, since the query runs under RLS.

`pnpm verify` green with **143 tests**; `pnpm migration-lint` clean on 8.

**Next:** the photo picker.

## 2026-08-07 — photos, and the end-to-end newsletter

**The photo picker works, and DECISIONS 0007 is resolved.** Photos are uploaded
straight from the browser to Storage (never through the Worker), then served back
through a single route handler on this tool's own address — which is what finally
lets both exporters read their pixels. Verified the whole way: four photos
uploaded, ticked, drawn on the newsletter, and **present in the exported JPG and
inside the PowerPoint** (11 pictures on the slide).

The picker shows every photo as a thumbnail with a tick box, numbers each ticked
photo with the slot it lands in, and warns plainly when more are ticked than the
layout can show — "This layout shows 2 photos, so the last 1 ticked one will not
appear." Order is changed with arrows (drag-to-reorder is not built). Ticks and
order are remembered per unit.

**Ancient Hill 56 now renders completely, and every number matches what the
calculation engine predicted on day one:** quotations 20415 + 20423 combined into
1,424,488 LE, 36% money-weighted progress where a flat average would say 20%,
BEHIND at 52 of 93 days, the Area of Concern bullet from the sheet's Notes, the
Gantt bars, and two real site photos.

**A bug worth remembering, written up in `docs/PROJECT.md`.** Zod v4's `z.uuid()`
checks the UUID _version bits_, and the template's seeded ids are not valid v4 —
so every action guarding an id silently rejected the seeded demo rows while
working fine on imported ones. Id fields now use `z.guid()`, and the seed uses
real v4 ids. This also affected the template's own Users screen, which could not
promote a seeded dev user — fixed here and to be reported upstream.

**Still open: reading a OneDrive folder automatically.** The link field is there
and saved, and the picker links out to it, but listing a shared folder's contents
needs a Microsoft sign-in — an "anyone with the link" URL serves a web page, not
a machine-readable listing. For now the owner saves the photos out of OneDrive and
adds them here. See the question put to the owner.

`pnpm verify` green with **143 tests**; `pnpm migration-lint` clean on 9.

**Next:** the folder picker, and the two Gantt spacing problems.

## 2026-08-07 — folder picking, and the Gantt's empty space

**The SharePoint link is settled: it cannot work without IT.** The owner supplied
the real link for Ancient Hill 56. Fetched it: **403 Forbidden** with an
`X-Forms_Based_Auth_Required` header. It is a team-site document library
(`/sites/ElGounaDestinationFS/Shared Documents/PM Team/02-Town Projects/03-Site
Photos/Ancient Hill/AH-56`), not an anonymous share — it only opens for someone
already signed in to the tenant, and the `OR=OWA-NT-Mail` parameters show it came
out of an Outlook email. Automatic listing needs an Entra app registration.
Recorded as a graduation trigger.

**So the picker now opens Windows Explorer properly.** Two buttons: _Choose
photos_, and _Choose a whole folder_ — point the latter at the unit's photo folder
and every image inside is added in one go, with non-images silently skipped (a site
folder routinely holds PDFs and spreadsheets). Photos can also be dragged onto the
box.

**Two spacing problems the owner spotted, both fixed, both structural rather than
cosmetic:**

1. **A short schedule left a large empty area beneath it.** The panel used to be
   sized to its content with a minimum, so three bars occupied the top third and
   the rest was blank. The panel is now a fixed block reaching down to the stage
   track, and every bar gets an equal slice of it — clamped so a long schedule
   still fits and two bars are not flung to opposite edges, with any slack
   centred.
2. **A wide blank strip to the right.** The ruler always added a trailing month.
   That is right for Cyan 11, whose last bar ends 24 September and needs label
   room, but wrong for a schedule ending mid-month: it added an empty column and
   squeezed the bars leftwards. The trailing month is now added only when the last
   activity ends in the final 40% of its month.

Six more geometry tests cover the fill, the centring, bars staying inside the
panel with a twelve-bar schedule, and the trailing month appearing and not
appearing.

**Deferred deliberately: fine alignment of shapes and text.** Agreed with the
owner to do one focused design pass once the tool is functionally complete, judged
against a batch of real newsletters rather than one at a time — every functional
change so far has moved the panel, the ruler or the photo grid, and polish applied
now would simply be redone.

`pnpm verify` green with **149 tests**; `pnpm migration-lint` clean on 9.

**Next:** the owner's spacing corrections.

## 2026-08-07 — the Gantt spacing, corrected to the owner's brief

The owner reviewed the previous change and asked for the opposite trade-off, which
is better: **bars stay close together with a ceiling on the panel, and everything
below moves up.**

- The panel grows with its bars up to `maxHeight` (208px) and no further. Bars keep
  a comfortable fixed spacing rather than being spread to fill.
- `withScheduleBlocks()` derives the stage track and photo positions from however
  tall the panel turned out, so a short schedule pulls them up and **the photos
  take the space** — 320px tall for a three-bar schedule against 200 for a full one.
- Past about ten bars the spacing has to squeeze; beyond that the bars thin out
  (floor of 6px) so nothing is ever clipped, and the editor now warns that the
  chart is getting crowded rather than letting it be discovered on a slide.
- **Every month is labelled, and none is hidden.** The ruler now also covers the
  Start and Finish dates printed on the card: Ancient Hill 56's schedule ends
  15 Aug but its card says Finish 17 Sep, and a ruler stopping in August invites
  the obvious question. September is back.
- **A 25%-opacity vertical line marks where each month starts**, in both the
  preview and the PowerPoint, so a bar can be read against the ruler without
  counting across.

Verified on screen and in an exported slide (84 editable shapes) — the two match.
Ten geometry tests cover the ceiling, the compact spacing, the squeeze, bars
staying inside the panel with twenty bars, the blocks moving up, photos growing,
nothing running into the footer, and the ruler covering the card's dates.

**One testing lesson:** the first screenshot after this change showed no photos at
all and looked like a serious bug. The photos were in the DOM and returning 200 —
the screenshot simply fired before the images decoded. Screenshots of the canvas
now wait for `img.complete && naturalWidth > 0`.

`pnpm verify` green with **153 tests**.

**Next:** editing unit details and the Area of Concern.

## 2026-08-07 — unit details and Area of Concern are editable

**The Microsoft route is closed.** The owner tried creating an app registration
themselves: **401, "You don't have access"** on the OrascomDH tenant. User app
registration is disabled, so reading SharePoint folders automatically needs an IT
request. Recorded in `docs/PROJECT.md`; the folder picker stands as the answer.

**The unit page can now edit everything the owner owns:** the name on the grey
header, the client, which stage is lit, and the Area of Concern bullets.

The stage selector's automatic option names the stage it would choose
("Automatic — Construction"), so overriding it is an informed decision rather than
a guess. The Area of Concern has a "use the notes from the sheet" tick: leave it on
and the bullets follow the sheet's `Notes`; turn it off and type one bullet per
line. Clearing the box is allowed and meaningful — the difference between "follow
the sheet" and "deliberately empty" is kept.

**Verified through the UI:** renamed a unit, set its client, forced the stage to
Design, and typed three bullets. All four reached the newsletter, the typed bullets
replaced the sheet's note, Design lit up instead of Construction, and the new name
appeared on the dashboard.

`pnpm verify` green with **153 tests**.

**Next:** dashboard filters and the cycles screen.

## 2026-08-07 — filters, cycles, and the template editor specified

**The dashboard filters work.** Search over unit code, name and client; zone;
project manager; and readiness — _ready to send_, _needs photos_, _nothing ticked_.
Readiness is derived rather than stored: a unit is ready when it has at least one
ticked quotation and at least one chosen photo. Filters live in the URL, so a
filtered view can be bookmarked or sent to a colleague and survives a reload —
which matters when working through hundreds of units over a morning.

**Cycles (editions) are managed on their own screen.** Opening one sets the wording
and the date printed in every newsletter's footer, and the footer date is what every
unit's elapsed time is measured against — so opening a cycle moves the numbers on
every newsletter at once. The screen says that plainly, marks which cycle is _in
use_, and allows correcting the wording or date of an earlier one.

Verified through the UI: `zone=Cyan` → 1 unit, `state=ready` → 1 of 3,
`needs-photos` → 2, `Cyan + ready` → 0 (right: Cyan 11 has no photos yet). Opening a
cycle for 24 Aug changed the dashboard to "Weekly Newsletter · 24 August 2026". A
viewer sees neither the _Open a new cycle_ card nor the _Change_ buttons.

**Not built, deliberately: the per-edition snapshot.** `edition_units.snapshot`
exists and the spec promises an old cycle re-renders exactly as it was sent. Today
reopening an old cycle re-renders from _current_ sheet figures. Recording the
snapshot on export is the remaining piece; called out here so it is not mistaken for
done.

**The template editor is specified, not built** — see `docs/SPEC.md`. It is a real
feature and needs the owner's approval first. The approach: store overrides on top
of the defaults in `layout.ts`, bound every value, always offer reset, and no
free-form dragging. The honest cost is that every rendering file must receive the
resolved layout rather than importing it.

`pnpm verify` green with **153 tests**.

**Next:** the template editor.

## 2026-08-07 — the template editor's foundation

The owner refined the requirement, and the refinement is better than the original
spec: **three masters** (Timeline, Photos only, and Before Delivery for later),
editable so a change applies to every newsletter — plus **per-unit changes that
stick for that unit from then on**, like its name and its ticked quotations already
do. `docs/SPEC.md` rewritten accordingly.

The design a newsletter uses is now three layers: the original design in code, then
the master for its layout, then the unit's own changes. Later wins.

**Built the foundation, which is the risky half:**

- `src/lib/newsletter/theme.ts` — every text size on the newsletter is now a NAMED
  value rather than a number buried in a component (24 of them), alongside the
  left-column box heights, the changeable colours, and the lines that may be
  hidden. `resolveTheme(master, unit)` layers the three and **clamps every value**,
  so no setting can produce an unreadable page or push a box off the slide.
- Migration `0010` — `newsletter_templates` (all three rows created up front, so
  the read path never meets a missing one) and `units.design_overrides`. Only
  differences are stored, which is what makes reset mean "forget the override":
  the defaults are code and cannot be edited away.
- 19 tests on the cascade: master applies, unit wins over master, a unit can turn
  back on a line the master hid, reset is the absence of an override, and nonsense
  survives — zero, negative, absurd, `NaN`, `Infinity`, a bad hex colour, a
  corrupted boolean all fall back to the original rather than rendering something
  broken.

Everyone signed in may READ the masters (they are needed to render anything at all);
only admins may change them, because one edit moves the whole programme.

**Not yet done, and the renderer is untouched so far:** every component still reads
`layout.ts` directly. Threading the resolved design through the renderer and the
PowerPoint exporter is the next step, then the Design screen itself. Doing the
foundation first means the wide mechanical change lands against tests that already
describe the intended behaviour.

`pnpm verify` green with **172 tests**; `pnpm migration-lint` clean on 10.

**Next:** the wiring.

## 2026-08-07 — the design is wired through every output

The wide mechanical change is done: the renderer and the PowerPoint exporter no
longer read the design from constants. Both take a **resolved theme** and a
**stacked left column**, so the same adjustable values drive the preview, the JPG,
the PDF and the slide.

Two problems this turned up, both real:

1. **Fixed positions could not survive editable heights.** Every box in the left
   column had a hard-coded `y`; making a box taller would simply have overlapped
   the one below. The column is now STACKED — each box sits a fixed distance below
   the one above, and those distances are taken from the original design, so default
   heights reproduce it to the pixel. There is a test for exactly that.
2. **Per-box limits were not enough.** Every box at its own maximum still stacked to
   y=914, far past the footer at 670. Clamping individually is meaningless without a
   whole-column constraint, so the column now shrinks all the adjustable heights
   together until it fits, and `leftColumnFits()` reports it so the Design screen can
   say so rather than leaving the owner wondering why a box came out smaller than
   they typed. Worth knowing: the original design already ends 22px above the footer,
   so growing one box genuinely means shrinking another — a property of a one-page
   layout, not a limitation of the editor.

**Two misses caught by grepping for anything still hard-coded**, which is why that
sweep was worth doing: the Duration box kept the original colour because a
replacement matched only the first of two identical lines (Status would have changed
colour while Duration did not), and the chevron between the date cards had a fixed
size — it is now tied to the day number so it keeps pace.

**Verified the wiring changed nothing**: the three sample newsletters render exactly
as before, with every figure intact, and no page errors.

`pnpm verify` green with **180 tests**.

**Next:** the Design screen.

## 2026-08-07 — the Design screen: the template editor works

**All three layers work, and the cascade was proven end to end into PowerPoint.**

`/design` (admin only) edits the three masters — Timeline, Photos only, Before
Delivery — each previewed against **a real unit** rather than invented sample
content, so the design is judged against the owner's own figures. Controls: 24 text
sizes grouped the way someone looking at the page would group them, plus _All
bigger_ / _All smaller_ to scale them together; five box heights; five lines that can
be hidden; eight colours. Every value has its own reset arrow, and there is a reset
for the whole thing.

A unit's own design is edited on that unit's page, full width below the newsletter.
It carries a badge either way — "Following the Photos only master" or "own layout
changes" — and the Design screen lists every unit that differs, so a one-off tweak
cannot quietly haunt the programme.

**Verified by doing it**: set the Photos master to a green accent and a 30px unit
name → the preview changed live → saved → the green appeared on Cyan 11's
newsletter. Then gave Cyan 11 its own red accent → red beat the master → the badge
changed → the Design screen listed it → reset → the master's green came back. A
project manager asking for `/design` is sent home.

**And the exported slide carries the resolved design, not the original**: the
PowerPoint from the overridden unit contains the unit's red nine times, contains
neither the master's green nor the original orange, and the unit-name size arrives
as 22.5pt — exactly 30px × 0.75. That is the whole promise of the three layers,
demonstrated in the file that reaches a client.

**One real bug this turned up.** The editor lays its controls and preview side by
side; nested in the unit page's 20rem sidebar, the 870px preview overflowed and
silently swallowed clicks on the editor's own Save button. Two fixes: the scaled
preview is now clipped (`overflow: hidden` — a transformed child keeps its full
layout size, so without clipping it overhangs and eats pointer events), and the
unit's design editor moved out of the sidebar to full width, which it needed anyway.

`pnpm verify` green with **180 tests**; `pnpm migration-lint` clean on 10.

**Next:** the review's action list.

## 2026-08-07 — the review's list, items 1–5

The owner asked for a review before testing. Answer: not complete, five things to
fix. All five are now done.

**1. Quotations that vanish from the sheet are noticed (migration 0011).** They used
to linger — still ticked, still in the Quotation Amount — so a newsletter could show
a client a quote that no longer existed. `last_seen_upload_id` was already recorded
and never read. Now a quotation absent from the newest upload is flagged, taken off
the newsletter, and badged "gone from the sheet" on its unit; the upload screen says
how many. The row is KEPT, because it holds a schedule, photos and the owner's tick,
and the disappearance might be a mistake — one tick puts it back. Scoped to units
that ARE in the upload, so a filtered sheet cannot mark the whole programme missing.
Verified by deleting quote 20423 from a copy of the real sheet and re-uploading: the
warning fired and the references went from "20415, 20423" to "20415.".

Also: **Cancelled and VOID now come off on every upload**, not just the first time —
the one deliberate exception to leaving the owner's tick alone, and it only ever
unticks.

**A latent bug found on the way, worth remembering.** PostgREST builds ONE insert for
a bulk upsert, so a key present on some objects and absent on others is sent as NULL
for the ones missing it. Conditionally-included columns therefore blanked things: it
surfaced as a NOT NULL violation, but the same shape would have silently wiped a
typed-in client name the moment that column was added to the query. Batches are now
split by shape, with a comment explaining why.

**2. Batch export (`/export`).** One file, not a folder of hundreds: one PowerPoint
with a slide per unit, or one PDF with a page per unit. Only READY units are offered
(a ticked quotation and a chosen photo), each can be unticked, and progress is shown
per unit. The PDF needs each newsletter rasterised, so all of them are rendered
off-screen — laid out but invisible, because an element with `display: none` has no
box and cannot be captured. Verified: 3 units → a 3-slide deck (~60 editable shapes
each) and a 3-page PDF, named "Bi-Weekly Newsletter 2026-08-07 (3 units)".

**3. The template's Example Items feature is gone** — slice, routes, nav, tests and
seed rows. Migration `0004` stays (history is append-only). The home page was still
the template's placeholder; it is now a real dashboard: how many units are ready,
need photos, or have nothing ticked, with links straight to each.

**4. End-to-end tests for the real workflow** (`tests/e2e/newsletter.spec.ts`, 6
tests). They cover the money-weighted combining, building a schedule and the layout
switching, exporting a PowerPoint, a PM seeing only their own units and being
bounced from admin screens, a viewer finding every control disabled, and uploading
the real 645-row sheet. Before this, the automated suite only tested logging in.

**5. The export snapshot.** Exporting now freezes the newsletter, and `/editions/[id]`
re-renders a past cycle from those snapshots. Verified end to end: exported at
1,424,488 LE, unticked a quotation so the live newsletter became 1,270,457, and the
archived cycle still showed 1,424,488 with both quotes. Serialisation has its own 13
tests because the obvious way to store a date shifts it a day (DECISIONS 0003), and
it refuses to half-render a corrupt or future-version snapshot.

**One defect the e2e run surfaced:** the PowerPoint bullet character code must be four
hex digits — `"2D"` was silently rejected with a console warning. Now `"002D"`.

`pnpm verify` green with **161 tests**; `pnpm e2e` green with **10**;
`pnpm migration-lint` clean on 11.

**Next:** the three remaining enhancements — "what changed since last cycle" (now
possible, since snapshots exist), copying last cycle's Area of Concern, and bulk
photo import matching per-unit subfolders by unit code.

## Batch three — the Monday workflow (2026-08-08)

Everything in this batch came out of the owner's first real test run.

**1. Finished work leaves the list.** A unit whose quotations are all completed,
cancelled or void — or all at 100% — is now `COMPLETED` rather than pretending to
be "ON TRACK", and drops out of the Quick screen and the export batch by default.
On 317 units that is the difference between a usable list and an unusable one.
Every project manager on a unit is named, biggest money share first, instead of
just the first one found.

**2. The Quick screen** (`/quick`) — one row per unit answering "which patch is
this in, and has it gone out?". Patches are free-text groups the owner types
once; a unit that changes patch after the cycle opened is flagged **moved**,
because whatever was sent for it went out under the old grouping. **Sent** is a
tick recorded per cycle, so next cycle every unit starts blank again. Exporting a
file and telling the tool it reached the client are deliberately two different
facts. "Export this list" carries the current patch straight into the batch
export, already narrowed to what is not sent yet.

**3. A separate PDF and image per unit.** The third export button produces
`Ancient Hill 56 newsletter.jpg` and `Ancient Hill 56 newsletter.pdf` for every
unit, delivered as one zip (DECISIONS 0008). Verified: two units in, four
correctly-named files out.

**4. The elapsed ring reworked.** Bigger, thinner, and a darker grey. Past the
finish date it restarts from zero in red, showing `+75` and "Days Overdue"
rather than sitting full and saying nothing. Both the on-screen page and the
PowerPoint were checked — the slide carries the red and the `+75`. A fourth
sample on `/newsletter-preview` renders that state permanently.

**5. The Units dashboard stops showing finished work.** On the real programme
that is 165 of 317 units, leaving 152 that actually need something. Two new
controls: **Include finished** brings them back, and **Only units at 0%** finds
the 34 that have not started. Both live in the address bar, so a filtered view
can be sent to a colleague.

**6. The Cycles screen explains itself** — three short paragraphs on what a
cycle sets, what it remembers, and what it freezes, using a worked example.
Asked as a question during the test run, so answered where the question was
asked rather than in a document.

**7. Smaller fixes from the same test run:** long scope names wrap inside the
timeline band instead of spilling out of it; the logo box height is adjustable
while the logo's own proportions are untouched; the Design screen's preview
sticks while the settings list scrolls.

**Two defects found by verifying rather than assuming:** the patch actions file
exported its Zod schemas, and a `"use server"` file may only export async
functions — the whole Quick screen 500'd until they moved to `schema.ts`. And a
freshly uploaded photo arrived unticked, so a unit stayed "needs photos" after
the owner had just given it photos (DECISIONS 0009).

`pnpm verify` green with **170 tests**; `pnpm e2e` green with **12**;
`pnpm migration-lint` clean on 12.

**Next:** the three enhancements still outstanding — "what changed since last
cycle", copying last cycle's Area of Concern, and bulk photo import matching
per-unit subfolders by unit code.

## Batch four — surviving 300 units, and reviewing only what moved (2026-08-08)

A review of the tool at real size found one thing that would have failed silently
mid-cycle and several that cost an hour a week. Plan in `docs/plans/002`.

**1. Photos are shrunk automatically as they are added.** Storage was the wall
nobody would have seen coming: six camera originals across 152 units is 3–4 GB
against an allowance of one. Every photo is now resized to 2000px on its longest
edge before it leaves the laptop — which is still larger than the newsletter can
draw at export size, so nothing is lost on the page. Measured on a real 4032×3024
original: **11.7 MB in, 1.3 MB out**. The owner sets nothing; the tool reports
what it saved.

**2. The batch export renders a few at a time.** It used to mount every
newsletter off-screen at once. Now it lays out eight, captures them, unmounts
them and moves on — verified by counting: **peak 8 mounted, 0 left afterwards**.
The batch limit is 100 (the owner works in patches of about sixty).

**One real bug found doing it:** the query fetched only 121 rows BEFORE finished
and already-sent units were filtered out, so units further down the alphabet
could never reach a batch. The ceiling is now well above the whole programme and
the cap is applied to what survives.

**3. The Home page counts what the other screens count.** It was splitting all
317 units into ready / needs photos / nothing ticked, so 165 finished units were
being reported as work outstanding. Now: 145 need photos, 7 have nothing ticked,
165 finished — and each number is a link.

**4. A "What changed" screen.** Against the previous cycle's frozen snapshots:
progress moved, verdict changed, dates moved, concerns added or cleared, newly
finished. Anything needing action sorts to the top.

**5. A timeline that no longer matches its quotation is reported.** The Gantt
lives in the tool, so when the sheet moves a Planned Start or Max Contractual
date the timeline silently goes stale — the owner's words were "i may overlook
it". Schedules now record the dates they were built against, and drift is called
out on the unit card, in a filter, and on What changed. Proven end to end: built
against 2022-08-19, sheet moved it to 2027-03-31, unit moved from "has a
timeline" to "timeline out of date" with the quotation named.

**6. Bulk photo import.** One parent folder — `…/Ancient Hill/AH-56/…` — matched
to units by code, newest few per unit, with the matched and unmatched lists shown
BEFORE anything uploads. Matching survives the naming schemes people actually
use: `AH 56`, `AH-039`, `AH-064`, `AH-68 (final)` all matched; an unknown folder
was reported rather than guessed at; a loose file was ignored. Per-unit "Choose
photos" is untouched, for folders the matcher cannot make sense of.

**7. The Area of Concern carries forward, and says when the sheet disagrees.**
The owner's wording beats the sheet's Notes column and always did; what is new is
that a divergence is now shown, with the sheet's version one click away.

**8. Knowing what still needs a timeline.** A unit can be marked **photos only**,
which is different from "nobody has built one yet". Filters: has a timeline ·
needs one · photos only · not decided · out of date.

**9. Next / Previous on a unit page**, walking the list's current run — verified
as "1 of 133" then "2 of 133" with the filter carried along, not 1 of 317.

**Another bug found by verifying:** unit cards linked without the filters, so
arriving from a filtered list gave a page that thought it was in the whole
programme.

`pnpm verify` green with **203 tests** (33 new: folder matching and change
detection); `pnpm e2e` green with **16** (4 new); `pnpm migration-lint` clean on 13.

**Next:** nothing outstanding from the review. Before Delivery remains designed
for but not built.

## Batch five — sort any list by what it shows (2026-08-08)

Every list in the tool can now be ordered, and each one offers exactly the fields
that are on the screen in front of you — never a field you cannot see.

- **Units** — a Sort by menu in the filter bar: unit name, client, progress,
  status, days gone, duration, zone, project manager, quotations ticked, photos
  chosen, what it still needs, timeline. Status sorts BEHIND first and timeline
  sorts "out of date" first, because that is what a person means by sorting on
  them — not alphabetical order.
- **Quick, Import photos, Users** — click the column heading. The arrow only
  appears on the column actually in use.
- **Export, What changed, Cycles** — a Sort by menu over what each shows.

Two rules hold everywhere, so a column behaves the same on every screen:
**blanks sink** whichever way the arrow points (a wall of "no project manager"
at the top is never what was wanted), and **numbers inside names count as
numbers**, so Ancient Hill 5 comes before Ancient Hill 56.

On the Units screen the sort lives in the address bar, which means **Next and
Previous walk the sorted order too** — sort by progress, open the top unit, and
Next is the second one on the list. Verified: sorted descending then ascending
gives exactly the reversed list, and the neighbour buttons follow.

**One real bug found doing it:** the export filter bar is a client component and
was importing its sort options from the `server-only` query module, which pulls
the server Supabase client into the browser bundle. The options moved to a plain
shared module.

The batch export cap is also applied AFTER ordering now, so "the first 100" means
the first 100 of what was asked for rather than the first 100 alphabetically.

`pnpm verify` green with **219 tests** (16 new for sorting); `pnpm e2e` green
with **18** (2 new).

## Live on the internet (2026-08-08)

**https://newsletter-system.pmoteam.workers.dev**

Cloudflare Workers + a cloud Supabase project in Frankfurt. All 13 migrations
applied, the service-role key held as a Worker secret (and verified absent from
the uploaded bundle), public signup closed — checked by attempting a signup and
being refused.

Three things had to be fixed to get there, none of them obvious:

1. **The deploy script did not work on Windows.** It chained two commands inside
   single quotes; cmd.exe splits on the inner `&&` and passes the trailing quote
   on, so it ran `deploy'`. Now chained at the script level.
2. **Next was on a version the Cloudflare adapter excludes.** The adapter allows
   `>=15.5.21 <16 || >=16.2.11`; the project was pinned to 16.2.10 — inside the
   gap, with nothing warning about it.
3. **The bundle was 18 KiB over the 3 MiB ceiling.** The development-only design
   preview was 107 KiB of it, despite returning 404 in production. Dev-only pages
   now use a `.dev.tsx` suffix and are absent from production builds entirely.

**And the one that actually mattered:** a Windows-built bundle deploys happily
and then 500s on every page. The adapter inlines Next's manifests by matching
paths ending `/server/<name>-manifest.json`, but a Windows build writes
`.next\server\...`, so the match fails and it falls through to a `require()`
the Workers runtime cannot do. Building the same commit in a Linux container
produced forward slashes, a bundle 400 KiB smaller, and a working site. The
`deploy` GitHub workflow builds on ubuntu so this cannot recur.

The repository is public, so it was scrubbed first: client and PM names replaced
with invented ones, the six real villa photos replaced with placeholders, the
internal SharePoint library address redacted, and `Sample/` (the live follow-up
sheet) excluded — the one test that reads it skips when absent.

## Batch six — one work screen, and photos on demand (2026-08-10)

From the owner's observations after a week of real use. Plan in
`docs/plans/003`.

**Quick and Units are one screen** with a table/cards switch, remembered in the
address. Both views carry the patch control and the sent tick, so switching
never costs the ability to act. Two new sortable columns: **last released** and
**last sent**. `/quick` redirects.

**Work at 0% is never chased** — no prompt, not counted as outstanding, no tick
to leave unticked, and out of the export batch by default. Extended to finished
work and to units with nothing ticked: in all three there is nothing to send.
Any of them can still be exported deliberately.

**Photos are browsed off disk instead of uploaded in bulk.** The old screen read
the entire folder tree; the owner's real parent folder holds about 410,000
files, so it could not work at any speed. Now the parent folder is chosen once
and remembered, opening a unit lists only that unit's own folder, thumbnails are
drawn from disk, and only ticked photos are uploaded. Proven against a
stand-in tree whose sibling folders throw if opened: 1,600 booby-trapped files
walked past untouched, the right folder found two levels down, nine thumbnails
drawn, three uploaded. The bulk import screen is gone (DECISIONS 0014).

**Three bugs found by verifying rather than assuming:**

1. Both list views held their rows in `useState(initial)`, which captures the
   first value and ignores every later one. Filtering changed the address,
   refetched correctly, then rendered the previous answer — "Include finished"
   left the list at 2 rows where a reload gave 3. A filter that silently lies.
2. The filter checkboxes had no accessible name: a Radix checkbox is a button,
   and a label wrapping a button does not forward clicks to it.
3. The photo tile was a `<button>` containing a Radix checkbox — another button.
   Invalid HTML, and React refused it.

A fourth came out of the test harness rather than the app: failing to REMEMBER
the folder aborted the whole pick. Remembering is now a convenience that can
fail on its own, and the folder still works for that visit.

`pnpm verify` green with **235 tests** (16 new); `pnpm e2e` green with **19**.

**Next:** the newsletter design controls (box gaps, a real ceiling on the
timeline so bars shrink instead of photos, a replaceable logo) and the design
page itself.

## Batch seven — the newsletter's design, and the screen that edits it (2026-08-10)

### The newsletter

**Spacing between the left boxes is adjustable.** Those gaps were frozen
constants derived from the original artwork; they are now part of the design,
defaulting to the original values so nothing moves until someone moves it.

**The timeline has an adjustable ceiling.** Past it the BARS thin and their
labels shrink with them, instead of the panel pushing the photos down. The label
scaling was the missing half — bars already thinned, but their text stayed full
size and ran into the row above. Proven with a new fourteen-activity sample:
all fourteen inside the panel, photos at full height.

**The logo is replaceable and its proportions are fixed.** It sat shorter than
its box because both dimensions were capped by whichever edge was smaller. Stored
as a data URL, not a link, for the same reason photos are same-origin: both
exporters read pixels through a canvas (DECISIONS 0007). The gap beneath it is
adjustable and moves the timeline and photos down together.

The PowerPoint follows all of it — checked by exporting the fourteen-bar
schedule and reading the slide XML: every activity present, labels below their
base size, logo embedded.

### The design screen

All four things the owner asked for:

- **The preview stays in view** while the settings scroll — from `lg` up rather
  than only on the widest screens, which is where the complaint came from.
- **Reset per setting** already existed; each section now also shows how many of
  its settings differ from the original.
- **Copy a whole look** from another master.
- **Grouped, foldable, searchable** — six sections instead of one column of
  sixty-odd controls, with fold-all and a search that hides sections containing
  no match.

**Four bugs found by driving it:**

1. `Section` was defined inside the render, so it was a NEW component on every
   keystroke and every section snapped shut as you typed. The React Compiler
   lint caught this before a person did.
2. Searching a group by name ("colour") found nothing, because only individual
   control labels were matched. Section names count now.
3. "Copy from X" used the values from page load, so saving a change to X and then
   copying it silently copied the OLD look.
4. Two buttons read "Photos only" — one switched which master you were editing,
   the other overwrote a master with its look. Now "Copy from Photos only".

`pnpm verify` green with **235 tests**; `pnpm e2e` green with **19**.

**Everything on the owner's list is now built.** Nothing is deployed yet — one
Linux build and deploy covers batches six and seven together.

## Batch eight — several clients per unit, and the covering email

Plan: `docs/plans/004-clients-and-email.md`. Asked for after the owner sent a real
newsletter email as the example to work from.

**Clients.** A unit can be owned by more than one person, in one sheet cell. The
unit page splits them, and the owner ticks who the newsletter names and sets a
title each (Mr./Mrs./Ms./Dr./Eng./Arch.). The choices are stored against the
client's NAME, so refreshing the Power Query cannot revert a curated page —
reordering, re-casing and a newly added part-owner all leave it intact.

Two rules that exist because the alternative reaches a paying client:

- names are never split on a **comma** ("Ibrahim, Gasser El Sayed" is one person
  written surname-first, and splitting it invents a client);
- a title already written into the sheet is **lifted out of the name**, or
  choosing a title too would print "Mr. Mr. Gasser …".

**The covering email.** A new **Email** screen holds one subject and message for
every unit, with `{client}`, `{unit}`, `{date}` and `{pm}` filled in per unit; the
people copied on every unit; and one Cc rule per project manager, keyed by the name
as the sheet spells it (most PMs in the sheet have no account here). The unit page
shows the finished message with copy buttons, beside the JPG and PDF exports.

The tool does **not** send it — that is a dev-team item, recorded in
`docs/PROJECT.md` with the reasons. It composes; a person presses Send.

Guards that turn quiet failures into visible ones: a placeholder with nothing
behind it becomes "Sir or Madam" rather than "Dear ,"; a brace-shaped word the tool
does not recognise is reported on both screens; an address in To is dropped from Cc;
a malformed address is left out and flagged; and a project manager with units but no
Cc rule is named on the Email screen.

Holding client email addresses was the owner's decision, taken after the concern was
put to them and confirmed a second time — DECISIONS 0015.

`pnpm verify` green with **278 tests**. Verified against the dev stack end to end,
including that the least privileged user sees the Email screen read-only and **RLS
refuses the write underneath** (`42501` on inserting a Cc rule; the wording
unchanged after a direct PATCH).

**Still not deployed** — one Linux build covers batches six to eight together.
