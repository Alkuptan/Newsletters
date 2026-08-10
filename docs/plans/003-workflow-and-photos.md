# Plan 003 — one work screen, photos on demand, a usable design page

Agreed with the owner on 2026-08-09, from observations after the tool went live.

## A. One work screen

Quick and Units do the same job from two angles, so they become one screen at
`/units` with a **table / cards switch**, remembered in the address bar. `/quick`
redirects there.

- The table carries everything both screens showed: patch, state, progress,
  status, project manager, photos, timeline, **last released**, **last sent**,
  and the sent tick.
- The cards gain the patch control, the sent tick and the two dates.
- Both are sortable by every column shown, including the two new dates.

**Units at 0% are never chased.** No prompt to send, never counted as
outstanding, never overdue. Work that has not started has nothing to report;
listing it as owed is noise. It can still be exported deliberately.

## B. Newsletter design controls

- **Gaps between the left-hand boxes** become adjustable, like the box heights
  already are.
- **The timeline gets a real ceiling.** Beyond it, the bars and their labels
  shrink instead of the photos. Today a long schedule squeezes the photos to
  nothing, which is the wrong thing to sacrifice.
- **The logo can be replaced**, its proportions are corrected, and the gap
  beneath it is adjustable.

## C. Photos on demand — replacing bulk import

The current "point at a parent folder" screen reads the **entire** tree into the
browser. The owner's real parent folder holds ~410,000 files. That is not slow,
it is impossible, and no amount of tuning fixes it.

Replaced with: **choose the parent folder once**, and the tool keeps a handle to
it. Opening a unit lists only that unit's own folder, shows thumbnails read
straight from disk, and uploads only what is ticked. Nothing else is ever read.

- Uses the File System Access API — Chrome and Edge, which is what the office
  uses. The handle is remembered between visits; the browser asks permission
  again after a restart, which is one click.
- The bulk import screen is removed entirely, so there is one way to add photos.
- The existing per-unit "Choose photos" (loose files) stays as the fallback for
  folders the matcher cannot make sense of.

## D. Design page

- **The preview stays in view** while the settings scroll — on the design page
  and on a unit's page.
- **Reset per setting**, plus reset a whole template.
- **Copy a look** from one template to another, or one unit to another.
- **Grouped, collapsible, searchable** settings instead of one long list.

## Order

A, then C (the largest structural change), then B, then D. Each is verified
against the real 317-unit programme before the next starts.
