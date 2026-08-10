-- 0013 — is this unit meant to have a timeline, and is the one it has still right?
--
-- Two separate problems, both invisible until you are looking at 152 units.
--
-- 1. "No schedule" and "meant to have no schedule" look identical. Across the
--    whole programme that means the owner cannot tell the units still waiting
--    for work from the ones deliberately left as photos only. `schedule_plan`
--    records the decision; null means nobody has decided yet.
--
-- 2. The Gantt lives in THIS tool, not in the sheet. So when the Power Query
--    moves a Planned Start or Max Contractual date, the timeline built against
--    the old dates keeps rendering as if nothing happened. Recording the dates
--    a schedule was built against turns that into something the tool can
--    report rather than something the owner has to notice.
--
-- Both columns are additive and nullable, so every existing row stays valid.
-- RLS on `units` and `gantt_schedules` is unchanged and already in force
-- (migration 0006) — adding a column does not add a row-level boundary.

alter table public.units
  add column if not exists schedule_plan text;

-- Free text would drift into "photos only", "Photos Only", "photo". Three known
-- values, checked here so the database is the one that says no.
alter table public.units
  drop constraint if exists units_schedule_plan_known;
alter table public.units
  add constraint units_schedule_plan_known
  check (schedule_plan is null or schedule_plan in ('photos_only', 'timeline'));

comment on column public.units.schedule_plan is
  'photos_only = deliberately has no timeline; timeline = should have one; null = not decided yet.';

-- Only the undecided and the timeline units are ever scanned for missing work,
-- so that is what the index covers.
create index if not exists units_schedule_plan_idx
  on public.units (schedule_plan)
  where schedule_plan is distinct from 'photos_only';

alter table public.gantt_schedules
  add column if not exists source_start_date date;
alter table public.gantt_schedules
  add column if not exists source_finish_date date;

comment on column public.gantt_schedules.source_start_date is
  'The quotation Planned Start this schedule was last built against. Null = built before this was recorded, so drift is unknown rather than absent.';
comment on column public.gantt_schedules.source_finish_date is
  'The quotation Max Contractual this schedule was last built against. Null = unknown, never reported as drift.';
