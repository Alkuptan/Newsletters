-- ★ TEACHING MIGRATION for the example-items slice. /kickoff deletes this
-- migration (and the slice) after using it as the copy source for your real
-- tables. Until then it is the canonical example of the table pattern:
-- table + constraints + trigger + RLS, all in one migration.

create type public.item_status as enum ('open', 'in_progress', 'done');

create table public.example_items (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  details text check (details is null or char_length(details) <= 5000),
  status public.item_status not null default 'open',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index example_items_status_idx on public.example_items (status);
create index example_items_created_by_idx on public.example_items (created_by);

create trigger example_items_updated_at
  before update on public.example_items
  for each row execute function public.set_updated_at();

alter table public.example_items enable row level security;

-- Everyone signed in sees all items (adjust per your spec's role matrix —
-- scoping goes HERE, in a USING clause, and in the matching TS helper).
create policy example_items_select on public.example_items
  for select using (auth.uid() is not null);

-- Anyone signed in may create items they own.
create policy example_items_insert on public.example_items
  for insert with check (created_by = auth.uid());

-- The creator or an admin may update. Status-transition legality is enforced
-- in the server action via the status machine (lib layer) — RLS answers WHO,
-- the action answers WHAT.
create policy example_items_update on public.example_items
  for update using (created_by = auth.uid() or public.is_admin());

-- Only admins delete.
create policy example_items_delete on public.example_items
  for delete using (public.is_admin());
