-- Unit Newsletter Studio: every table the tool needs, each with RLS in this
-- same file. See docs/SPEC.md ("Things") for what each one means in business
-- terms, and the role matrix these policies implement.
--
-- The shape follows one rule: figures that come from the follow-up sheet are
-- REPLACED on every upload, and anything the owner typed or ticked is kept.
-- That is why the tool-owned columns (include_in_newsletter, display_name,
-- client_name, stage_override, the Gantt tables and the photo tables) live
-- alongside the imported ones rather than being wiped with them.

-- ── Enums ───────────────────────────────────────────────────────────────────

-- After Delivery is version 1; Before Delivery uses different sheet columns and
-- a different dashboard, and is separated from day one so it is an addition
-- later rather than a rewrite (docs/SPEC.md, out of scope).
create type public.delivery_kind as enum ('after_delivery', 'before_delivery');

-- The five icons on the stage track, in order.
create type public.project_stage as enum (
  'initiation',
  'design',
  'quotation',
  'construction',
  'handover'
);

-- A normal blue Gantt bar, or an orange one for things that are not work —
-- "Pending Neighbour consent" on the Phase 4 Villa 2B sample.
create type public.gantt_tone as enum ('normal', 'attention');

create type public.edition_status as enum ('draft', 'exported', 'archived');

-- ── Who a project manager is, in the sheet's words ──────────────────────────
-- The sheet identifies PMs by typed name ("Mariam Sobhy"), not by login. This
-- maps a signed-in person to the name(s) they appear under, so a PM sees their
-- own units. A table rather than a column on profiles because one person can
-- legitimately appear under more than one spelling.

create table public.pm_aliases (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  pm_name text not null check (char_length(trim(pm_name)) between 1 and 200),
  created_at timestamptz not null default now()
);

-- One person per spelling: two people claiming "Mariam Sobhy" would each see the
-- other's units.
create unique index pm_aliases_name_key on public.pm_aliases (lower(trim(pm_name)));
create index pm_aliases_profile_idx on public.pm_aliases (profile_id);

alter table public.pm_aliases enable row level security;

-- Everyone signed in may read the mapping: the helpers below and the UI both
-- need it. Only admins may change who is who.
create policy pm_aliases_select on public.pm_aliases
  for select using (auth.uid() is not null);
create policy pm_aliases_admin_write on public.pm_aliases
  for all using (public.is_admin()) with check (public.is_admin());

-- ── One row per upload of the follow-up sheet ───────────────────────────────

