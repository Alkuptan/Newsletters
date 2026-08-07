-- Shared helpers used by every later migration.
-- RULE: never edit this file after it has been applied — fix forward with a
-- new migration (pnpm db:new <name>).

-- pgcrypto provides crypt()/gen_salt() used by seed.sql for local dev users.
create extension if not exists pgcrypto with schema extensions;

-- Data-API access grants. Supabase serves tables through PostgREST as the
-- `authenticated` (signed-in) and `service_role` (admin client) Postgres
-- roles; without table privileges every query fails with "permission denied
-- for table …" (SQLSTATE 42501) — which surfaces in the app as a null
-- profile / "account deactivated". Setting DEFAULT PRIVILEGES here (before any
-- table exists) means every table a later migration creates is automatically
-- reachable, so you never have to remember a per-table GRANT. RLS remains the
-- security boundary: authenticated can only touch rows its policies allow, and
-- `anon` is granted nothing (this is an internal, sign-in-only tool).
alter default privileges in schema public
  grant all on tables to authenticated, service_role;
alter default privileges in schema public
  grant usage, select on sequences to authenticated, service_role;

-- Every table with an updated_at column attaches this trigger:
--   create trigger <table>_updated_at before update on <table>
--     for each row execute function public.set_updated_at();
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end
$$;
