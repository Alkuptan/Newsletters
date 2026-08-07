---
name: go-live
description: Put this tool on the internet — signs into GitHub/Supabase/Cloudflare through chat (browser approve-clicks only, no dashboards), creates the cloud database project, deploys to Cloudflare Workers, and creates the real admin account. Idempotent — also use for subsequent deploys and for finishing a partial go-live. Use when the user wants the tool online or asks to deploy.
---

# /go-live — from working-locally to on-the-internet

You are guiding a NON-DEVELOPER. Run commands yourself; never send them to a
terminal or a web dashboard. The only things they do in a browser are click
"Approve" on the sign-in pages you open, and later log into the live app.

**Never echo secret values** (keys, passwords, tokens). Write them straight
into env files / Worker secrets. If one is ever printed, say so and rotate it.

This skill is **idempotent**: detect what already exists (Phase 0) and do only
what's missing. A repeat run with everything provisioned = just build + deploy.

## The two environments (say this once, simply, on first run)

- **Local** — the database on their machine (Docker), with fake sample users.
  Where they build and try things. Config: `.env.local`.
- **Cloud** — the real project on the internet. Real people, real data, real
  emails. Config: `.env.production.local`. Fake dev users never exist here.

## Phase 0 — Detect state (silent)

`gh auth status` · `pnpm exec supabase projects list` (works ⇒ logged in) ·
`pnpm exec wrangler whoami` · does `.env.production.local` exist ·
`pnpm exec supabase migration list --linked` (linked + pushed?) ·
`pnpm exec wrangler deployments list` (deployed before?). Report one line:
"Already done: … Still needed: …" — then run only the missing phases.

## Phase 1 — Sign-ins (browser approve-clicks only)

**The user may not HAVE these accounts yet — that's normal and handled here,
not a prerequisite.** Ask once, casually: "Do you already have Supabase or
Cloudflare accounts, or is this your first time? Either way it's a couple of
clicks." Account CREATION is always done by the user in their browser (never
type their details for them); your job is telling them exactly what to click:

- **GitHub:** `gh auth login --git-protocol https --web` (paste one code,
  click Authorize; if `gh` is missing, `brew install gh` first). They always
  have GitHub — it's the README prerequisite (org membership to reach the
  template).
- **Supabase:** `pnpm exec supabase login` (browser → Approve). **No account?
  The same page offers sign-up — tell them to click "Continue with GitHub"**
  (one click, uses the account they already have; their free org is created
  automatically). Then the Approve screen follows.
- **Cloudflare:** `pnpm exec wrangler login` (browser → Allow). **No account?
  Tell them to click "Sign up" on that page, use their WORK email + a new
  password, click the verification link in the email they receive, then say
  "done"** — re-run `wrangler login` and the Allow screen appears. (Fresh
  accounts will also pick a workers.dev subdomain later — Phase 4 step 0
  handles it.)

**Non-TTY sessions (headless/cron/some IDE integrations):** if `test -t 0`
reports no TTY, `supabase login` fails outright (`Cannot use automatic login
flow inside non-TTY environments`) and `wrangler login` can't capture its
callback. You cannot complete these for the user here, and you must NOT ask
them to paste a token into chat. Instead, give them a copy-paste block to run
ONCE in their own Terminal — the same browser-approve flow, just in their
shell:

```
cd <project-dir>
pnpm exec supabase login     # browser → Approve
pnpm exec wrangler login     # browser → Allow
```

Their stored credentials (keychain/config) are then visible to your
`pnpm exec` calls, exactly like `gh` — every remaining phase runs without a
terminal. Wait for them to say done, then re-detect (Phase 0) and continue.

## Phase 2 — Create the cloud database project

**Free personal accounts are the default** — no company org membership is
needed anywhere in this flow. The dev team migrates everything to company
accounts at handover (see HANDOFF.md).

1. `pnpm exec supabase orgs list` — one org → use it; several → ask (names
   only). None (fresh account) → the default org appears on first dashboard
   sign-in; if the list is still empty, create one:
   `pnpm exec supabase orgs create <tool-name>-org`. A free org allows 2
   active projects — if this account already has 2, ask which to pause or
   use a new org.
2. Generate a strong DB password without displaying it
   (`openssl rand -base64 24 | tr -d '/+=' | cut -c1-24`).
3. `pnpm exec supabase projects create <tool-name> --org-id <org> --region eu-central-1 --db-password <pw>`
   (provisioning takes ~2 min — a good moment to recap what going live means).
   **Never pass `--size`** — anything above the free default compute is paid.
4. Write `.env.production.local` (cloud section of `.env.example`):
   - `NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co`
   - keys via `pnpm exec supabase projects api-keys --project-ref <ref> --reveal --output json`
     (`--reveal` is REQUIRED — without it the secret key is redacted). Prefer
     `publishable`/`secret`; fall back to `anon`/`service_role` on older
     projects. Pipe/parse straight into the file; never echo.
   - `SUPABASE_DB_PASSWORD=<pw>` (used by `db:push` and `db diff --linked`).
5. `pnpm exec supabase link --project-ref <ref>`, then `pnpm db:push`.
6. **Turn OFF public signup on the cloud project** — this tool is invite-only.
   The CLI can't toggle it; this is the ONE dashboard action: Supabase →
   Authentication → Sign In / Providers → uncheck "Allow new users to sign
   up". Walk them through it in two sentences.

