# Go-live log — Unit Newsletter Studio

What it took to put this tool on the internet on **8–9 August 2026**, written for
the IT team. It records two things: **every point where a human had to step in**,
and **every defect found on the way**, because both matter if this is ever
repeated, audited, or taken over.

**Live:** https://newsletter-system.pmoteam.workers.dev
**Runs on:** Cloudflare Workers + Supabase (Postgres, Auth, Storage), both on
**personal free accounts** — see _Hand to IT_ at the end.

---

## Tags

Six labels, used throughout. Scan for `#it-request` and `#open` first.

| Tag               | Meaning                                                             |
| ----------------- | ------------------------------------------------------------------- |
| `#owner-action`   | Only the tool's owner could do it — a sign-in, a decision, a click. |
| `#dashboard-only` | A web console click. No API or CLI route existed for it.            |
| `#it-request`     | Needs the IT team. Outside what the owner can grant themselves.     |
| `#platform-bug`   | A defect in a third-party tool, not in this project.                |
| `#windows`        | Happens only because the machine is Windows.                        |
| `#free-tier`      | A limit of the free plan, not a design choice.                      |
| `#open`           | Still outstanding.                                                  |

---

## Part 1 — where a human had to step in

### 1. Signing in to Supabase and Cloudflare `#owner-action`

Both CLIs refuse to sign in without an interactive terminal. Supabase says so
outright:

> Cannot use automatic login flow inside non-TTY environments.

So the owner ran two commands in their own PowerShell, each opening a browser to
approve. Deliberately **not** solved by passing an access token through the chat
— a token in a transcript is a leaked credential.

**Snag:** the first attempt failed with _"pnpm is not recognized"_. The
PowerShell window had been opened **before** pnpm was installed and was holding a
stale copy of the system PATH. Worked around by calling the project's own copies
(`.\node_modules\.bin\supabase.CMD`), which need no PATH at all. `#windows`

### 2. Choosing which Supabase organisation to use `#owner-action`

Two existed — a work one and a personal one. A judgement call about who else can
see the project, so it was the owner's to make. They chose the work
organisation.

### 3. Pointing sign-in emails at the live site `#owner-action` `#dashboard-only`

A new Supabase project ships with its Site URL set to `localhost:3000`, so the
first password-reset email would have linked to a machine that isn't there.

This _should_ have been automatable via the Management API, but two attempts to
reach the stored access token were **blocked by an automated safety check** —
correctly, since reading credentials out of Windows Credential Manager is
indistinguishable from credential theft. So the owner set it by hand:
Authentication → URL Configuration.

### 4. Closing public sign-up — and the incident that followed `#owner-action` `#dashboard-only`

The tool is invite-only, so public registration had to be switched off. **This is
the step that went wrong and is the most important entry in this log.**

Supabase has two different switches that sound alike:

- **Enable email provider** — controls whether email/password works _at all_,
  both sign-up and sign-in.
- **Allow new users to sign up** — controls only whether strangers can register.

The instruction given pointed at the wrong one. The **whole Email provider** was
turned off, which silently disabled **password sign-in for everybody**.

It was hard to spot because the owner's own PC kept working perfectly — it was
running on a session cookie, which never needs a password. Only a second device
revealed it, as _"wrong password"_ on every account.

**Made worse by a bad verification.** Sign-up had been "confirmed closed" by
attempting to register and seeing it refused. The refusal was
`email_provider_disabled` — _the whole door is shut_, not _sign-ups are shut_ —
and it was read as success. A wrong check is worse than no check.

Diagnosed properly by creating a throwaway account with a known password and
calling the password grant directly, which answered _"Email logins are
disabled."_ Fixed with a second dashboard visit. Two clicks, but a full working
day of confusion between them.

### 5. Decisions about publishing `#owner-action`

Two questions only the owner could answer, both irreversible once pushed:

- **Should the repository be public?** They chose public.
- **Should the real follow-up sheet go with it?** They chose no.

Choosing public then required a scrub, because the code carried real client
names, six real villa photos, project-manager names and the internal SharePoint
library address. Those were replaced with invented names and placeholder images,
the SharePoint address was redacted, and `Sample/` was excluded — with the one
test that reads it changed to skip when it is absent.

### 6. Creating a Cloudflare API token `#owner-action` `#dashboard-only`

Needed so GitHub can deploy without a human. Only creatable in the Cloudflare
console. Handed over via a file on disk rather than pasted into the chat, so the
token never entered the transcript.

---

## Part 2 — defects found and fixed

None of these were visible before attempting a real deployment.

### 7. The deploy command was broken on Windows `#windows`

The npm script chained two commands inside single quotes. Windows `cmd.exe` does
not understand single quotes: it split on the inner `&&` and passed the trailing
quote to the next command, which failed as `Unknown command: deploy'`. Now
chained at the script level, which both shells handle.

