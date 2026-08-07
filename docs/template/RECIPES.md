# RECIPES.md — copy-paste patterns

> Owned by the template; overwritten on template updates. Each recipe is the
> approved way to do the thing. If a recipe is missing, check
> `src/features/example-items/` first — it demonstrates most patterns live.

## Add a new feature slice

1. Migration: `pnpm db:new <feature>` → table + constraints + `updated_at`
   trigger + **enable RLS + policies in the same file** (copy
   `supabase/migrations/0004_example_items.sql`).
2. Apply + types: `pnpm db:reset` (local) then `pnpm db:types:local`.
3. Slice: copy `src/features/example-items/` → rename; adjust
   schema/queries/actions/permissions/components.
4. Route: `src/app/(app)/<feature>/page.tsx` (+ `[id]/page.tsx` if it has a
   detail view).
5. Nav: one entry in `src/components/shell/nav-config.ts`.
6. Tests: copy the three example-items unit tests and retarget them.
7. `pnpm verify`, then the full verification loop (RULES.md).

## Add a table with a status lifecycle

Copy `0004_example_items.sql` (enum + table + RLS) and
`src/features/example-items/status-machine.ts` (TRANSITIONS map +
assertTransition). RLS answers WHO may write; the status machine answers WHAT
transitions are legal; the action enforces both.

> **Back HARD invariants with a DB trigger, not just the action.** The status
> machine and any "these columns never change" / "this row is append-only" /
> "terminal state is final" rule live only in the server action by default — a
> hand-crafted PostgREST call (a signed-in user's JWT + the public publishable
> key) skips the action entirely. If a rule is an absolute guarantee (an
> immutable reference/created_by, a frozen terminal state, an append-only
> audit log), add a `BEFORE UPDATE` trigger that re-checks it (model:
> `protect_privileged_profile_columns` in `0002_identity.sql`), skipping
> `auth.uid() is null` so seed/service-role paths pass. And never add a broad
> `for insert` RLS policy to a table that is written ONLY by SECURITY DEFINER
> triggers (e.g. an audit log) — that policy is pure attack surface; the
> triggers insert regardless of RLS, so the table needs NO insert policy.

## Add a role

Adding a role touches five places — do all of them:

1. Migration A: `alter type public.app_role add value 'supervisor';` — this
   MUST be its own migration file with nothing else in it. Postgres will not
   let a newly-added enum value be used later in the SAME transaction/file.
2. Regenerate types (`pnpm db:types:local`).
3. Migration B (a SEPARATE, later file): the RLS policies that reference the
   new value.
4. Update TS permission helpers + the role matrix in `docs/SPEC.md`.
5. Add unit-test cases for the new role (positive AND negative).

> More than 4 roles is a graduation trigger — check RULES.md scope guard first.

## Scope rows to a department / owner

- Column on the table (e.g. `department_id uuid not null`).
- RLS `USING` clause filters by the caller's profile scope (SECURITY DEFINER
  helper reading `profiles`, like `is_admin()` in `0002_identity.sql`).
- Matching TS helper in the slice's `permissions.ts` used by page + action.
- Negative test: user from another department cannot see/edit the row.

## File upload (Supabase Storage)

1. Migration: create a bucket + storage RLS policies:

```sql
insert into storage.buckets (id, name, public) values ('attachments', 'attachments', false);
create policy attachments_read on storage.objects for select
  using (bucket_id = 'attachments' and auth.uid() is not null);
create policy attachments_insert on storage.objects for insert
  with check (bucket_id = 'attachments' and owner_id::uuid = auth.uid());
```

2. Upload from the browser client (`createClient()` from
   `@/lib/supabase/client`) with a path like `<feature>/<rowId>/<uuid>.<ext>`.
3. Render via signed URLs created in `queries.ts`
   (`supabase.storage.from("attachments").createSignedUrl(path, 3600)`).
4. Store the storage path (not the URL) on the row.

## CSV export

Server-side: a `queries.ts` function returning rows → a small
`toCsv(rows, columns)` util → a server action returning the CSV string in
`Result<string>` → client `Blob` download. No new dependencies needed.

## Scheduled job (one allowed, keep it small)

Use Supabase `pg_cron` in a migration. The `delete` inside the scheduled job
would trip `migration-lint`'s additive-only rule, so add the pre-approved
override comment (this specific cleanup case does not need dev-team review):

