-- Adds the project_manager role, on its own, ahead of the tables that use it.
--
-- WHY ITS OWN MIGRATION: Postgres will not let a newly added enum value be
-- USED in the same transaction that adds it, and Supabase runs each migration
-- file in one transaction. The RLS policies in 0006 compare against
-- 'project_manager', so the value has to be committed first.
--
-- The tool has three effective roles from three enum values (DECISIONS 0004):
--   admin           — everything, including uploading the follow-up sheet
--   project_manager — only units where they are the sheet's Assigned PM
--   member          — read-only; shown in the UI as "Viewer". This is what the
--                     new-user trigger hands out, so a newly invited colleague
--                     can look but not touch until an admin promotes them.

alter type public.app_role add value if not exists 'project_manager';
