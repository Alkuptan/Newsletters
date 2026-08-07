# Template changelog

Entries are tagged `[docs]` (guidance only), `[config]` (configs/CI — apply
mechanically), or `[code]` (src/ patterns — ships as new recipes, never as
merges into existing projects).

## 10 — run-it-yourself instructions

- `[docs]` README gained "Running it yourself (when Claude isn't
  available)": the three manual commands (`open -a Docker`,
  `pnpm exec supabase start`, `pnpm dev`) with plain-language guidance —
  for builders who hit Claude usage limits and just want to open their
  local tool. Also clarifies the tool never depends on Claude to run.

## 9 — first-time accounts handled in-flow

- `[docs]` Account policy made explicit: GitHub is the ONLY up-front
  prerequisite (README now links signup + the org-invite step). Supabase and
  Cloudflare accounts are created just-in-time inside `/go-live` Phase 1 —
  the skill now handles the no-account case per provider (Supabase:
  "Continue with GitHub" one-click signup; Cloudflare: sign up with work
  email + verification, then re-run the login). Account creation is always
  the user's own browser action; Claude only says what to click.

## 8 — non-developer README

- `[docs]` README rewritten for the actual audience: plain-language pitch
  (with the TC&C tracker as the real example), a what-you-need table, the
  3-step start matched to the repo's INTERNAL visibility (org members use
  the template button directly — no invites), the five commands as a table,
  and an honest small-print section (free-tier quirks, spec approval, scope
  limits, graduation). Technical content moved under "For developers".

## 7 — free-personal-account policy (verified against July 2026 provider docs)

- `[docs]` The whole flow now officially targets FREE PERSONAL accounts
  (GitHub, Supabase, Cloudflare) — no org membership or paid plan anywhere;
  the dev team migrates to company accounts at handover. Audited every CLI
  touchpoint against current provider docs; all pass. Evidence: the dogfood
  tool deployed live on a personal account (Worker bundle 1.94 MiB gzip vs
  the 3 MiB free cap).
- `[code]` `scripts/invite-link.ts` + `pnpm invite-link`: free-tier-safe
  colleague invites (Supabase's built-in email delivers ONLY to the project
  owner's own team addresses, so email invites can't reach colleagues until
  custom SMTP) — creates the user and prints a one-time token-hash sign-in
  link to forward.
- `[docs]` go-live: personal Supabase org is the default (create via CLI if
  none; never pass `--size`); wrap-up now explains the three free-tier facts
  of life (invites, pausing, migration). fix-it: Rung 0.5 wakes a paused
  free project via the Management API restore endpoint. RULES: free-tier
  facts section (invite-link, ~1-week pausing, 3 MiB bundle budget, ~400 MB
  data budget, no auto-backups). HANDOFF: "Migrating to company accounts"
  checklist (GitHub transfer — Actions secrets do NOT carry, branch
  protection unlocks after transfer; Supabase project transfer + key
  rotation; Cloudflare redeploy + secret + delete personal Worker). RECIPES
  graduation menu: custom SMTP, Supabase Pro, Workers Paid, Sentry
  bundle-size warning. README: create the repo under your personal account.

## 6 — build no longer bakes server secrets into the Worker bundle

- `[config]` **Security:** `opennextjs-cloudflare build` inlines every loaded
  env var into `.open-next/cloudflare/next-env.mjs`, which ships inside the
  uploaded Worker bundle — so `SUPABASE_SECRET_KEY` and `SUPABASE_DB_PASSWORD`
  were baked into the deployed artifact, contradicting this template's own
  "reaches production ONLY via `wrangler secret put`" rule. `build:cf`,
  `deploy` and `preview` now blank those vars for the BUILD step;
  `getServerEnv` already treats an empty value as missing and falls back to the
  Worker secret at runtime. Verified on a live deploy (site + a secret-
  dependent external API call both still work). Never public — the bundle is
  server-side and `.open-next/` is gitignored — but readable by anyone with
  Cloudflare account access. **Existing projects: apply this to package.json
  and redeploy; add any project-specific server secret to the blank-list.**
- `[docs]` RULES.md Workers/deploy gotchas documents the rule.

## 5 — go-live auth-flow fixes (dogfood, live login)

Found taking the dogfood tool through first live login end-to-end.

- `[code]` **CRITICAL: `src/app/auth/callback/route.ts` now handles both auth
  flows.** It only did PKCE (`?code=` → exchangeCodeForSession); Supabase's
  default recovery AND invite emails, and any admin-generated link, use the
  token-hash flow (`?token_hash=&type=` → verifyOtp). Result on every deploy:
  password reset and user invites silently dead-ended at `/login`. Now
  supports both. (Hidden because e2e never drives an email link.)
- `[docs]` `/go-live` Phase 4: PATCH the remote Supabase `auth.site_url` +
  `uri_allow_list` to the live URL before the first "Forgot password" — a new
  project defaults to `localhost:3000`, so reset/invite links point at
  localhost otherwise.
