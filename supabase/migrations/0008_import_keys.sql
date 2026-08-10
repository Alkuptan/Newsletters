-- Make bulk import possible.
--
-- 0006 identified a unit and a quotation by a unique index over an EXPRESSION
-- (`lower(trim(unit_code))`). Postgres is happy with that, but PostgREST's
-- upsert can only name plain columns in its ON CONFLICT target — so the import
-- had to fall back to one insert-or-update round trip per row. With the real
-- sheet that is ~400 units plus 645 quotations: over a thousand sequential
-- calls, and the upload timed out after three minutes.
--
-- Storing the normalised key as a generated column gives the same uniqueness
-- with a plain-column unique index, which upsert can target — turning the
-- import into a handful of bulk calls.
--
-- Normalisation matches `unitKey`/`quoteKey` in the import action and the PM
-- name matching in 0007: trim, collapse internal whitespace, lowercase.

alter table public.units
  add column if not exists unit_key text
  generated always as (lower(regexp_replace(trim(unit_code), '\s+', ' ', 'g'))) stored;

create unique index if not exists units_unit_key_delivery_key
  on public.units (unit_key, delivery);

-- Superseded by the line above; identical uniqueness, expressed as an
-- expression index that upsert cannot target.
drop index if exists public.units_code_key;

alter table public.quotations
  add column if not exists quote_key text
  generated always as (lower(regexp_replace(trim(quote_number), '\s+', ' ', 'g'))) stored;

create unique index if not exists quotations_unit_quote_key_v2
  on public.quotations (unit_id, quote_key);

drop index if exists public.quotations_unit_quote_key;
