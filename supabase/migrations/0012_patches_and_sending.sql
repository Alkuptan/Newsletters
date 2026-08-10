-- Patches, and a record of what has actually been sent.
--
-- PATCH: a fixed group a unit belongs to ("Patch 1", "Patch 2"), so the owner can
-- see at a glance which units this week's newsletters are for. Fixed in the sense
-- that it rarely changes — but it IS editable, and `patch_changed_at` records
-- when it last moved. That matters: a unit whose patch changed after the current
-- cycle opened probably did not get a newsletter under its old patch, and the
-- Quick screen uses exactly that to flag it.
--
-- Free text rather than an enum so a third patch never needs a migration; the UI
-- offers the existing values.
alter table public.units
  add column if not exists patch text
  check (patch is null or char_length(trim(patch)) between 1 and 60);

alter table public.units
  add column if not exists patch_changed_at timestamptz;

create index if not exists units_patch_idx on public.units (lower(trim(patch)));

-- Keep `patch_changed_at` honest without trusting the caller to set it.
create or replace function public.touch_patch_changed_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.patch is distinct from old.patch then
    new.patch_changed_at := now();
  end if;
  return new;
end
$$;

create trigger units_patch_changed
  before update on public.units
  for each row execute function public.touch_patch_changed_at();

-- SENT: exporting a file is not the same as sending it to a client. The owner
-- ticks this when the newsletter has actually gone out, and the Quick screen uses
-- it to show what still needs doing this cycle.
alter table public.edition_units
  add column if not exists sent_at timestamptz;

alter table public.edition_units
  add column if not exists sent_by uuid references public.profiles (id);

create index if not exists edition_units_sent_idx
  on public.edition_units (edition_id) where sent_at is not null;
