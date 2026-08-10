-- Notice when a quotation disappears from the follow-up sheet.
--
-- THE PROBLEM THIS FIXES: an upload only ever added and updated. A quotation
-- deleted or voided in the Power Query stayed in the tool — still ticked, still
-- counted in the Quotation Amount — so a newsletter could show a client a quote
-- that no longer exists, with its money in the total. `last_seen_upload_id` was
-- already recorded but nothing ever read it.
--
-- Rather than delete the row (which would throw away its schedule, its photos and
-- the owner's tick, in case the disappearance was a mistake), the row is FLAGGED
-- and untied from the newsletter. The owner sees why, and can put it back.

alter table public.quotations
  add column if not exists missing_from_sheet boolean not null default false;

-- Which upload noticed it had gone — so "missing since last Monday" is answerable.
alter table public.quotations
  add column if not exists missing_since_upload_id uuid
  references public.sheet_uploads (id) on delete set null;

create index if not exists quotations_missing_idx
  on public.quotations (unit_id) where missing_from_sheet;