create table public.sheet_uploads (
  id uuid primary key default gen_random_uuid(),
  file_name text not null check (char_length(file_name) between 1 and 400),
  sheet_name text not null,
  delivery public.delivery_kind not null default 'after_delivery',
  rows_read integer not null default 0 check (rows_read >= 0),
  rows_accepted integer not null default 0 check (rows_accepted >= 0),
  -- Why each rejected row was rejected, in words the owner can act on.
  rejected jsonb not null default '[]'::jsonb,
  -- Zone spellings that differ only by case, for the owner to confirm.
  zone_aliases jsonb not null default '[]'::jsonb,
  uploaded_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create index sheet_uploads_created_at_idx on public.sheet_uploads (created_at desc);

alter table public.sheet_uploads enable row level security;

-- Uploading is an admin job, and so is reviewing what an upload did.
create policy sheet_uploads_admin_select on public.sheet_uploads
  for select using (public.is_admin());
create policy sheet_uploads_admin_insert on public.sheet_uploads
  for insert with check (public.is_admin() and uploaded_by = auth.uid());

-- ── Units: the subject of one newsletter ───────────────────────────────────

create table public.units (
  id uuid primary key default gen_random_uuid(),
  -- From the sheet.
  unit_code text not null check (char_length(unit_code) between 1 and 100),
  zone text not null default '',
  delivery public.delivery_kind not null default 'after_delivery',
  assigned_pm text,
  -- Typed once in the tool and kept across uploads.
  display_name text not null check (char_length(display_name) between 1 and 200),
  client_name text check (client_name is null or char_length(client_name) <= 300),
  onedrive_folder_url text check (
    onedrive_folder_url is null or char_length(onedrive_folder_url) <= 2000
  ),
  -- Overrides the stage worked out from the quotations' Project Status.
  stage_override public.project_stage,
  -- Overrides the Area of Concern bullets derived from the sheet's Notes.
  -- An empty array is meaningful: the owner cleared the box.
  concerns_override jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A unit code identifies one unit per programme. Case-insensitive because the
-- query emits "AH-56" and "ah-56" for the same villa.
create unique index units_code_key on public.units (lower(trim(unit_code)), delivery);
create index units_zone_idx on public.units (lower(trim(zone)));
create index units_assigned_pm_idx on public.units (lower(trim(assigned_pm)));

create trigger units_updated_at
  before update on public.units
  for each row execute function public.set_updated_at();

-- ── Access helpers ─────────────────────────────────────────────────────────
-- SECURITY DEFINER so a policy can read units and pm_aliases without
-- recursing through their own RLS. STABLE so Postgres caches per query.

-- Is this unit one of the caller's, as a project manager?
create or replace function public.is_my_unit(p_unit_id uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1
    from units u
    join pm_aliases a on lower(trim(a.pm_name)) = lower(trim(u.assigned_pm))
    where u.id = p_unit_id
      and a.profile_id = auth.uid()
  )
$$;

-- Who may SEE a unit: admins and viewers see everything; a project manager sees
-- only their own. Mirrors docs/SPEC.md's role matrix, and the TS helpers in
-- src/features/units/permissions.ts must say the same thing.
create or replace function public.can_read_unit(p_unit_id uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select public.is_admin()
      or public.current_app_role() = 'member'
      or public.is_my_unit(p_unit_id)
$$;

-- Who may CHANGE a unit: admins, and a project manager on their own units.
-- Deliberately excludes 'member' — the read-only role.
create or replace function public.can_write_unit(p_unit_id uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select public.is_admin() or public.is_my_unit(p_unit_id)
$$;

alter table public.units enable row level security;

create policy units_select on public.units
  for select using (public.can_read_unit(id));
-- Units appear by being imported from the sheet, which is admin-only.
create policy units_admin_insert on public.units
  for insert with check (public.is_admin());
create policy units_update on public.units
  for update using (public.can_write_unit(id)) with check (public.can_write_unit(id));
create policy units_admin_delete on public.units
  for delete using (public.is_admin());

-- ── Quotations ─────────────────────────────────────────────────────────────

create table public.quotations (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units (id) on delete cascade,
  -- From the sheet, replaced on every upload.
  quote_number text not null check (char_length(quote_number) between 1 and 100),
  invoice_number text,
  invoice_value numeric(16, 2) not null default 0,
  scope_of_work text not null default '',
  -- The sheet's `Progress % Current`, stored as the fraction it really is.
  progress numeric(5, 4) not null default 0 check (progress between 0 and 1),
  -- Calendar days, never timestamps: these are whole days on a calendar and
  -- storing them with a time zone shifts them (DECISIONS 0003).
  planned_start_date date,
  max_contractual_date date,
  project_status text not null default '',
  notes text,
  -- The sheet's own `Newsletter` column said "Ready".
  marked_ready_in_sheet boolean not null default false,
  -- Ticked in the tool and REMEMBERED across uploads — the owner's choice.
  include_in_newsletter boolean not null default false,
  -- Which upload last carried this quotation; rows absent from a newer upload
  -- can be spotted without deleting anything.
  last_seen_upload_id uuid references public.sheet_uploads (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index quotations_unit_quote_key
  on public.quotations (unit_id, lower(trim(quote_number)));
create index quotations_unit_idx on public.quotations (unit_id);
create index quotations_included_idx on public.quotations (unit_id) where include_in_newsletter;

create trigger quotations_updated_at
  before update on public.quotations
  for each row execute function public.set_updated_at();

alter table public.quotations enable row level security;

create policy quotations_select on public.quotations
  for select using (public.can_read_unit(unit_id));
create policy quotations_admin_insert on public.quotations
  for insert with check (public.is_admin());
-- A project manager ticks which of their own quotations count.
create policy quotations_update on public.quotations
  for update using (public.can_write_unit(unit_id))
  with check (public.can_write_unit(unit_id));
create policy quotations_admin_delete on public.quotations
  for delete using (public.is_admin());

-- ── The Gantt schedule, held in the tool ───────────────────────────────────
-- Built by hand the first time a quotation needs bars, then saved, recalled
-- every cycle and editable — the owner's explicit choice (docs/SPEC.md).

create table public.gantt_schedules (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null unique references public.quotations (id) on delete cascade,
  -- The vertical band's text, e.g. "Unit Extension".
  row_label text not null default '' check (char_length(row_label) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger gantt_schedules_updated_at
  before update on public.gantt_schedules
  for each row execute function public.set_updated_at();

-- Which unit a schedule belongs to, for the policies below. Kept as a function
-- so the join lives in one place.
create or replace function public.unit_of_quotation(p_quotation_id uuid)
returns uuid
language sql security definer stable
set search_path = public
as $$
  select unit_id from quotations where id = p_quotation_id
$$;

alter table public.gantt_schedules enable row level security;

create policy gantt_schedules_select on public.gantt_schedules
  for select using (public.can_read_unit(public.unit_of_quotation(quotation_id)));
create policy gantt_schedules_write on public.gantt_schedules
  for all using (public.can_write_unit(public.unit_of_quotation(quotation_id)))
  with check (public.can_write_unit(public.unit_of_quotation(quotation_id)));

create table public.gantt_activities (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.gantt_schedules (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 300),
  start_date date not null,
  finish_date date not null,
  tone public.gantt_tone not null default 'normal',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A bar cannot end before it starts; the chart would draw backwards.
  constraint gantt_activities_dates_ordered check (finish_date >= start_date)
);

create index gantt_activities_schedule_idx
  on public.gantt_activities (schedule_id, sort_order);

create trigger gantt_activities_updated_at
  before update on public.gantt_activities
  for each row execute function public.set_updated_at();

create or replace function public.unit_of_schedule(p_schedule_id uuid)
returns uuid
language sql security definer stable
set search_path = public
as $$
  select q.unit_id
  from gantt_schedules s
  join quotations q on q.id = s.quotation_id
  where s.id = p_schedule_id
$$;

alter table public.gantt_activities enable row level security;

create policy gantt_activities_select on public.gantt_activities
  for select using (public.can_read_unit(public.unit_of_schedule(schedule_id)));
create policy gantt_activities_write on public.gantt_activities
  for all using (public.can_write_unit(public.unit_of_schedule(schedule_id)))
  with check (public.can_write_unit(public.unit_of_schedule(schedule_id)));

-- ── Photos ─────────────────────────────────────────────────────────────────
-- Listed from the unit's OneDrive folder; the owner ticks which ones go on the
-- dashboard and drags them into order. `is_selected` is the tick.
--
-- `source_url` is the photo in the OneDrive folder. It is NOT what an <img>
-- points at: both exporters have to read the pixels, which the browser forbids
-- across origins, so photos are served through this tool's own address
-- (DECISIONS 0007).

create table public.unit_photos (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units (id) on delete cascade,
  source_url text not null check (char_length(source_url) between 1 and 2000),
  description text not null default '' check (char_length(description) <= 500),
  taken_at timestamptz,
  is_selected boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The same photo must not be listed twice for one unit when the folder is
-- re-read, or a re-read would silently duplicate the owner's ticks.
create unique index unit_photos_source_key on public.unit_photos (unit_id, source_url);
create index unit_photos_selected_idx
  on public.unit_photos (unit_id, sort_order) where is_selected;

create trigger unit_photos_updated_at
  before update on public.unit_photos
  for each row execute function public.set_updated_at();

alter table public.unit_photos enable row level security;

create policy unit_photos_select on public.unit_photos
  for select using (public.can_read_unit(unit_id));
create policy unit_photos_write on public.unit_photos
  for all using (public.can_write_unit(unit_id))
  with check (public.can_write_unit(unit_id));

-- ── Editions: one dated cycle covering many units ──────────────────────────

create table public.editions (
  id uuid primary key default gen_random_uuid(),
  -- The owner's own wording: "Weekly Newsletter", "Bi-Weekly Newsletter", …
  footer_label text not null default 'Bi-Weekly Newsletter'
    check (char_length(footer_label) between 1 and 120),
  -- The date printed in the footer. Elapsed time is measured to THIS, never to
  -- "now", so reopening an old edition re-renders the same numbers.
  footer_date date not null,
  status public.edition_status not null default 'draft',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index editions_footer_date_idx on public.editions (footer_date desc);

create trigger editions_updated_at
  before update on public.editions
  for each row execute function public.set_updated_at();

alter table public.editions enable row level security;

-- Everyone signed in needs the label and date to render a newsletter at all.
create policy editions_select on public.editions
  for select using (auth.uid() is not null);
create policy editions_admin_insert on public.editions
  for insert with check (public.is_admin() and created_by = auth.uid());
create policy editions_admin_update on public.editions
  for update using (public.is_admin()) with check (public.is_admin());
create policy editions_admin_delete on public.editions
  for delete using (public.is_admin());

-- One unit's newsletter within an edition, plus the snapshot of exactly what
-- was exported — so an old edition always re-renders as it was sent, even after
-- the sheet has moved on.
create table public.edition_units (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions (id) on delete cascade,
  unit_id uuid not null references public.units (id) on delete cascade,
  snapshot jsonb,
  exported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index edition_units_key on public.edition_units (edition_id, unit_id);
create index edition_units_edition_idx on public.edition_units (edition_id);

create trigger edition_units_updated_at
  before update on public.edition_units
  for each row execute function public.set_updated_at();

alter table public.edition_units enable row level security;

create policy edition_units_select on public.edition_units
  for select using (public.can_read_unit(unit_id));
-- A project manager may record the export of their own unit; only admins add or
-- remove units from an edition.
create policy edition_units_admin_insert on public.edition_units
  for insert with check (public.is_admin());
create policy edition_units_update on public.edition_units
  for update using (public.can_write_unit(unit_id))
  with check (public.can_write_unit(unit_id));
create policy edition_units_admin_delete on public.edition_units
  for delete using (public.is_admin());
