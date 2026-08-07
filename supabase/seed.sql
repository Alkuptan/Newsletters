-- LOCAL DEV SEED — runs only on `pnpm db:reset` against the LOCAL database.
-- (For a linked cloud dev project, use `pnpm seed-dev` instead — it goes
-- through the admin API.)
--
-- Dev logins (local only — never create these on a production project):
--   admin@dev.local   / devpassword123   (admin)
--   member@dev.local  / devpassword123   (member)
-- The negative-permission check in the verification loop signs in as
-- member@dev.local and confirms members CANNOT do admin things.

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
    '00000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'admin@dev.local',
    extensions.crypt('devpassword123', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Dev Admin","role":"admin"}',
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'member@dev.local',
    extensions.crypt('devpassword123', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Dev Member","role":"member"}',
    now(), now(), '', '', '', ''
  );

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
values
  (
    gen_random_uuid(), '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    '{"sub":"00000000-0000-0000-0000-000000000001","email":"admin@dev.local","email_verified":true}',
    'email', now(), now(), now()
  ),
  (
    gen_random_uuid(), '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000002',
    '{"sub":"00000000-0000-0000-0000-000000000002","email":"member@dev.local","email_verified":true}',
    'email', now(), now(), now()
  );

-- Promote the dev admin. handle_new_user() deliberately creates every profile
-- as 'member' (it never trusts client-supplied roles); admins are always set
-- explicitly by a trusted path — here the seed, in prod the create-admin
-- script / invite action.
update public.profiles set role = 'admin' where email = 'admin@dev.local';

-- Sample rows for the teaching slice (deleted along with it by /kickoff).
insert into public.example_items (title, details, status, created_by)
values
  ('Fix the beach gate latch', 'Reported by security — latch sticks in the morning.', 'open', '00000000-0000-0000-0000-000000000002'),
  ('Order replacement umbrellas', '12 units for the west lagoon.', 'in_progress', '00000000-0000-0000-0000-000000000002'),
  ('Repaint kiosk 4', null, 'done', '00000000-0000-0000-0000-000000000001');