- `[docs]` `/go-live` Phase 4: built-in email is 2/hour testing-only — mint
  the admin's first-login link directly via `admin/generate_link`
  (token-hash → the fixed callback); inviting a team needs custom SMTP
  (graduation item). Don't handle the user's SMTP secret in chat.

## 4 — first go-live dogfood

Fixes found by taking the dogfood tool (`tool-tcc-requests`) all the way to a
live Cloudflare Workers URL through `/go-live`.

- `[code]` `scripts/create-admin.ts` + `scripts/seed-dev.ts`: wrapped the
  await-using body in `async function main()` + `void main()`. They used
  top-level await, which tsx/esbuild transforms to CommonJS on some Node
  versions (seen on Node 26) where top-level await is a hard error —
  `create-admin` (a required go-live step) died with a TransformError.
  create-admin's header comment also fixed to say `.env.production.local`.
- `[docs]` `/go-live` Phase 1: non-TTY fallback. In a headless/non-TTY
  session `supabase login` / `wrangler login` can't run the browser flow;
  the skill now detects this and hands the user a one-time copy-paste block
  to run the logins in their own terminal, then resumes (every later phase is
  non-interactive). Never ask for a pasted token.
- `[docs]` `/go-live` Phase 4: workers.dev-subdomain pre-check. A fresh
  Cloudflare account has no subdomain and `wrangler deploy` fails after the
  build; the skill now checks via the API and sends the user to register one
  BEFORE the build (the old `/workers/onboarding` deep link 404s — use
  Workers & Pages). Documents that the secret key is a Worker secret set
  AFTER the first deploy, and that `NEXT_PUBLIC_SITE_URL` can be set up front.

## 3 — first dogfood (TC&C request-intake build)

Fixes found by building a real tool (`tool-tcc-requests`) end-to-end through
the skills, then running a multi-lens adversarial review on the result.

- `[docs]` `/kickoff`: rename `supabase/config.toml` `project_id` in Phase B
  BEFORE the first `supabase start` (a stack started under the template name
  collides with other template-derived projects on the same machine and
  orphans when renamed later); added a written-brief fast-path (map an
  existing spec/brief onto the interview, ask only the gaps); Phase 5 now
  rewrites `README.md` for the built tool (a fresh clone must work from README
  alone).
- `[docs]` `/kickoff` hard caps + `/new-feature` scope guard: always offer the
  descoped alternative (park the capped part as a graduation trigger, build
  the rest) — the cap kills the feature, not the tool.
- `[docs]` RULES.md stops hardcoding `member@dev.local` and the
  `example-items` path (both replaced by kickoff in every real project);
  config.toml comment fixed (referenced a non-existent `/setup`).
- `[docs]` RECIPES: new **Bilingual UI (Arabic/RTL)** recipe (zero-dependency
  dictionary approach, proven in the dogfood); new hardening note on the
  status-lifecycle recipe (back HARD invariants — immutable columns, terminal
  states, append-only audit — with a `BEFORE UPDATE` trigger, and never add a
  broad INSERT policy to a trigger-written table); i18n framework added to the
  graduation menu.
- `[code]` `src/lib/errors.ts`: `fromError(err, messages?)` is now
  locale-aware — pass a dictionary's `errors` map and the Result envelope
  carries localized copy; omit it for the English fallback (backward
  compatible). Makes the Bilingual recipe's error-localization real.

## 2 — interview-first flow

- `[docs]` Restructured the skills around user goals instead of machine
  state: `/kickoff` is now THE entry point and starts with the business
  interview (zero prerequisites — the environment bootstraps in the
  background while the user talks, and the local env is finished only after
  the spec gate). `/setup` is replaced by `/go-live` (sign-ins, cloud
  project, deploy — idempotent, also used for re-deploys). `/fix-it` gained
  Rung 0: fresh machine/clone bootstrap. Skill count unchanged (5).
- `[docs]` README/CLAUDE.md/CONTRIBUTING/env docs updated to the new flow.

## 1 — initial release

- `[code]` Next.js 16 + React 19 + TS strict baseline on Cloudflare Workers
  (@opennextjs/cloudflare), Supabase (Auth + Postgres + RLS-first), shadcn/ui
  radix-nova + Tailwind v4, Zod v4.
- `[code]` Core lib: Supabase client trio + DAL guards, `Result<T>` error
  envelope, structured log, `getServerEnv`.
- `[code]` Base migrations: helpers, identity (profiles + app_role +
  handle_new_user), rate limiting RPC, example-items teaching slice.
- `[code]` App shell, auth flow (login/reset), admin users, settings,
  example-items reference feature with unit + e2e tests.
- `[config]` ESLint guard rules (admin-client quarantine, client/server
  import walls), migration-lint, CI (verify + build:cf dry-run +
  migration-lint), claude-code-review workflow, husky + lint-staged.
- `[docs]` RULES.md, RECIPES.md, HANDOFF.md, docs skeleton, five skills
  (originally /setup /kickoff /new-feature /fix-it /handover; see v2).
