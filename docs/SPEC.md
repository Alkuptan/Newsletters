# SPEC.md — the business contract

> The contract for **Unit Newsletter Studio**. Nothing gets built that isn't in
> this file. Agreed with the tool owner (pmoteam@elgouna.com) on 2026-08-07.

## Purpose

Produce a one-page progress newsletter for **each unit** in El Gouna's Extra
Works programme, on demand (weekly or bi-weekly, the owner's choice), and export
it as **JPG, PDF and an editable PowerPoint slide**.

Today this is assembled by hand in PowerPoint, one slide per unit, by copying
numbers out of the _Follow-up sheet (Don't Delete).xlsm_ and dragging photos in
from OneDrive. The tool replaces that copying: refresh the Excel query, upload
the sheet, and every unit's newsletter is already filled in — the owner reviews,
adjusts the commentary, and exports.

Version 1 covers **After Delivery** extra works only. Before Delivery uses a
different sheet shape and a different dashboard layout; it is designed for but
not built in v1 (see _Out of scope_).

### The pains v1 must remove

1. Re-typing the same numbers from Excel into PowerPoint every cycle.
2. Combining several quotations for one unit by hand (Ancient Hill 56 has three).
3. Recomputing progress %, elapsed days and the ahead/behind verdict by hand.
4. Rebuilding the Gantt bars from scratch each time, even though the activity
   list for a quotation rarely changes.
5. Producing three file formats one at a time.

## Users & roles

Today: the owner, their manager and two colleagues — all as **admin**. The
project-manager and view-only roles are built now (schema, policies, tests) so
they can be switched on later without a rebuild, per the owner's plan to have
every PM reach their own units and to give the board and upper management a
read-only view.

| Capability                                     | Admin | Project manager | Viewer |
| ---------------------------------------------- | :---: | :-------------: | :----: |
| Upload / refresh the follow-up sheet           |  yes  |       no        |   no   |
| See all units                                  |  yes  | own units only¹ |  yes   |
| Tick which quotations a newsletter includes    |  yes  | own units only  |   no   |
| Build / edit a quotation's Gantt schedule      |  yes  | own units only  |   no   |
| Add or reorder a unit's photos                 |  yes  | own units only  |   no   |
| Edit Area of Concern, unit display name, stage |  yes  | own units only  |   no   |
| Create a newsletter edition (a dated cycle)    |  yes  |       no        |   no   |
| Export JPG / PDF / PPTX                        |  yes  | own units only  |  yes   |
| Manage users and settings                      |  yes  |       no        |   no   |

¹ "Own units" = units where the sheet's **Assigned PM** matches the signed-in
person's name, as mapped in the people list.

## Things (entities)

### 1. Sheet upload

One row per time the owner uploads _Follow-up sheet (Don't Delete).xlsm_.

- File name, uploaded by, uploaded at
- Rows read, rows accepted, rows rejected (with reasons)
- Which sheet tab was read (v1: `After Delivery Extra works`)

Uploading is **additive**: a new upload replaces the imported quotation figures
but never touches anything typed into the tool (photos, Gantt schedules, Area of
Concern text, display names, tick boxes).

### 2. Unit

The subject of one newsletter. Created automatically from the sheet's `Unit`
column; enriched by hand once.

| Field                | Where it comes from                                                                                                           |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Unit code            | sheet `Unit` (e.g. `CY-11`, `Ph4-Villa-2B`, `AH-56`)                                                                          |
| Zone                 | sheet `Zone` (e.g. `Cyan`, `Phases`, `Ancient Hill`)                                                                          |
| Display name         | auto-suggested from zone + code (`CY-11` → "Cyan 11"), editable, remembered                                                   |
| Client name(s)       | sheet **`Client Name`** — a new column the owner adds to the Power Query. Several people in one cell, separated by `;` or `/` |
| Client email(s)      | sheet **`Client Email`** — optional. Several addresses in one cell                                                            |
| Who is named         | chosen in the tool per unit, plus a title each; remembered, and keyed by name so a sheet refresh cannot revert it             |
| Assigned PM          | sheet `Assigned PM`                                                                                                           |
| OneDrive folder link | typed once in the tool; photos are pulled from it                                                                             |
| Current stage        | worked out from `Project Status`, overridable, remembered                                                                     |

### 3. Quotation

One row per quote from the sheet. Read-only figures plus tool-owned extras.

| Field                 | Where it comes from                   |
| --------------------- | ------------------------------------- |
| Quote #, Invoice #    | sheet                                 |
| Value of Invoice      | sheet `Value Of Invoice`              |
| Scope of work         | sheet (becomes Project Summary)       |
| Progress %            | sheet `Progress % Current`            |
| Planned start date    | sheet `Planned Start Date`            |
| Latest finish date    | sheet **`Max Contractual`**           |
| Project status        | sheet `Project Status`                |
| Notes                 | sheet `Notes` (seeds Area of Concern) |
| Include in newsletter | ticked in the tool, remembered        |
| Has a time schedule?  | true once a Gantt schedule is built   |

### 4. Gantt schedule (one per quotation)

**Decided per unit (added 2026-08-08):** some units are meant to carry photos
only and will never have a timeline. Marking a unit **photos only** stops it
appearing in "still needs a timeline", which is otherwise indistinguishable from
"nobody has built one yet". A schedule also records the quotation dates it was
built against, so when the sheet moves a Planned Start or Max Contractual date
the tool can say _this timeline no longer matches its quotation_ — the Gantt
lives in the tool and does not follow the sheet on its own.

Built by hand in the tool the first time, then saved and recalled every cycle;
editable at any time. This is what draws the bars on the right of the dashboard.

- Row label (e.g. "Unit Extension") — the vertical band on the left
- Activities in order, each with: name, start date, finish date, and a colour
  (normal blue, or **attention orange** for things like "Pending Neighbour
  consent")

### 5. Photo

- The unit it belongs to, the image, when it was taken, and its position in the
  layout
- Pulled from the unit's OneDrive folder link. **Everything in the folder is
  listed as thumbnails; the owner ticks which ones go on the dashboard** and
  drags them into order. Newest-first is only the default suggestion.
- Two are used when the unit has a time schedule; up to six when it doesn't.
  Ticking more than the layout holds is refused with a plain message saying how
  many will fit.
- Ticks are remembered per unit, so next cycle only the newly-arrived photos are
  untouched and waiting for a decision.
- **Every photo is shrunk automatically as it is added** (longest edge 2000px,
  JPEG). The newsletter never shows a photo larger than that even at export
  size, so nothing is lost on the page — but a camera original is 10 to 20 times
  bigger, which the storage allowance cannot carry across 300 units. The owner
  does nothing; the tool reports how much it saved.
- **Bulk import (added 2026-08-08).** The owner points at one parent folder
  holding zone folders holding unit folders — `.../Ancient Hill/AH-56/*.jpg`.
  The tool matches each unit folder to a unit by its code, takes the newest few
  photos from each, and shows exactly what matched and what did not BEFORE
  anything is uploaded. Folder names in the field are inconsistent, so this is
  an accelerator, never the only route: picking loose files for one unit stays
  exactly as it is.

### 5a. Area of Concern (added 2026-08-08)

The box is seeded from the sheet's `Notes` column, then edited by the owner. What
the owner wrote is the more accurate text, so **it carries forward to the next
cycle rather than being overwritten by the sheet**. When the sheet's notes have
since changed, the unit page says so and offers the sheet's wording in one click.
Silently keeping stale text would be as wrong as silently discarding an edit.

### 6. Newsletter edition

One dated cycle covering many units.

- Footer label (owner types it: "Weekly Newsletter", "Bi-Weekly Newsletter", …)
- Footer date (owner picks it)
- Per unit in the edition: a snapshot of every number and every piece of text
  that was exported, so an old edition always re-renders exactly as it was sent

```
Edition lifecycle
  Draft  ──►  Exported  ──►  Archived
    │            │
    │            └─ re-export any time; the snapshot never changes
    └─ figures refresh on each sheet upload while still Draft
```

## How the newsletter numbers are worked out

Agreed rules, verified against all three sample newsletters:

| Box on the dashboard | Rule                                                                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Quotation References | the ticked quotes' `Quote #`, comma separated                                                                                                |
| Quotation Amount     | sum of `Value Of Invoice` across ticked quotes, rounded to whole LE                                                                          |
| Project Summary      | the distinct `Scope of work` values of the ticked quotes                                                                                     |
| Project Manager      | `Assigned PM` (the one covering the most money, if they differ)                                                                              |
| Start Date           | **earliest** `Planned Start Date` across ticked quotes                                                                                       |
| Finish Date          | **latest** `Max Contractual` across ticked quotes                                                                                            |
| Duration             | calendar days from Start Date to Finish Date                                                                                                 |
| Actual Progress %    | money-weighted: Σ(progress × invoice value) ÷ Σ(invoice value)                                                                               |
| Elapsed Time         | calendar days from Start Date to the edition's footer date, never below 0, never above Duration                                              |
| Status               | expected % = Elapsed ÷ Duration. Progress more than **5 points** above → **AHEAD**; more than 5 below → **BEHIND**; otherwise → **ON TRACK** |
| Area of Concern      | the ticked quotes' `Notes`, split into bullets on commas; editable before export                                                             |
| Stage lit up         | `Not Started`/`Grace` → Quotation · `In Progress`/`Hold` → Construction · `Completed` → Hand Over. Overridable per unit                      |

Worked check against the samples:

```
AH-56   (Ancient Hill 56)   3% done,   0% elapsed  →  +3   ON TRACK   ✓
CY-11   (Cyan 11)          85% done,  48% elapsed  →  +37  AHEAD      ✓
Ph4-Villa-2B (Phase 4 Villa 2B) 90% done, 69% elapsed → +21 AHEAD     ✓
```

## Two dashboard layouts

Chosen automatically per unit, matching the supplied templates:

- **With time schedule** (`CY-11 Newsletter.pptx`, `Ph4-Villa-2B Newsletter.pptx`) —
  month ruler and Gantt bars top right, stage track in the middle, **2 photos**
  along the bottom.
- **No time schedule** (`Photos Template.pptx`) — stage track moves to the top,
  no Gantt, and the whole right side becomes a photo grid that adapts to how
  many photos were added: 2 large, 2×2, or 2×3, **up to six**. No empty boxes.

Both are 16:9, 1600×900, and reproduce the supplied design: grey unit header,
El Gouna logo top right, orange accent, grey footer bar with label and date.

## Screens (v1)

1. **Dashboard** (the 8am screen) — this cycle's units as cards: display name,
   progress %, status pill, whether photos and a schedule are ready, and what's
   still missing. Filter by zone, PM, and readiness.
2. **Upload sheet** — drop the `.xlsm`, see what was read, accepted and
   rejected, and what changed since last time.
3. **Unit page** — the live newsletter preview on the right; on the left the
   quotation tick list, Gantt schedule editor, Area of Concern box, display name
   and stage override.
4. **Photo picker** (on the unit page) — every photo in the unit's OneDrive
   folder as thumbnails, with tick boxes and drag-to-reorder. Shows which slot
   each ticked photo lands in, and how many slots the current layout has.
5. **Export** — from a unit page: JPG, PDF, PPTX. From the dashboard: export
   every ready unit in the edition in one go.
6. **Editions** — list of past cycles; open one to re-render or re-export it
   exactly as it was sent.
7. **Settings (admin)** — people and roles, PM name mapping, unit display names.
8. **Quick** (added 2026-08-07) — the Monday screen: patch per unit, a sent tick
   per cycle, and one click through to a pre-filtered batch export.
9. **What changed** (added 2026-08-08) — against the last cycle's frozen
   snapshots: which units moved, which changed verdict, which gained or lost a
   concern, and which had a date moved under a timeline that was already built.
   The point is to review eleven units rather than a hundred and fifty.
10. **Bulk photo import** (added 2026-08-08) — one parent folder in, a matched
    preview, then upload.

## Template editor (agreed 2026-08-07, revised the same day)

The owner wants to adjust the newsletter's design themselves — font sizes, how tall
or wide the boxes on the left are, and which lines appear — rather than describing
each change and waiting. And to do it in two places: a **master** that applies to
every newsletter, and a **per-unit** change that sticks for that unit from then on.

This is feasible because every measurement, colour and font size lives in one place
(`src/lib/newsletter/layout.ts`), read by the on-screen newsletter and the
PowerPoint alike. Nothing about the defaults changes; the editor stores
**overrides** on top of them.

### Three masters

One per layout, exactly as the owner described:

| Master              | Used when                                          |
| ------------------- | -------------------------------------------------- |
| **Timeline**        | the unit's ticked quotations have a Gantt schedule |
| **Photos only**     | they do not                                        |
| **Before Delivery** | reserved for the Before Delivery programme (v2)    |

Which master a newsletter uses is decided the same way the layout already is — by
whether there is a schedule — so nothing new has to be chosen per unit.

### How a newsletter's design is worked out

Three layers, each overriding the one before, like a set of nested defaults:

```
  the original design (code)
        ↓  overridden by
  the master for this layout (Timeline / Photos only / Before Delivery)
        ↓  overridden by
  this unit's own changes
```

So: edit the master and every newsletter follows immediately. Change one unit and
only that unit changes — and because the change is stored on the unit, like its
name and its ticked quotations, **it is still there next cycle**. Nothing has to be
redone.

A unit's own changes are a single set covering the left column, the text sizes and
the colours. That works for both masters because the left column is identical in the
Timeline and Photos layouts — a fact the design has relied on from the start.

### What can be adjusted

- **The left column's boxes** — for each one (unit header, the PM/references/summary
  block, quotation amount, the date cards, Status, Duration, Area of Concern, Actual
  Progress, Elapsed Time): its height, and its width where the design allows.
- **Text sizes** — individually, or one adjustment that scales them together.
- **Which lines appear** — tick boxes for client name, project manager, quotation
  references, project summary.
- **Colours** — the orange accent, the greys, the Gantt blues.
- **Reset**, always available: one value, one unit, or a whole master.

### What it will NOT do

- **No dragging things around.** Free positioning is where this becomes fragile, and
  where one careless value silently ruins a page a client sees. Numbers in fields,
  with limits.
- **The photos and the Gantt bars stay automatic**, at the owner's request. Their
  sizes are worked out from the space left over and from the schedule; a fixed
  number would fight the logic that makes them fit.

### The rules that keep it safe

1. **Every value is bounded.** A font size cannot go to zero or to fifty; a box
   cannot be taller than the page. Limits come from the layout, not from guesses.
2. **Reset always works**, because the defaults are code and the overrides are data.
   There is no state the owner can reach that a reset does not undo.
3. **Every output reads the same resolved design** — preview, JPG, PDF, PowerPoint.
   What is approved on screen is what is sent.
4. **The design can never change a number.** The editor moves and sizes things; it
   cannot alter a figure, a date or a verdict.
5. **A unit that differs from the master says so.** Its page carries a plain badge
   and a reset, and the Design screen lists every unit with its own changes — so a
   one-off tweak made months ago cannot quietly haunt the programme.

### Honest cost

Every part of the newsletter currently reads the layout file directly. Each has to
receive the resolved design instead — a wide but mechanical change, covered by the
existing geometry tests. The risk is in that rewiring, not in the editor, which is
why it is done in one pass with the tests as the safety net.

## Explicitly OUT of scope for v1

Agreed with the owner. Not "never" — just not version 1.

- **Before Delivery newsletters.** The `Before Delivery Extra works` tab has a
  different shape (no `Duration`, no `Planned Start Date`, no `Max Contractual`;
  instead `EW Expected Finish Date`, `Unit Handover date`, `Contractual Delivery
Date`, and a `Grace` status) and needs a different dashboard layout. The data
  model separates After/Before Delivery from day one so this is an addition, not
  a rewrite.
- **Emailing the newsletters to anyone.** Exports are downloaded; the owner
  sends them.
- **The wider programme system** the owner wants eventually (all PMs, board of
  directors, upper management, everything on one tool). Recorded as a graduation
  trigger in `docs/PROJECT.md`.
- Writing anything back into the Excel sheet or any company system.
- Signing in with a Microsoft account to browse SharePoint properly. v1 pulls
  photos from a pasted OneDrive share link, which needs no IT involvement.
- Any client or non-employee access.
- Automatic scheduling — the owner creates each edition when they want it.
- Mobile app, offline use.

## Preparing the covering email

The tool **composes** the email that carries a newsletter. It does not send it.
Sending is a dev-team item, recorded in `docs/PROJECT.md` — a mail pipeline,
external non-employee recipients and client contact data are all past the scope
guard, and the failure mode (a wrong figure reaching a paying client with nobody
in between) is the reason.

What it prepares, per unit:

| Part    | Where it comes from                                                    |
| ------- | ---------------------------------------------------------------------- |
| Subject | one template shared by every unit, with `{unit}` filled in             |
| Message | one template, with `{client}`, `{unit}`, `{date}` and `{pm}` filled in |
| To      | the unit's `Client Email` addresses                                    |
| Cc      | the project manager's own rule, plus a list copied on every unit       |

Rules that matter:

- **A placeholder with nothing behind it becomes a readable stand-in**, never a
  gap and never the literal `{client}`. "Dear Sir or Madam," is recoverable;
  "Dear ," is the version a client remembers.
- **Anything brace-shaped that the tool does not recognise is reported** on both
  the Email screen and the unit page. `{Client}` and `{client_name}` both look
  right to whoever typed them and would otherwise be sent verbatim.
- **Nobody is on both lines.** An address already in To is dropped from Cc.
- **A malformed address is left out of To and shown as a warning**, so a typo in
  the sheet is visible before it is pasted into Outlook rather than after it
  bounces.
- **A project manager with units but no Cc rule is named** on the Email screen,
  because the quiet failure is a newsletter going out copying nobody.
- The wording and the Cc rules are **admin-only to change** — one edit moves all
  317 units — but **readable by everyone**, because a project manager needs to
  know who is copied on their own units. Enforced in the page, the action and RLS.
- The message can be edited per unit before copying, and that edit is **not
  saved**: storing it would turn one maintained wording into 317 stale drafts.

## Open questions

1. The owner needs to add a **`Client Name`** column to the Power Query before
   the client line can be filled automatically, and a **`Client Email`** column
   before the To line can be. Until then the tool leaves both blank and lets the
   owner type the names per unit (remembered afterwards), separating several
   people with a semicolon.
2. `Zone` has near-duplicates from the query (`Ancient Hill` vs `Ancient hill`,
   `Cyan` vs `Cyan the range`). The tool will treat them case-insensitively and
   flag the pairs on upload for the owner to confirm.
3. OneDrive share links must be set to "anyone with the link"; if Orascom policy
   forbids that, item 5 of _Out of scope_ becomes necessary sooner.
