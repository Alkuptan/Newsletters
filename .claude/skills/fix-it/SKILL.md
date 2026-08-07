---
name: fix-it
description: Triage and fix anything broken — app won't start, page errors, deploy failed, data looks wrong, login problems, or a fresh machine/clone where nothing runs yet. Runs a fixed diagnostic ladder and always offers reverting to the last working version. Use whenever the user reports something broken and the cause isn't already obvious.
---

# /fix-it — the break-glass loop

The user cannot read stack traces. Never show them one. Diagnose yourself,
fix yourself, and report in business terms. Always tell them early:
**"Worst case, I can put everything back the way it was"** (git revert).

## Rung 0 — Fresh machine / fresh clone (nothing runs at all)

New laptop, new clone, or missing `.env.local`? That's not a bug — bootstrap
the local environment: `pnpm install` → Docker (`docker info`; install/launch
if needed) → `pnpm exec supabase start` → write `.env.local` from
`pnpm exec supabase status -o env` → `pnpm db:reset` → `pnpm db:types:local`
→ `pnpm verify` → `pnpm dev`. (Cloud pieces — sign-ins, `.env.production.local`
— only matter for deploying; that's `/go-live`.)

## Rung 0.5 — Live app completely down after a quiet stretch? (free tier)

Free Supabase projects PAUSE after ~a week of inactivity — the whole app
(login included) goes unreachable, data intact. Check
`pnpm exec supabase projects list` (status shows INACTIVE/PAUSED). Wake it
via the Management API with the CLI's stored access token (never print it):
`POST https://api.supabase.com/v1/projects/<ref>/restore` (Bearer token from
the Supabase CLI keychain/config). Restoring takes a couple of minutes; then
verify login on the live URL. Tell the user: daily use prevents this; the
permanent fix is the dev team migration / Supabase Pro (graduation).

## The ladder (run in order, stop when found)

1. **Reproduce.** Ask what they did, expected, and saw (one question). Then
   reproduce it yourself against `pnpm dev` — don't fix what you can't see.
2. **Local state.** `pnpm verify` — typecheck/lint/test failures point at
   half-finished work. `git status` + `git log --oneline -10` — uncommitted
   or recent changes are the prime suspect.
3. **Recent changes.** Did the last commits touch migrations or permissions?
   Check `supabase/migrations/` newest files against the symptom; run
   `pnpm migration-lint`. Types stale? Regenerate (`pnpm db:types:local` or
   `db:types`) and re-run typecheck.
4. **Environment.** `.env.local` present and complete vs `.env.example`?
   Supabase project reachable (`pnpm exec supabase projects list`)? Dev
   server actually restarted after env changes?
5. **Deploy (if the LIVE app is broken).** `pnpm exec wrangler deployments list`
   for when it last changed; "fetch failed" upload errors are a known flake —
   retry `pnpm run deploy`. If live is broken but local is fine: the fix is a
   fresh deploy of a known-good commit, not live debugging.
6. **Logs.** Local: the `pnpm dev` output. Live:
   `pnpm exec wrangler tail <worker> --format pretty` while reproducing
   (logs are structured JSON via `lib/log.ts`).

## Fixing rules

- Fix the cause, not the symptom. NEVER fix by disabling a check — no
  removing RLS policies, tests, lint rules, or adding `@ts-ignore` /
  `as any` (RULES.md).
- After the fix: full verification loop (verify + exercise the flow +
  negative check if permissions were involved). Then one-sentence report:
  what was wrong (business terms), what you changed, how you verified.
- Log the gotcha in `docs/PROJECT.md` if it cost real time and could recur.

## Safe harbor

If the user just needs it working again NOW: `git revert` the offending
commit(s) (never `reset --hard` on shared history), verify, and (if live)
`pnpm run deploy`. Then investigate at leisure.

## Escalate (3 strikes)

Three failed attempts at the same error → stop. Write a copy-paste escalation
message for the dev team: symptom, when it started, exact error text, what
you tried (bulleted), repo name + live URL. Add it to `docs/PROJECT.md` under
Gotchas with an "ESCALATED <date>" marker. Destructive-migration needs,
auth-provider outages, and anything touching company accounts/billing are
ALWAYS escalations, not fixes.
