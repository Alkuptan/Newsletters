-- The three master designs, and a unit's own changes on top of one.
--
-- The design a newsletter uses is worked out in three layers (docs/SPEC.md,
-- "Template editor"):
--
--     the original design (code, src/lib/newsletter/layout.ts)
--       ↓ overridden by
--     the master for this layout  (this table)
--       ↓ overridden by
--     this unit's own changes     (units.design_overrides)
--
-- Only DIFFERENCES are stored. That is what makes "reset" mean simply "forget the
-- override" — there is no state a reset cannot undo, because the defaults live in
-- code and can never be edited away.
--
-- Overrides are jsonb rather than columns on purpose: they are a bag of optional
-- design values that will grow as the editor does, and every one of them is
-- clamped to a sane range when read (`resolveTheme`), so a malformed value cannot
-- produce an unsendable page. Postgres is not the right place to express "a font
-- size between 5 and 60, or absent".

create type public.template_kind as enum ('timeline', 'photos', 'before_delivery');

create table public.newsletter_templates (
  kind public.template_kind primary key,
  -- {} means "exactly the original design", which is where all three start.
  overrides jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger newsletter_templates_updated_at
  before update on public.newsletter_templates
  for each row execute function public.set_updated_at();

alter table public.newsletter_templates enable row level security;

-- Everyone signed in must READ the masters — they are needed to render any
-- newsletter at all. Only admins change them, because one edit moves every
-- newsletter in the programme.
create policy newsletter_templates_select on public.newsletter_templates
  for select using (auth.uid() is not null);
create policy newsletter_templates_admin_update on public.newsletter_templates
  for update using (public.is_admin()) with check (public.is_admin());
create policy newsletter_templates_admin_insert on public.newsletter_templates
  for insert with check (public.is_admin());

-- All three exist from the start, so the editor never has to create one and the
-- read path never has to cope with a missing row.
insert into public.newsletter_templates (kind, overrides)
values
  ('timeline', '{}'::jsonb),
  ('photos', '{}'::jsonb),
  ('before_delivery', '{}'::jsonb)
on conflict (kind) do nothing;

-- A unit's own design changes, kept alongside its other typed-in values (display
-- name, client, stage, Area of Concern) — so like those, they survive every sheet
-- upload and are still there next cycle. Null means "follow the master".
alter table public.units
  add column if not exists design_overrides jsonb;
