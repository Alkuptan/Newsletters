-- Match a project manager's name even if the spelling picks up extra spacing.
--
-- 0006 compared `lower(trim(name))`, which handles leading/trailing spaces but
-- not doubled internal ones: "Mariam  Sobhy" would not match "Mariam Sobhy". The
-- real sheet is clean today, but Assigned PM is typed by hand in a spreadsheet,
-- and the failure mode is the worst kind — a project manager silently loses
-- sight of their own units, with no error to notice.
--
-- Fixed forward rather than by editing 0006 (RULES.md rule 3). The matching TS
-- helper is `isMyUnit` in src/features/units/permissions.ts; the two must agree.

-- The unique index has to collapse whitespace the same way, or two aliases that
-- now compare equal could both be stored.
drop index if exists public.pm_aliases_name_key;
create unique index pm_aliases_name_key
  on public.pm_aliases (lower(regexp_replace(trim(pm_name), '\s+', ' ', 'g')));

create or replace function public.is_my_unit(p_unit_id uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1
    from units u
    join pm_aliases a
      on lower(regexp_replace(trim(a.pm_name), '\s+', ' ', 'g'))
       = lower(regexp_replace(trim(u.assigned_pm), '\s+', ' ', 'g'))
    where u.id = p_unit_id
      and a.profile_id = auth.uid()
      -- An empty Assigned PM must never match an empty alias, which would hand
      -- every unassigned unit to whoever had a blank alias row.
      and coalesce(trim(u.assigned_pm), '') <> ''
      and coalesce(trim(a.pm_name), '') <> ''
  )
$$;
