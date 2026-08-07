-- Identity: roles, profiles, RLS helpers, auto-profile trigger.
--
-- PATTERN (copy it for every new table):
--   1. create the table
--   2. enable RLS in the SAME migration
--   3. write the policies in the SAME migration
-- A table without RLS must not exist, even for a minute, even in dev.

-- Roles. Start with two; add more ONLY when the spec's role matrix demands it
-- (adding a value: alter type app_role add value 'x'; — in a NEW migration).
create type public.app_role as enum ('admin', 'member');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null,
  role public.app_role not null default 'member',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

-- ── RLS helpers ─────────────────────────────────────────────────────────────
-- SECURITY DEFINER so policies can read profiles without infinite recursion
-- through profiles' own RLS. STABLE so Postgres caches the result per query.

create or replace function public.current_app_role()
returns public.app_role
language sql security definer stable
set search_path = public
as $$
  select role from profiles where id = auth.uid() and is_active
$$;

create or replace function public.is_admin()
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin' and is_active
  )
$$;

-- ── profiles policies ───────────────────────────────────────────────────────
-- Everyone signed in can see who exists (names are needed all over the UI);
-- only admins may change anything. Inserts happen exclusively through the
-- handle_new_user trigger below; deletes only via the service-role client.

create policy profiles_select on public.profiles
  for select using (auth.uid() is not null);

create policy profiles_admin_update on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- Users may edit their own profile (only full_name in practice — the trigger
-- below pins everything else)…
create policy profiles_self_update on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- …but never escalate or impersonate. RLS WITH CHECK cannot compare OLD vs
-- NEW, so a trigger guards the privileged/identity columns: a non-admin may
-- change ONLY full_name. `role`/`is_active` are admin-only (escalation), and
-- `email`/`id` are locked for everyone here (email changes go through
-- Supabase Auth, which re-syncs the profile) so a member can't rewrite their
-- email to impersonate a colleague. Callers with no JWT (service-role scripts)
-- bypass RLS but still run triggers; `auth.uid() is null` exempts them.
create or replace function public.protect_privileged_profile_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new; -- service-role / SQL seed: trusted, no restriction
  end if;
  if (new.email is distinct from old.email or new.id is distinct from old.id) then
    raise exception 'Email and id cannot be changed here.' using errcode = '42501';
  end if;
  if (new.role is distinct from old.role or new.is_active is distinct from old.is_active)
     and not public.is_admin() then
    raise exception 'Only admins may change roles or activation.' using errcode = '42501';
  end if;
  return new;
end
$$;

create trigger profiles_protect_privileged
  before update on public.profiles
  for each row execute function public.protect_privileged_profile_columns();

-- ── Auto-create a profile for every new auth user ──────────────────────────
-- SECURITY: role is HARD-CODED to 'member' and is NEVER read from
-- raw_user_meta_data. user_metadata is fully client-controlled (anyone with
-- the public publishable key can call auth.signUp({ data: { role: 'admin' }})),
-- so trusting it here would let a stranger self-provision an admin account.
-- Privileged roles are granted only AFTER creation, by the service-role admin
-- client, in code that first checked the caller is an admin
-- (src/features/admin-users/actions.ts, scripts/create-admin.ts). full_name is
-- non-privileged, so taking it from metadata is fine.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    'member'
  )
  on conflict (id) do nothing;
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
