-- Somewhere to keep the site photos, and permission to put them there.
--
-- WHY STORAGE AND NOT JUST A ONEDRIVE LINK: both exporters have to READ the
-- pixels of every photo — the JPG through a canvas, the PowerPoint by
-- cover-cropping each one before embedding it — and a browser refuses to let a
-- canvas read an image from another origin (DECISIONS 0007). So the bytes have to
-- be reachable from this tool's own address. `unit_photos.source_url` still
-- records where a photo came from.
--
-- Objects are laid out as `<unit_id>/<file>`, which is what the policies below
-- key on: whoever may change a unit may add and remove its photos.

insert into storage.buckets (id, name, public)
values ('unit-photos', 'unit-photos', false)
on conflict (id) do nothing;

-- The unit a stored object belongs to, taken from the first folder in its path.
-- Returns null for a path that does not start with a uuid, so a malformed key
-- can never match a real unit.
create or replace function public.storage_object_unit_id(object_name text)
returns uuid
language plpgsql immutable
set search_path = public
as $$
declare
  first_folder text;
begin
  first_folder := split_part(object_name, '/', 1);
  begin
    return first_folder::uuid;
  exception when others then
    return null;
  end;
end
$$;

-- Anyone who may see the unit may see its photos; anyone who may change the
-- unit may add, replace and remove them. Mirrors can_read_unit/can_write_unit,
-- so the photo rules and the unit rules cannot drift apart.
create policy unit_photos_objects_select on storage.objects
  for select using (
    bucket_id = 'unit-photos'
    and public.can_read_unit(public.storage_object_unit_id(name))
  );

create policy unit_photos_objects_insert on storage.objects
  for insert with check (
    bucket_id = 'unit-photos'
    and public.can_write_unit(public.storage_object_unit_id(name))
  );

create policy unit_photos_objects_update on storage.objects
  for update using (
    bucket_id = 'unit-photos'
    and public.can_write_unit(public.storage_object_unit_id(name))
  );

create policy unit_photos_objects_delete on storage.objects
  for delete using (
    bucket_id = 'unit-photos'
    and public.can_write_unit(public.storage_object_unit_id(name))
  );

-- Where the bytes live. Null for a photo we only know a link to.
alter table public.unit_photos
  add column if not exists storage_path text;

-- A photo can now arrive as an upload (storage_path) instead of a link, so
-- source_url is no longer compulsory. One of the two must be present.
alter table public.unit_photos alter column source_url drop not null;

alter table public.unit_photos
  add constraint unit_photos_has_a_source
  check (source_url is not null or storage_path is not null);

-- The old uniqueness assumed every photo had a source_url.
drop index if exists public.unit_photos_source_key;
create unique index unit_photos_source_url_key
  on public.unit_photos (unit_id, source_url) where source_url is not null;
create unique index unit_photos_storage_path_key
  on public.unit_photos (storage_path) where storage_path is not null;
