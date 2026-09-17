-- 0019 — the owner's own progress figure, per unit
--
-- The newsletter's progress comes from the sheet: money-weighted across each
-- ticked quotation's `Progress` column. That is the right default and it is
-- regularly not what the owner would tell the client — the sheet lags the site,
-- a row can read 100% with a snag list still open, and one badly-kept quotation
-- drags a whole unit's figure down.
--
-- So the owner can write their own, and choose which one the newsletter shows.
-- NULL means follow the sheet, which is what every existing row does.
--
-- Deliberately the same shape as `concerns_override` from 0009: the sheet
-- supplies a value, the owner may take charge of it, and both stay visible so a
-- figure that has drifted from the sheet is noticed rather than quietly kept.
--
-- Stored as a PERCENT (0–100), not the 0–1 fraction `quotations.progress` uses.
-- The owner types what the newsletter prints, and a unit reading "0.62" where
-- 62 was meant would be a silent factor-of-a-hundred error on a client's page.
-- Two decimals because the computed figure is rounded for display but not here.
--
-- Additive and nullable, so every existing row stays valid. RLS unchanged and
-- already in force on `units` from 0006 (`can_read_unit` / `can_write_unit`).

alter table public.units
  add column poc_override numeric(5, 2)
    check (poc_override is null or (poc_override >= 0 and poc_override <= 100));

comment on column public.units.poc_override is
  'Progress percent the owner wrote, shown instead of the sheet''s money-weighted figure. NULL follows the sheet.';
