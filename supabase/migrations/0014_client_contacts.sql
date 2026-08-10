-- 0014 — a unit's clients: who they are, what they are called, who gets named
--
-- A unit can be owned by more than one person, each with their own email
-- address, and the sheet holds them in one cell per unit. Three additive
-- columns, and the split between them is the important part:
--
-- 1. `client_emails` is SHEET DATA, like `client_name` beside it. The import
--    overwrites it, and nothing in the tool edits it. Several addresses live in
--    one cell, separated however the typist separated them.
--
-- 2. `client_titles` and `client_shown` are the OWNER'S DECISIONS, and the
--    import never touches them. They are keyed by client NAME rather than by
--    position, so refreshing the Power Query — which may reorder or re-case the
--    names — cannot silently revert a page the owner has already curated.
--
-- `client_shown` is nullable on purpose: null means "nobody has chosen yet", and
-- the render path shows every client in that case. An empty array is a real
-- decision, meaning "name none of them", and reads differently.
--
-- Client contact data is a deliberate decision, not an oversight — the owner
-- asked for the To line to be pre-filled and confirmed it after the concern was
-- raised. See docs/DECISIONS.md 0015 and the graduation trigger in
-- docs/PROJECT.md: sending the mail is NOT in this tool, only preparing it.
--
-- All three columns are additive and nullable-or-defaulted, so every existing
-- row stays valid. RLS on `units` is unchanged and already in force (migration
-- 0006): `units_select` uses `can_read_unit(id)` and `units_update` uses
-- `can_write_unit(id)`, so these columns inherit exactly the boundary the rest
-- of the unit already has. Adding a column does not add a row-level boundary.

alter table public.units
  add column client_emails text
    check (client_emails is null or char_length(client_emails) <= 2000),
  add column client_titles jsonb not null default '{}'::jsonb
    check (jsonb_typeof(client_titles) = 'object'),
  add column client_shown text[]
    check (client_shown is null or array_length(client_shown, 1) is null or array_length(client_shown, 1) <= 20);

comment on column public.units.client_emails is
  'Sheet data: the unit''s client email addresses, one cell, several addresses. Overwritten by import.';
comment on column public.units.client_titles is
  'Owner''s choice: client name -> title ("Mr.", "Mrs."...). Keyed by name so a sheet refresh cannot lose it.';
comment on column public.units.client_shown is
  'Owner''s choice: which client names the newsletter prints. NULL means undecided (show all); empty means name none.';