## Phase 3 — The real admin (them)

`pnpm create-admin -- --email <their-work-email> --name "<Full Name>"` —
passwordless on purpose; they set their password via "Forgot password" on the
live login page. Do NOT run `pnpm seed-dev` against the cloud (it refuses;
dev users are local-only).

## Phase 4 — Deploy

0. **workers.dev subdomain (first deploy on a fresh Cloudflare account).**
   Deploy fails with "You need to register a workers.dev subdomain" if the
   account has none — and wrangler can't register it non-interactively (the
   name is a global-unique user choice). Check first:
   `curl -s https://api.cloudflare.com/client/v4/accounts/<acct>/workers/subdomain -H "Authorization: Bearer $(grep oauth_token ~/Library/Preferences/.wrangler/config/default.toml | sed -E 's/.*"([^"]+)".*/\1/')"`
   — `result.subdomain` empty/404 ⇒ send the user ONCE to
   `https://dash.cloudflare.com/<acct>/workers-and-pages` (the deep
   `/workers/onboarding` link 404s on newer dashboards — use Workers & Pages
   and pick a subdomain). The app's URL becomes
   `<worker-name>.<subdomain>.workers.dev`; you can set
   `NEXT_PUBLIC_SITE_URL` to it up front so the build inlines it (saves a
   redeploy). Do this BEFORE the ~3-min build so a non-dev never eats a build
   then a raw failure. The secret key must be a Worker secret, not a build
   var — so the order is deploy (creates the Worker) → secret put.
1. `pnpm exec wrangler secret put SUPABASE_SECRET_KEY` — pipe the value from
   `.env.production.local` programmatically; never display it. (Runs AFTER
   the first deploy — the Worker must exist; `secret put` then ships a new
   version carrying the secret, no rebuild needed.)
2. `pnpm run deploy` (NOT bare `pnpm deploy` — it no-ops). On "fetch failed",
   retry once or twice (known network flake).
3. **Point Supabase Auth at the live URL (or the first reset link dies).** A
   new project ships `auth.site_url = http://localhost:3000` and an empty
   redirect allow-list, and Supabase ignores a `redirectTo` that isn't
   allow-listed — so reset/invite emails link to localhost. PATCH the remote
   before anyone clicks "Forgot password":
   `curl -X PATCH https://api.supabase.com/v1/projects/<ref>/config/auth -H "Authorization: Bearer <supabase-access-token>" -H "Content-Type: application/json" -d '{"site_url":"<workers-url>","uri_allow_list":"<workers-url>/**"}'`
   (the access token is in the `Supabase CLI` macOS keychain entry / the CLI
   config; never print it).
4. Open the `…workers.dev` URL. Have the user run "Forgot password" with
   their work email, set a password, log in, and click through the core
   journey once on the LIVE app. Not done until they've seen it work.
   - **Built-in email is 2/hour, testing-only** (`rate_limit_email_sent=2`,
     no SMTP). A couple of reset attempts exhaust it and sends go silent. For
     the admin's FIRST login, don't fight it — mint the link directly:
     `POST /auth/v1/admin/generate_link {type:"recovery",email}` → build
     `<url>/auth/callback?token_hash=<hashed_token>&type=recovery&next=/reset-password`
     and hand it over (works because the callback handles the token-hash
     flow). Inviting real colleagues needs custom SMTP — a graduation item
     (RECIPES); flag it, don't improvise the user's SMTP secret in chat.
5. Set `NEXT_PUBLIC_SITE_URL=https://<worker>.workers.dev` in
   `.env.production.local` (ideally BEFORE the build so it's inlined) — auth
   emails and origin fallbacks carry the canonical URL.

## Wrap up

Explain the three FREE-TIER facts of life (plain language, once):

1. **Inviting colleagues:** the free tier's built-in email only delivers to
   YOUR own address — the Users screen's email invite won't reach others
   until custom SMTP is set up (graduation item). Until then: "ask me to
   _invite <email>_" — run `pnpm invite-link -- --email … --name "…"` and
   hand the admin the printed one-time link to forward (expires ~1 hour;
   promote roles afterwards in the Users screen). Never share accounts.
2. **The database sleeps when unused:** free Supabase projects pause after
   ~a week without activity; normal daily use keeps it awake. If the app is
   ever "completely down" after a quiet week, that's all it is — `/fix-it`
   wakes it (data is safe).
3. **This runs on YOUR free accounts** (Supabase + Cloudflare + GitHub).
   When the tool proves itself, the dev team migrates it to company
   accounts — the checklist is in `docs/template/HANDOFF.md`; nothing needs
   rebuilding.

Then:

- Claude PR review: the dev team must add a `CLAUDE_CODE_OAUTH_TOKEN` secret
  to the GitHub repo (until then that check skips, it doesn't fail). Give
  them one line to forward.
- Update `CLAUDE.md` "Current focus" (add the live URL) + `docs/PROGRESS.md`.
- Later deploys: just ask me to deploy — I run the verification loop first,
  then `pnpm run deploy`.

## If something is unfixable

Auth loops, org/billing walls, and permission errors on company accounts are
DEV-TEAM territory. After 3 failed attempts on the same step, stop and give
the user a copy-paste message for the dev team: which step, the exact error,
what you already tried.
