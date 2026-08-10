-- 0015 — preparing the covering email: the wording, and who is copied in
--
-- The tool does NOT send mail. It composes the message — subject, body, To and
-- CC — and a person presses Send in Outlook. Sending is a dev-team item, and the
-- reasons are written down in docs/PROJECT.md under "Sending the newsletter email
-- to clients". Nothing here talks to a mail server.
--
-- Two tables, because the two things change at different rates and by different
-- people:
--
-- 1. `mail_settings` — one row, holding the wording every unit shares and the
--    people copied on every unit. Changing it moves all 317 newsletters, so it is
--    admin-only to write, like the design masters in 0010.
--
-- 2. `pm_mail_routing` — per project manager, the addresses to copy for THAT
--    manager's units: usually themself and their own manager. Keyed by the PM
--    name as the SHEET spells it, not by a profile id, because most PMs in the
--    sheet have no account in this tool and still need their units routed.
--
-- Why not extend `pm_aliases`: that table exists to decide which units a signed-in
-- person may see, so a row means "this human owns these units". A PM who never
-- signs in must not get a row there — it would reference a profile that should
-- not exist — but their units still need a CC list. Different question, different
-- table.

create table public.mail_settings (
  -- Single-row table: the CHECK pins the key to true, so a second row cannot
  -- exist and every read is unambiguous without an ORDER BY.
  id boolean primary key default true check (id),
  /*
    Placeholders are filled per unit. The set the tool understands is
    {client}, {unit}, {date} and {pm} — see src/lib/newsletter/mail.ts, which is
    the one place that knows how to substitute them.
  */
  subject_template text not null
    default '{unit} Newsletter'
    check (char_length(subject_template) between 1 and 300),
  body_template text not null
    default 'Dear {client},

Kindly find attached the latest newsletter as of {date}.

Should you have any questions or require further clarification, please do not hesitate to reach out to us.

Thank you for your continued trust and understanding.'
    check (char_length(body_template) between 1 and 8000),
  -- Copied on every unit, whoever the project manager is.
  always_cc text[] not null default '{}'
    check (array_length(always_cc, 1) is null or array_length(always_cc, 1) <= 50),
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger mail_settings_updated_at
  before update on public.mail_settings
  for each row execute function public.set_updated_at();

-- The single row exists from the start, so a read never has to cope with "no
-- settings yet" and the defaults above are what the owner starts editing.
insert into public.mail_settings (id) values (true);

alter table public.mail_settings enable row level security;

-- Everyone signed in reads it: composing a message on a unit page needs the
-- wording. Only admins change it, because one edit changes every unit's email.
create policy mail_settings_select on public.mail_settings
  for select using (auth.uid() is not null);
create policy mail_settings_admin_update on public.mail_settings
  for update using (public.is_admin()) with check (public.is_admin());
create policy mail_settings_admin_insert on public.mail_settings
  for insert with check (public.is_admin());
create policy mail_settings_admin_delete on public.mail_settings
  for delete using (public.is_admin());

create table public.pm_mail_routing (
  id uuid primary key default gen_random_uuid(),
  -- As the sheet's `Assigned PM` column spells it.
  pm_name text not null check (char_length(trim(pm_name)) between 1 and 200),
  -- The PM and their own manager, usually two addresses.
  cc_emails text[] not null default '{}'
    check (array_length(cc_emails, 1) is null or array_length(cc_emails, 1) <= 20),
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One rule per PM. Matched case- and space-insensitively for the same reason
-- pm_aliases is: the sheet's spelling of a name is not stable.
create unique index pm_mail_routing_name_key on public.pm_mail_routing (lower(trim(pm_name)));

create trigger pm_mail_routing_updated_at
  before update on public.pm_mail_routing
  for each row execute function public.set_updated_at();

alter table public.pm_mail_routing enable row level security;

-- Same split as the settings above: everyone signed in reads (a project manager
-- composing their own unit's email needs the CC list), admins maintain it.
create policy pm_mail_routing_select on public.pm_mail_routing
  for select using (auth.uid() is not null);
create policy pm_mail_routing_admin_insert on public.pm_mail_routing
  for insert with check (public.is_admin());
create policy pm_mail_routing_admin_update on public.pm_mail_routing
  for update using (public.is_admin()) with check (public.is_admin());
create policy pm_mail_routing_admin_delete on public.pm_mail_routing
  for delete using (public.is_admin());

comment on table public.mail_settings is
  'Wording and standing CC list for the covering email the tool PREPARES. The tool never sends mail.';
comment on table public.pm_mail_routing is
  'Per project manager (as the sheet spells the name), who to CC on that manager''s units.';
