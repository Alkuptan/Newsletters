# DECISIONS.md — ADR log

> One entry per non-obvious choice: every added dependency, every deviation
> from RULES.md, every "we picked A over B". Format: What / Why / Forecloses.

## 0001 — Scaffolded from internal-tool-template v1

- **What:** Project created from the org template (Next.js + Supabase RLS-first
  - Cloudflare Workers, feature-slice architecture).
- **Why:** Paved road — same stack and patterns as the org's flagship internal
  tools, so the dev team can take over without a rewrite.
- **Forecloses:** Swapping core stack pieces (ORM, deploy target, UI kit)
  without a dev-team decision.

## 0002 — SheetJS (`xlsx`) installed from the vendor CDN, not npm

- **What:** `pnpm add https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`, and
  the follow-up sheet is parsed in the BROWSER on the upload page, never on the
  server.
- **Why:** The tool's whole input is a 1.5 MB `.xlsm` produced by a Power Query,
  and nothing else installed can read it. The npm-registry copy of `xlsx` is
  abandoned at 0.18.5 and carries CVE-2023-30533 (prototype pollution) and
  CVE-2024-22363 — unacceptable in a parser fed user-supplied files. SheetJS's
  own CDN is the vendor's documented install path and ships the patched 0.20.x.
  Parsing client-side also keeps the workbook off the wire and keeps the parser
  out of the Worker bundle, which has a 3 MiB budget (RULES.md free-tier facts).
- **Forecloses:** Offline/air-gapped `pnpm install` (the tarball host must be
  reachable). Server-side parsing of uploaded workbooks — if that is ever needed,
  the Worker bundle cost has to be measured first. The dev team may prefer to
  vendor the tarball into an internal registry at handover.

## 0003 — Sheet dates are calendar dates, never timestamps

- **What:** A `toIsoDate`/`fromIsoDate`/`startOfLocalDay` trio in
  `src/lib/newsletter/dates.ts`, used for every date that comes from the sheet
  or goes onto a newsletter. `Date.prototype.toISOString` is banned for these.
- **Why:** SheetJS returns a date cell as LOCAL midnight. Egypt runs ahead of
  UTC, so `toISOString()` turned a start date of 29 April into 28 April — caught
  by a test, and it would have shifted every date on every newsletter by a day
  and knocked the durations out by one.
- **Forecloses:** Storing these as `timestamptz`. They are calendar days and the
  migration uses `date`.

## 0005 — Exports are built in the browser: pptxgenjs, modern-screenshot, jspdf

- **What:** Three client-side dependencies, each loaded with a dynamic
  `import()` on first click: `pptxgenjs` (the editable PowerPoint slide),
  `modern-screenshot` (rasterise the rendered newsletter), `jspdf` (wrap that
  bitmap in a one-page PDF at exactly 13.333 × 7.5in).
- **Why:** The spec promises JPG, PDF and an **editable** PowerPoint. Rendering
  any of them server-side would need a headless browser, which the Cloudflare
  Workers free tier cannot run, and would blow the 3 MiB Worker bundle budget.
  Doing it in the browser also guarantees the export matches the preview the
  owner just approved, because it is rasterised from that very element.
  `modern-screenshot` over the older `html-to-image`: same API, still maintained.
- **Forecloses:** Exporting from the server, e.g. a scheduled job that mails out
  newsletters — that would need the Cloudflare Browser Rendering paid add-on and
  is a graduation item. Also means exports need a reasonably modern browser.

## 0006 — Gantt geometry lives in one place, not in the React component

- **What:** `layoutGantt` in `src/lib/newsletter/gantt-geometry.ts` computes every
  bar, month column and label box. Both `components/gantt.tsx` and the PowerPoint
  exporter call it. `src/lib/newsletter/layout.ts` holds the shared geometry and
  palette, with `pxToInches`/`pxToPt` for the exporter.
- **Why:** The preview and the exported slide have to be the same picture. With
  the positioning inside the React component, the exporter would have needed its
  own copy of the maths and the two would have drifted — the kind of bug nobody
  notices until a client receives a slide that disagrees with what was approved.
- **Forecloses:** Letting either output "just tweak" a position locally. A layout
  change means changing the shared constants, which moves all three outputs.

## 0014 — Photos are browsed off disk, not uploaded in bulk

- **What:** The parent photo folder is chosen once via the File System Access
  API and the handle kept in IndexedDB. Opening a unit walks that handle to the
  unit's own sub-folder, lists only its files, draws thumbnails from disk, and
  uploads only what is ticked. The bulk "import a whole parent folder" screen is
  deleted.
- **Why:** The old screen read the ENTIRE tree into the browser. The owner's
  real parent folder holds roughly 410,000 files, so it was not slow — it could
  not work at all, and no amount of tuning changes that. Reading one folder on
  demand is bounded by the size of one unit's folder, which is a few hundred
  files at worst.
- **Forecloses:** Firefox and Safari, which do not implement the API — the
  screen simply does not appear there, and the per-unit file picker remains the
  fallback. Also forecloses doing this from a phone.

## 0013 — Dev-only pages are excluded from production builds

