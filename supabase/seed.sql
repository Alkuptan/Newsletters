-- LOCAL DEV SEED — runs only on `pnpm db:reset` against the LOCAL database.
-- (For a linked cloud dev project, use `pnpm seed-dev` instead — it goes
-- through the admin API.)
--
-- Dev logins (local only — never create these on a production project):
--   admin@dev.local   / devpassword123   (admin)
--   pm@dev.local      / devpassword123   (project_manager, is "Mariam Sobhy")
--   member@dev.local  / devpassword123   (member — shown as "Viewer")
-- The negative-permission checks in the verification loop sign in as
-- member@dev.local (confirming a viewer cannot change anything) and as
-- pm@dev.local (confirming a PM cannot see another PM's units).

-- Creating auth users directly in SQL is a local-dev-only pattern; the
-- handle_new_user trigger creates the matching profiles rows.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token,
  email_change, email_change_token_new
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '11111111-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'admin@dev.local',
    extensions.crypt('devpassword123', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Dev Admin","role":"admin"}',
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '22222222-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'member@dev.local',
    extensions.crypt('devpassword123', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Dev Member","role":"member"}',
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '33333333-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', 'pm@dev.local',
    extensions.crypt('devpassword123', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Mariam Sobhy","role":"project_manager"}',
    now(), now(), '', '', '', ''
  );

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
values
  (
    gen_random_uuid(), '11111111-0000-4000-8000-000000000001',
    '11111111-0000-4000-8000-000000000001',
    '{"sub":"11111111-0000-4000-8000-000000000001","email":"admin@dev.local","email_verified":true}',
    'email', now(), now(), now()
  ),
  (
    gen_random_uuid(), '22222222-0000-4000-8000-000000000002',
    '22222222-0000-4000-8000-000000000002',
    '{"sub":"22222222-0000-4000-8000-000000000002","email":"member@dev.local","email_verified":true}',
    'email', now(), now(), now()
  ),
  (
    gen_random_uuid(), '33333333-0000-4000-8000-000000000003',
    '33333333-0000-4000-8000-000000000003',
    '{"sub":"33333333-0000-4000-8000-000000000003","email":"pm@dev.local","email_verified":true}',
    'email', now(), now(), now()
  );

-- Promote the dev admin. handle_new_user() deliberately creates every profile
-- as 'member' (it never trusts client-supplied roles); admins are always set
-- explicitly by a trusted path — here the seed, in prod the create-admin
-- script / invite action.
update public.profiles set role = 'admin' where email = 'admin@dev.local';
update public.profiles set role = 'project_manager' where email = 'pm@dev.local';

-- ── Unit Newsletter Studio sample data ─────────────────────────────────────
-- Real rows from Sample/Follow-up sheet (Don't Delete).xlsm, chosen so the
-- permission rules can actually be exercised:
--
--   CY-11        Mariam Sobhy      → pm@dev.local SEES it
--   AH-56        Mariam Sobhy      → pm@dev.local SEES it (three quotations)
--   Ph4-Villa-2B Heba Kamal  → pm@dev.local must NOT see it
--
-- "Mariam Sobhy" is how the sheet names the PM; pm_aliases ties that spelling to
-- the pm@dev.local login.

insert into public.pm_aliases (profile_id, pm_name)
values ('33333333-0000-4000-8000-000000000003', 'Mariam Sobhy');

insert into public.units (id, unit_code, zone, assigned_pm, display_name, client_name)
values
  (
    'c1000000-0000-4000-8000-000000000001', 'CY-11', 'Cyan', 'Mariam Sobhy',
    'Cyan 11', 'Mr. Samir Abdel Rahman Farouk'
  ),
  (
    'a5000000-0000-4000-8000-000000000002', 'AH-56', 'Ancient Hill', 'Mariam Sobhy',
    'Ancient Hill 56', 'Mr. Adel Fahmy Girgis'
  ),
  (
    'f4000000-0000-4000-8000-000000000003', 'Ph4-Villa-2B', 'Phases',
    'Heba Kamal', 'Phase 4 Villa 2B', 'Mr. Youssef Nabil Hakim'
  );

insert into public.quotations (
  unit_id, quote_number, invoice_number, invoice_value, scope_of_work, progress,
  planned_start_date, max_contractual_date, project_status, notes,
  marked_ready_in_sheet, include_in_newsletter
)
values
  -- Cyan 11: one quotation, ticked.
  (
    'c1000000-0000-4000-8000-000000000001', '20411', '31875', 1940879.63,
    'Unit Extension', 1.0000, '2026-04-29', '2026-09-26', 'Completed', null,
    false, true
  ),
  -- Ancient Hill 56: three quotations; the owner ticked the first two.
  (
    'a5000000-0000-4000-8000-000000000002', '20415', '31977', 1270456.64,
    'SOG', 0.4000, '2026-06-16', '2026-08-15', 'Hold', 'Pending Client Scope',
    true, true
  ),
  (
    'a5000000-0000-4000-8000-000000000002', '20423', '32087', 154030.98,
    'Landscape', 0.0000, '2026-07-29', '2026-09-17', 'Hold', 'Pending Client Scope',
    false, true
  ),
  (
    'a5000000-0000-4000-8000-000000000002', '20431', '32169', 250914.36,
    'Pergola', 0.0000, '2026-08-27', '2026-09-26', 'Not Started', null,
    false, false
  ),
  -- Phase 4 Villa 2B belongs to a different PM — this is the row pm@dev.local
  -- must NOT be able to read.
  (
    'f4000000-0000-4000-8000-000000000003', '20408', '31762', 9391861.96,
    'Unit Extension', 0.9000, '2026-03-18', '2026-09-14', 'In Progress', null,
    false, true
  );

insert into public.editions (footer_label, footer_date, created_by)
values ('Bi-Weekly Newsletter', '2026-08-07', '11111111-0000-4000-8000-000000000001');
