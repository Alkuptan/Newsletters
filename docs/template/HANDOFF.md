# HANDOFF.md — graduation checklist

> Owned by the template; overwritten on updates. Run via the `/handover`
> skill, which audits every item and writes `docs/HANDOFF-REPORT.md`.
>
> Because this tool was built on the paved road (same stack, same slice
> layout, same action pattern as the org's flagship repos), graduation is a
> **personnel change, not a rewrite**: the dev team joins the repo.

## When to hand over

- A scope-guard trigger fired (RULES.md) — external users, payments, system-of-
  record writes, sensitive data, >4 roles, pipelines, uptime expectations.
- The tool became business-critical (people's daily work stops when it breaks).
- The builder is moving on and someone must own it.

## The checklist

### Schema & data

- [ ] `pnpm db:reset` replays clean from `supabase/migrations/` + `seed.sql`
- [ ] No drift between migrations and the linked project
      (`pnpm exec supabase db diff --linked` empty — needs SUPABASE_DB_PASSWORD)
- [ ] `database.types.ts` regenerated and committed (zero diff on regenerate)
- [ ] Every table has RLS enabled + policies (`pnpm migration-lint` green)

### Security

- [ ] Permission unit tests cover the full SPEC role matrix, including
      negative cases (each role's "cannot")
- [ ] `@/lib/supabase/admin` imports still quarantined (ESLint green)
- [ ] No secrets in the repo or its git history; secret NAMES inventoried below
- [ ] A second admin exists (not just the builder)

### Verification

- [ ] `pnpm verify` green in CI on `main`
- [ ] Playwright smoke green against a local reset db
- [ ] Every feature slice has at least one action/permissions unit test

### Docs

- [ ] `docs/SPEC.md` matches reality (screens, roles, lifecycles) — audit and
      fix drift before handoff
- [ ] `docs/DECISIONS.md` has an entry for every added dependency and every
      deviation from RULES.md
- [ ] `docs/PROJECT.md` gotchas are current
- [ ] README quick-start works on a clean machine

### Ops

- [ ] Deploys work from a clean clone (`pnpm run deploy`) — and the receiving
      team decides whether to move to Workers Builds (git auto-deploy)
- [ ] Secret names + where they live (Worker secrets, `.env.local` keys)
      listed in HANDOFF-REPORT.md — names only, never values
- [ ] Live URL, Supabase project ref, Cloudflare account noted in the report
- [ ] One live walkthrough call scheduled: builder demos the tool and its
      weirdest edge case to the receiving developer

## Migrating to company accounts (dev team, ~1 hour)

The tool was built and verified on the builder's FREE personal accounts by
design. Moving it is an account change, not a rebuild:

1. **GitHub:** repo Settings → Transfer to the org (issues, PRs, stars, and
   full history carry over; the builder needs repo-creation permission in the
   org or an org owner accepts). **Actions secrets do NOT transfer** — re-add
   `CLAUDE_CODE_OAUTH_TOKEN` after the move. Branch protection/rulesets
   (unavailable on free personal private repos) become available after the
   transfer — enable required CI checks on `main`.
2. **Supabase:** transfer the project to the company org (dashboard → project
   settings → transfer), or `pg_dump`/restore into a fresh company-org
   project. Then rotate: DB password, publishable + secret keys; update
   `.env.production.local` and the Worker secret. Consider Pro (no pausing,
   automatic backups) once the tool is business-critical.
3. **Cloudflare:** Workers are stateless — `wrangler login` as the company
   account, `pnpm run deploy`, `wrangler secret put SUPABASE_SECRET_KEY`,
   re-PATCH the Supabase Auth site_url/redirects to the new URL, verify
   login, then delete the Worker on the personal account. Optionally connect
   Workers Builds (git auto-deploy) and a custom domain.
4. **Users:** unaffected (they live in the Supabase project). Set up custom
   SMTP so email invites deliver without `invite-link`.

## After handoff

The receiving team picks upgrades from the RECIPES.md graduation menu as
needed (Drizzle/Hyperdrive, Sentry, SSO, R2, staging env, custom domain).