- **What:** `next.config.ts` sets `pageExtensions` so a page named
  `page.dev.tsx` is a route in development and does not exist in a production
  build. `/newsletter-preview` was renamed accordingly.
- **Why:** The Worker has a hard 3 MiB gzipped ceiling. That one page and its
  four fixture newsletters were **107 KiB gzipped** — on its own the difference
  between 3057 KiB (deploys) and 3164 KiB (rejected). A page that returns 404
  in production should not be shipped at all. Returning `notFound()` was not
  enough: the code was still bundled.
- **Forecloses:** Nothing in production. Any future dev-only screen must use
  the same `.dev.tsx` suffix or it will ship.

## 0012 — Next pinned to a version the Cloudflare adapter supports

- **What:** Next 16.2.10 → 16.2.12, `@opennextjs/cloudflare` → 1.20.2.
- **Why:** The adapter declares `next: ">=15.5.21 <16 || >=16.2.11"`. 16.2.10
  falls in the excluded gap — an unsupported combination that nothing warns
  about until the deployed Worker misbehaves.
- **Forecloses:** Upgrading Next without checking the adapter's peer range
  first. `npm view @opennextjs/cloudflare@latest peerDependencies` is the check.

## 0011 — Folder matching refuses to guess

- **What:** A photo folder matches a unit on a normalised key (case, spaces,
  separators, zero padding and a trailing "(final)" all ignored). Anything that
  does not match exactly one unit is reported as unmatched.
- **Why:** Fuzzy or nearest-match guessing would file a villa's photos under a
  neighbouring villa — "AH-5" and "AH-56" are different houses — and that error
  reaches a client with the wrong pictures on it. Three folders needing a look
  is a far cheaper failure than one wrong newsletter.
- **Forecloses:** Ever silently importing a folder the tool is unsure about. If
  matching needs to be smarter, it must still end in exactly one unit or none.

## 0010 — Schedules record the dates they were built against

- **What:** `gantt_schedules.source_start_date` / `source_finish_date` store the
  quotation dates current when the schedule was last saved.
- **Why:** The Gantt lives in this tool and the dates live in the sheet, so a
  Power Query refresh can move a Max Contractual date under a finished timeline
  with nothing to show for it. Comparing timestamps would be fragile; storing
  what it was built against makes the question exact. Null on rows predating
  this means "unknown", never "stale" — otherwise the whole programme would be
  flagged at once.
- **Forecloses:** Treating a schedule as always current. Anything that writes a
  schedule must set these, or drift detection quietly stops working.

## 0009 — Photos uploaded to an empty unit tick themselves

- **What:** The first upload to a unit with nothing chosen marks up to six
  photos as selected. Later uploads arrive unticked.
- **Why:** A unit shows no photos until something is ticked, so an upload that
  ticks nothing leaves the unit still reading "needs photos" — the same trap as
  new quotations defaulting to unticked, which produced 317 empty newsletters.
  Once the owner HAS chosen, the tool must not overrule them, hence the "only
  when nothing is chosen" condition.
- **Forecloses:** Treating "unticked" as a deliberate rejection on a fresh unit.
  If bulk import ever needs to add photos without showing them, it must set the
  flag explicitly rather than rely on the insert default.

## 0008 — fflate, for one file per unit

- **What:** Added `fflate` (~30 KB, browser-only, dynamically imported) to zip
  the per-unit exports.
- **Why:** The owner asked for a separate PDF and image per unit, named
  "Ancient Hill 56 newsletter". A browser blocks a page that fires dozens of
  downloads, so individually-named files can only be delivered inside one
  archive. Compression is level 0 — JPEG and PDF are already compressed, so
  squeezing again costs seconds and saves nothing.
- **Forecloses:** Nothing on the server: like every other exporter it is
  imported dynamically in the browser and never reaches the Worker bundle.

## 0007 — Newsletter photos must be same-origin

- **What:** Photo URLs on the view model have to be served from our own origin.
  Both exporters read the pixels — the JPG through a canvas, the PowerPoint by
  cover-cropping each photo on a canvas before embedding it.
- **Why:** A canvas that has drawn a cross-origin image cannot be read back, so a
  raw OneDrive URL breaks both exports. Doing the cover-crop ourselves also fixes
  a real mismatch: PowerPoint's own fit-to-frame chose a different crop from CSS
  `object-fit: cover`, so the slide and the preview showed different framing.
- **Forecloses:** Pointing an `<img>` straight at a OneDrive share link. Photos
  need to arrive through a route on our own origin, which is a small proxy to be
  built with the photo picker (batch two).

## 0004 — Three effective roles from three enum values

- **What:** `app_role` gains `project_manager`; the template's existing `member`
  is presented in the UI as "Viewer (read-only)". No fourth enum value.
- **Why:** The spec's matrix needs admin, project manager and a read-only role
  for the board and upper management. `member` is already the value the
  new-user trigger hands out and already means "no privileges", which is exactly
  what a viewer is. Adding a separate `viewer` value would leave `member` as a
  dead fourth role and put the tool at the scope guard's role ceiling for no gain.
- **Forecloses:** Giving `member` any write capability later without first
  splitting the two apart.
