# RULES.md — the managed core

> This file is owned by the template (`internal-tool-template`) and is
> overwritten wholesale on template updates. **Never add project-specific
> content here** — that goes in `docs/PROJECT.md`. If a rule here seems wrong
> for this project, record the deviation in `docs/DECISIONS.md` and open an
> issue on the template repo.

## Who you're working with

The person driving you is a **domain expert, not a developer**. They cannot
read stack traces or review diffs. Therefore:

- **You verify everything yourself** before saying it works — run the
  verification loop, exercise the flow, then report.
- **Explain changes in business terms** ("managers can now approve requests"),
  never in code terms ("refactored the action to use the new schema").
- **Never ask them to run commands** you can run yourself.
- **When something fails, you fix it** — do not hand them an error message.
- When you genuinely need their input, ask **one plain-language question at a
  time** with concrete options.

## Stack (fixed — do not swap pieces)

Next.js (App Router) + React + TypeScript strict · pnpm · Supabase (Postgres +
Auth via `@supabase/ssr` + Storage) with **RLS on every table** · Zod v4 ·
shadcn/ui + Tailwind v4 · deployed to Cloudflare Workers via
`@opennextjs/cloudflare`. Tests: Vitest (unit) + Playwright (e2e smoke).

Architecture: **feature slices**. One business capability = one folder:

```
src/features/<name>/
├── schema.ts        # Zod schemas — form, action, and tests all import THESE
├── queries.ts       # reads (server-only, RLS applies)
├── actions.ts       # writes (server actions, canonical envelope)
├── permissions.ts   # canX(user, row) helpers when rows have owners/scopes
└── components/      # client components for this feature only
```

Plus a route folder under `src/app/(app)/<name>/` and one nav entry in
`src/components/shell/nav-config.ts`. The reference implementation is
whatever slice `/kickoff` built first (the fresh template ships
`src/features/example-items/`, which kickoff replaces) — copy its shapes
exactly.

## Golden rules

1. **Never throw to the client.** Every server action returns `Result<T>` via
   `toResult`/`fromError` (`src/lib/errors.ts`). Copy the action shape from
   the reference slice's `actions.ts` (see above).
2. **Every table gets RLS in the same migration that creates it.** A table
   without RLS policies must not exist, even for a minute, even in dev.
   `pnpm migration-lint` enforces this.
3. **Never edit an applied migration.** Fix forward with a new file
   (`pnpm db:new <name>`). After any schema change: apply it
   (`pnpm db:reset` locally / `pnpm db:push` on the linked project) then
   **immediately** regenerate types (`pnpm db:types:local` / `pnpm db:types`).
   Always both, always immediately.
4. **All mutations are server actions** in `src/features/<name>/actions.ts`
   with the canonical envelope: `'use server'` → `requireUser()`/`requireRole()`
   → rate limit (`check_rate_limit` RPC) where abuse is possible → Zod
   `safeParse` → permission check → mutation → `revalidatePath()` →
   `Result<T>`. No API routes unless a third-party webhook forces one (record
   why in DECISIONS.md).
5. **The service-role client (`@/lib/supabase/admin`) is quarantined**:
   importable only from `src/features/*/actions.ts` and `scripts/`. ESLint
   enforces this. If the rule blocks your import, the design is wrong — do not
   weaken the rule.
6. **One feature = one slice.** Never put business logic in `src/app/` pages
   (they orchestrate: guard → query → render) or in `src/components/`
   (shared, feature-agnostic UI only).
7. **Server Components by default.** `'use client'` only for interactivity,
   as leaf components. Role checks live server-side — client components
   receive booleans like `canDelete`, never compute them.
8. **Do not add dependencies casually.** Prefer what's installed. If truly
   needed: add it and record What/Why/Forecloses in `docs/DECISIONS.md` in the
   same commit.
9. **Never edit generated or vendored files**:
   `src/lib/supabase/database.types.ts` (regenerate instead),
   `src/components/ui/*` (shadcn — re-add instead), `next-env.d.ts`,
   `cloudflare-env.d.ts`, anything under `.next/`, `.open-next/`, `.wrangler/`.
