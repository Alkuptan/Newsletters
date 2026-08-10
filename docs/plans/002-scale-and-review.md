# Plan 002 — surviving 300 units, and reviewing only what moved

Agreed with the owner on 2026-08-08, after the first real test run against the
whole programme (317 units, 152 needing a newsletter).

Everything here came from one of two places: something that breaks at real size,
or something that costs the owner an hour a week.

## A. Reliability at real size

**A1. Shrink every photo automatically as it is added.**
Uploads currently store the camera original (up to 25 MB). Six photos across 152
units is 3–4 GB against a 1 GB allowance, and the batch export decodes every one
of those originals. The newsletter's photo panel is 806 × 548 points, which at
2.5× export scale is about 2000 px — so 2000 px on the longest edge loses
nothing visible. Done in the browser before upload, with no setting to forget.

**A2. Render the batch export in chunks.**
Today all 120 newsletters are mounted off-screen at once. The owner's real batch
is about 60 (one patch), so the target is a comfortable 100. Mount a window of
newsletters at a time, rasterise, unmount, move on.

**A3. Make the Home page counts real.**
It still splits units into ready / needs photos / nothing ticked, counting the
165 finished units among them. It must use the same states as Quick and Units.

## B. Only look at what changed

**B1. A "what changed" view against the last cycle's snapshots.**
The snapshots already exist. Per unit, compare: progress, verdict, start and
finish dates, the Area of Concern, and whether it has just completed.

**B2. Flag a timeline that no longer matches its quotation.**
The Gantt lives in the tool, so when the sheet moves Planned Start or Max
Contractual the timeline silently goes stale — exactly the thing the owner said
they would overlook. Schedules record the dates they were built against, and any
drift is reported.

**B3. Carry the Area of Concern forward, and show divergence.**
What the owner wrote beats the sheet's `Notes`, so it persists. When the sheet
has since changed, say so and offer the new wording in one click.

## C. Photos in bulk

**C1. Import a whole parent folder.**
Structure in the field is `parent / <zone> / <unit code> / many photos`. Match
each unit folder to a unit by code, take the newest few per unit, and show the
matched and unmatched lists BEFORE uploading anything. Naming is inconsistent in
practice, so the preview is the feature, not a formality.

**C2. Leave the loose-files route alone.**
Per-unit "Choose photos" stays exactly as it is, for every folder the matcher
cannot make sense of.

## D. Knowing what still needs doing

**D1. A per-unit schedule decision.**
`photos_only` means "this unit is meant to have no timeline" — otherwise "no
schedule" and "nobody has built one yet" look identical across 152 units.

**D2. Filters for it.** Has a timeline · needs one · photos only · timeline out
of date.

**D3. Next / Previous unit**, following the list's current order and filters, so
working through a patch does not mean 60 round trips through the list.

## Schema

One additive migration (`0013`):

- `units.schedule_plan` — `photos_only` | `timeline` | null (not decided)
- `gantt_schedules.source_start_date`, `source_finish_date` — the quotation
  dates the schedule was last built against. Null on existing rows means
  "unknown", which is never reported as drift.

## Out of this batch

Before Delivery, emailing, and reading SharePoint directly — unchanged.