```sql
-- migration-lint: allow-destructive scheduled cleanup of expired rate-limit rows
create extension if not exists pg_cron;
select cron.schedule('nightly-cleanup', '0 3 * * *', $$ delete from rate_limits where window_start < now() - interval '1 day' $$);
```

> Needing more than one cron job, queues, or email pipelines is a graduation
> trigger.

## Bilingual UI (Arabic/RTL) — no new dependencies

A predictable ask for Orascom tools. The approved shape (full reference
implementation: the `tool-tcc-requests` repo):

1. `src/lib/i18n/`: `config.ts` (locales, cookie name, `LOCALE_DIR` map) ·
   `dictionaries/en.ts` (source of truth; `export type Dictionary = typeof en`)
   · `dictionaries/ar.ts` (`satisfies Dictionary` — a missing/extra key fails
   the build) · `index.ts` (server-only `getLocale()`: cookie → profile
   preference → default, and `getDict()`) · `client.ts` (client components
   receive a serializable `locale` PROP and look the dictionary up themselves
   — dictionary template FUNCTIONS cannot cross the server→client boundary).
2. Migration: `profiles.preferred_language text not null default 'en' check
(preferred_language in ('en','ar'))` — self-editable, not privileged.
3. Root layout: `<html lang={locale} dir={LOCALE_DIR[locale]}>`; load an
   Arabic face via next/font (e.g. Noto Sans Arabic) and append its variable
   to the `--font-sans` stack in globals.css (Latin first, Arabic fallback).
4. The toggle: server action sets the cookie (+ own profile when signed in),
   then the client calls `window.location.reload()` — `router.refresh()`
   does NOT reliably re-render `<html lang/dir>`.
5. RTL correctness: logical utilities only (`ps-*/pe-*/ms-*/me-*/border-s/
border-e/text-start/text-end`); pin Latin data with `dir="ltr"` (phones,
   emails, references, file names); `dir="auto"` on free-text
   inputs/renders; `rtl:rotate-180` on directional icons.
6. Dates: one shared helper with an EXPLICIT locale tag and timezone
   (`Intl.DateTimeFormat("ar-EG"|"en-GB", { timeZone: "Africa/Cairo" })`) —
   implicit browser locale is a hydration-mismatch source.
7. Localized validation: schema FACTORIES (`buildXSchema(dict.validation)`) —
   forms build them with the user's locale, actions rebuild via `getDict()`;
   keep English instances exported for types and tests.
8. Add a dictionary key-parity unit test (walk both trees).
9. Error copy: `fromError(err, dict.errors)` already localizes the Result
   envelope — add an `errors` section to both dictionaries matching the
   `ErrorMessages` shape in `src/lib/errors.ts`, and pass it from every action
   (`return fromError(err, (await getDict()).errors)`). Throw AppErrors with
   already-localized custom messages where the copy is specific (sign-in
   failure, admin self-guards); code-default errors localize automatically.
10. Dialogs: don't use `<DialogFooter showCloseButton>` — it renders a
    hardcoded English "Close". Render an explicit
    `<DialogClose asChild><Button variant="outline">{dict.common.cancel}</Button></DialogClose>`.

> Bidi: wrap any free-text value that can be Arabic OR English (titles,
> descriptions, names) in `dir="auto"`, and pin always-Latin data (emails,
> phones, references, file names) with `dir="ltr"`.

## Pagination (when a list outgrows one page)

Add TanStack pagination to the shared DataTable: `getPaginationRowModel()`,
page size 25, controls under the table. Keep filtering server-side (pass
searchParams to `queries.ts`) once tables exceed ~1k rows.

## Graduation upgrades (dev team menu — not for self-serve)

Migration to company accounts (see HANDOFF.md) · custom SMTP for auth emails
(makes invites deliver; removes `invite-link`) · Supabase Pro (no pausing +
automatic backups) · Workers Paid (bundle > 3 MiB gzip or heavy SSR CPU) ·
Drizzle ORM + Hyperdrive · R2 for large/binary files · Sentry (note: its
server SDK is a bundle-size risk on the free Worker plan) · SSO/company IdP ·
email pipelines (Resend) · realtime · multi-env (staging) · custom domain ·
Cloudflare Workers Builds (git auto-deploy) · a full i18n framework
(next-intl) if dictionaries outgrow two languages.