10. **Permissions change in three places or none**: the RLS policy
    (migration), the TS helper (`permissions.ts` / the action's check), and
    the spec's role matrix (`docs/SPEC.md`) — plus a unit test. If you touch
    one, touch all. (Defense in depth: the layout gate authenticates, the page
    authorizes, the action re-checks, RLS backstops.)
11. **Use `log` from `@/lib/log`, never `console.log`.** Structured logs are
    what `wrangler tail` and the Cloudflare dashboard can actually search.
12. **Secrets never appear in code, docs, chat, or command output.** They live
    in `.env.local` (gitignored) and Worker secrets (`wrangler secret put`).
    If a secret value is ever printed, rotate it.

## The verification loop

After every change, before telling the user anything is done:

1. `pnpm verify` (lint + typecheck + unit tests) — must be green.
2. If the change touches a user flow: exercise it against `pnpm dev` — load
   the page, submit the form, confirm the row changed. Don't infer success
   from code.
3. If the change touched schema or permissions: also sign in as the least
   privileged seeded dev user (see `supabase/seed.sql` for this project's
   role set; password `devpassword123` — the fresh template ships
   `member@dev.local`) and confirm they **cannot** do what they shouldn't.
4. Only then report done — one plain-English sentence plus "how I verified it".

## Spec discipline

`docs/SPEC.md` is the contract. Before building anything not in it, update the
spec first and read the change back to the user in plain English. If the user
asks for something that contradicts the spec, surface the conflict — don't
silently pick one. Every feature batch gets a short plan in `docs/plans/`
before implementation and a line in `docs/PROGRESS.md` after.

## When stuck

Two failed attempts at the same error → stop, re-read the relevant recipe in
`docs/template/RECIPES.md` and the gotchas in `docs/PROJECT.md`. **Never work
around a failure by disabling a check** (RLS, a lint rule, a test,
`@ts-ignore`, `as any`). Three failed attempts → stop and prepare an
escalation: a plain-language summary of what was attempted plus the error,
for the user to send to the dev team.

## Scope guard — when to involve the dev team

This project stays small on purpose. If the user asks for any of these, build
nothing; add the request to `docs/PROJECT.md` under "Graduation triggers" and
suggest looping in the dev team (see `docs/template/HANDOFF.md`):

- external or public (non-employee) users
- payments or money movement
- writes to any company system of record (CRM, ERP, Portals, iGouna)
- more than ~4 roles or cross-department permission matrices
- email/notification pipelines, realtime, background jobs beyond one cron
- mobile app, offline use, or hard uptime/on-call expectations
- guest/customer PII, financial, or HR-sensitive data

## Workers/deploy gotchas (hard-won — trust these)

- Use `pnpm run deploy` — bare `pnpm deploy` hits pnpm's built-in and no-ops.
- `middleware.ts`, not `proxy.ts` — Next 16's proxy.ts is broken on
  `@opennextjs/cloudflare` (opennextjs-cloudflare#962).
- Wrangler uploads intermittently fail with "fetch failed" (network flake) —
  just retry the deploy.
- `wrangler.jsonc` keeps `NEXTJS_ENV: "production"` so the Worker never loads
  `.env.local`-style vars at runtime.
- `SUPABASE_SECRET_KEY` reaches production ONLY via
  `wrangler secret put SUPABASE_SECRET_KEY` — it is not in `wrangler.jsonc`
  vars and never `NEXT_PUBLIC_`.
- **Server secrets are blanked for the BUILD step** — `opennextjs-cloudflare
build` inlines every loaded env var into
  `.open-next/cloudflare/next-env.mjs`, which ships inside the uploaded Worker
  bundle. So `build:cf`/`deploy`/`preview` set `SUPABASE_SECRET_KEY=` and
  `SUPABASE_DB_PASSWORD=` for the build; `getServerEnv` treats an empty value
  as missing and falls back to the real Worker secret at runtime. **Any new
  server secret must be added to that blank-list**, or its value ends up in
  the deployed artifact (not public, but readable by anyone with Cloudflare
  account access).
- Supabase client flavors — never mix: `client.ts` (browser),
  `server.ts` (Server Components/actions — RLS applies),
  `admin.ts` (service-role, quarantined), `middleware.ts` (session refresh
  only). Auth _enforcement_ is the `(app)/layout.tsx` gate + DAL guards, not
  the middleware.

## Two environments

- **`.env.local` → LOCAL Supabase** (Docker, `pnpm exec supabase start`). Used
  by `pnpm dev`, `pnpm test`, `pnpm e2e`, and the `db:reset`/`db:types:local`
  flow. Seeded with fake dev users — one per role, see `supabase/seed.sql`
  (password `devpassword123`). Disposable.
- **`.env.production.local` → the CLOUD project.** Used by `db:push`,
  `db:types`, `build:cf`, `deploy`, `create-admin`, `invite-link`. Real users
  only — known-password dev users must never exist here (`seed-dev` refuses
  non-local).

## Free-tier facts (cloud runs on the user's personal free accounts)

The paved road deliberately fits the FREE tiers of Supabase, Cloudflare, and
GitHub; the dev team migrates to company accounts at handover (HANDOFF.md).
Facts that shape day-to-day behavior:

- **Invites:** built-in Supabase email delivers only to the project owner's
  own address (and 2/hour). Inviting a colleague = `pnpm invite-link -- --email …`
  and forward the printed one-time link. Custom SMTP is a graduation item.
- **Pausing:** the cloud database pauses after ~a week of inactivity (app
  fully down, data safe). Daily use prevents it; `/fix-it` Rung 0.5 wakes it.
- **Size budgets:** Worker bundle must stay under **3 MiB gzipped** (deploy
  prints it; overflow is a clean deploy rejection). This is one more reason
  for golden rule 8 — heavy server-side dependencies (Sentry server SDK, big
  i18n/auth libs) are the usual cause. Database budget ~400 MB of real data.
- **No automatic backups** on free — if the data has become important,
  that's a handover trigger, not a DIY cron.

## Database facts

- **Tables are auto-served to `authenticated`/`service_role`** via the DEFAULT
  PRIVILEGES set in `0001_helpers.sql` — you never write a per-table `GRANT`.
  RLS is still the row-level boundary; `anon` gets nothing.
- **Rate limiting:** call `check_rate_limit({ p_scope, p_max, p_window_seconds })`
  with a scope string only — the function appends the caller's own id, so keys
  can't be spoofed. Never pass a full key.
- **Profiles:** `role`/`is_active` are admin-only, and `email`/`id` are locked
  for everyone (enforced by the `profiles_protect_privileged` trigger). Roles
  are set only by trusted paths (invite action, create-admin, seed) — the
  new-user trigger always creates `member`.

## Commands

| Command                                     | What it does                                          |
| ------------------------------------------- | ----------------------------------------------------- |
| `pnpm dev`                                  | dev server on localhost:3000 (local Supabase)         |
| `pnpm verify`                               | lint + typecheck + unit tests (THE gate)              |
| `pnpm migration-lint`                       | additive-only + RLS-on-create checks                  |
| `pnpm e2e`                                  | Playwright smoke (starts its own dev server on :3100) |
| `pnpm db:new <name>`                        | create the next `NNNN_<name>.sql` migration           |
| `pnpm db:reset`                             | recreate LOCAL db from migrations + seed              |
| `pnpm db:push`                              | apply new migrations to the CLOUD project             |
| `pnpm db:types:local` / `pnpm db:types`     | regenerate DB types (local / cloud)                   |
| `pnpm create-admin -- --email … --name "…"` | bootstrap first admin (CLOUD)                         |
| `pnpm invite-link -- --email … --name "…"`  | mint a one-time sign-in link for a colleague (CLOUD)  |
| `pnpm seed-dev`                             | (re)create the fake dev users — LOCAL only            |
| `pnpm run deploy`                           | build + deploy to Cloudflare Workers                  |