### 8. Next.js was on a version the Cloudflare adapter excludes `#platform-bug`

`@opennextjs/cloudflare` supports `next >=15.5.21 <16 || >=16.2.11`. The project
was pinned to **16.2.10** — inside the excluded gap. Nothing warned about it.
Moved to 16.2.12.

**For IT:** check `npm view @opennextjs/cloudflare@latest peerDependencies`
before any Next upgrade.

### 9. The bundle was over Cloudflare's size limit `#free-tier`

3164 KiB against a hard 3072 KiB ceiling — rejected. The culprit was a
development-only design-preview page: 107 KiB of a 3 MiB budget, shipped despite
returning 404 in production. Dev-only pages now use a `page.dev.tsx` suffix and
are absent from production builds entirely.

### 10. A Windows-built bundle deploys fine and then fails on every request `#platform-bug` `#windows`

**The single biggest obstacle.** The deploy succeeded, the site loaded, and every
page returned 500:

> Error: Dynamic require of "/.next/server/middleware-manifest.json" is not supported

The Cloudflare adapter inlines Next's manifests by matching paths ending
`/server/<name>-manifest.json`. A **Windows** build writes them as
`.next\server\...` with backslashes, so the match never fires and it falls
through to a `require()` the Workers runtime cannot perform.

Confirmed by building the identical commit inside a Linux container: forward
slashes, a working site, and a bundle 400 KiB smaller.

**Consequence, and the one rule to carry forward: this project must be built on
Linux.** A GitHub Actions workflow (`.github/workflows/deploy.yml`) now does
exactly that, so it cannot recur.

### 11. Invited people were confirmed, signed in, and locked out `#platform-bug`

Supabase's default recovery and invite emails hand the session back in the part
of the address after `#`. Browsers never send that to a server — so the app's
server-side callback saw an empty link, assumed it was broken, and redirected to
the login page.

The result was worse than a dead link: the first invited colleague's account was
created, confirmed and marked signed-in, yet they never reached the set-password
screen. No password ever existed, and they could not get back in. The same hid
the admin's missing password behind a working session on one PC.

Fixed by adding a page that runs in the browser, reads the fragment, completes
the sign-in, and continues — then verified end to end against the live site.

---

## Part 3 — hand to IT

Nothing here is broken. These are the things a personal free-tier setup cannot
answer, listed so IT can decide what to adopt.

| Item                                                                                                            | Why it matters                                                                                                                                                                                                                                                                          | Tag                        |
| --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| **Accounts are personal.** Supabase org "Town Team's Org", Cloudflare `pmoteam@elgouna.com`, GitHub `Alkuptan`. | Continuity. If the owner leaves, so does the tool. Migration checklist is in `docs/template/HANDOFF.md`.                                                                                                                                                                                | `#it-request`              |
| **No company SMTP.**                                                                                            | Built-in email is rate-limited and unreliable for colleagues; invites currently work by forwarding a one-time link by hand.                                                                                                                                                             | `#it-request` `#free-tier` |
| **No automatic backups.**                                                                                       | Free Supabase takes none. Once this holds real programme records, that is a gap.                                                                                                                                                                                                        | `#it-request` `#free-tier` |
| **The database sleeps.**                                                                                        | Free projects pause after about a week of no use. Daily use prevents it; the data is safe either way.                                                                                                                                                                                   | `#free-tier`               |
| **SharePoint photo access is blocked.**                                                                         | Reading unit photo folders directly needs a Microsoft Entra app registration. The owner tried to self-register and got **401, "You don't have access"** — user app registration is disabled on the OrascomDH tenant. Until IT grants this, photos are imported by pointing at a folder. | `#it-request`              |
| **Deploys must run on Linux.**                                                                                  | See item 10. Use the GitHub `deploy` workflow, never a developer's Windows machine.                                                                                                                                                                                                     | `#windows`                 |

---

## Still outstanding `#open`

- The GitHub repository has not been created or pushed yet. Both prerequisites
  (GitHub sign-in, Cloudflare API token) are now in place.
- The repository secrets for the deploy workflow are not yet set.
- `CLAUDE_CODE_OAUTH_TOKEN` is not set, so the automated code-review workflow
  will skip rather than run. It fails gracefully; nothing breaks.

---

## The short version

Nine things needed a human. **Two** were unavoidable and correct — the CLI
sign-ins, and the decisions about what to publish. **Four** were dashboard-only
settings that no API would do. **One** was a mistake in the instructions given,
which disabled sign-in for everyone for several hours. The remaining defects were
all found by trying to actually use the deployed site, not by reading code — and
the largest of them, the Windows build, would have made the tool permanently
unusable had it not been traced to the build machine.
