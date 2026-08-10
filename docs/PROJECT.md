# PROJECT.md — project-specific knowledge

> The counterpart to `docs/template/RULES.md` (which is overwritten on
> template updates). Everything THIS project learned the hard way goes here.
> Claude: when you hit a gotcha that cost more than 30 minutes and isn't
> project-specific, ALSO open an issue on the template repo quoting it.

## Gotchas

### The local Supabase stack needs three separate things on Windows 10 Home

Docker Desktop is only the last of them. On the owner's machine (Ryzen 5600X,
MSI MAG B550M MORTAR, Windows 10 Home 22H2) all three had to be dealt with, in
this order, and each failure looked like a different problem:

1. **The WSL2 Windows feature.** `wsl --install --no-distribution` needs
   administrator rights; run without them it prints nothing and silently does
   nothing, and `wsl --status` keeps showing the stub usage text. Elevate with
   `Start-Process wsl -ArgumentList '--install','--no-distribution' -Verb RunAs`.
   Then a **restart** is required — confirm with the `CBS RebootPending`
   registry key rather than guessing.
2. **The WSL2 kernel.** After the restart, `wsl --status` said "The WSL 2 kernel
   file is not found." Plain `wsl --update` goes through the Microsoft Store and
   hung indefinitely with no output; `wsl --update --web-download` downloads
   directly and works — but the install step also needs elevation, so run that
   elevated too.
3. **SVM Mode in the BIOS.** Docker Desktop then started and showed
   "Virtualization support not detected". Check it from Windows with
   `(Get-CimInstance Win32_Processor).VirtualizationFirmwareEnabled` — `False`
   means the firmware setting, not a Windows problem. On this MSI board it is
   **OC → CPU Features → SVM Mode → Enabled** (press Del at boot, F7 for
   Advanced mode, F10 to save). AMD calls it SVM; Intel calls it VT-x.

Also seen along the way: after a crashed Docker start, a dangling
`%LOCALAPPDATA%\docker-secrets-engine\engine.sock` reparse point made the
backend exit immediately with "remove …engine.sock: The file cannot be accessed
by the system". Windows cannot delete that file by any means, including the
`\\?\` long-path form, and it survives a reboot — move the whole
`docker-secrets-engine` directory aside instead and Docker recreates it. The
real error is in `%LOCALAPPDATA%\Docker\backend.error.json`.

**None of this blocks building.** The calculation engine, the sheet reader, the
renderer and all three exports were built and verified with no database at all;
migrations can be authored and linted (`pnpm migration-lint`) without applying
them. Only `pnpm db:reset`, `db:types:local` and anything that signs in actually
need the stack.

### `z.uuid()` rejects the template's own seeded ids — use `z.guid()`

Zod v4's `z.uuid()` validates the UUID **version and variant bits**, not just the
shape. The template's `supabase/seed.sql` hands out ids like
`00000000-0000-0000-0000-000000000001`, which are not valid v4 UUIDs — so every
server action guarding an id with `z.uuid()` silently rejects the seeded rows with
"Invalid UUID", while working perfectly on real rows (Postgres
`gen_random_uuid()` always produces valid v4).

Symptom: a feature works on imported/real data and mysteriously does nothing on
the seeded demo rows, with the failure swallowed by a toast that auto-dismisses
before you look. Cost about an hour, chasing an upload that had actually
succeeded.

Two fixes applied here, both worth keeping:

1. Id fields use **`z.guid()`**, which accepts any UUID shape and still rejects
   junk. Version bits carry no meaning for an opaque key we immediately look up
   in the database, where a bad id is simply "not found".
2. `supabase/seed.sql` now uses genuinely valid v4 ids
   (`11111111-0000-4000-8000-000000000001`), so seeded data is not a special case.

This affects the TEMPLATE, not just this project — `src/features/admin-users/`
had the same bug, meaning the Users screen could not promote a seeded dev user.
Fixed here; **report upstream**.

### Deploying to Cloudflare fails at RUNTIME when the bundle is built on Windows

Symptom: the deploy succeeds, the site loads `/` and redirects to `/login`
correctly, and then every rendered page returns **500**. `wrangler tail` shows:

```
Error: Dynamic require of "/.next/server/middleware-manifest.json" is not supported
```

What it is NOT: not the database, not the secrets, not RLS, not the middleware
file being named `proxy.ts`. `src/middleware.ts` is correct and the manifest is
present in the build output.

What it is: `@opennextjs/cloudflare` patches Next's manifest loads by matching
paths that end in `/server/<name>-manifest.json`, and inlines the contents. The
built worker contains those patches (`endsWith("/server/middleware-manifest.json")`
and friends). Something still reaches a raw `require()` for that path, which
esbuild cannot resolve inside the Workers runtime, and the shim throws. Removing
`src/middleware.ts` entirely does not remove the reference.

Ruled out, in this order, each with a clean rebuild (`rm -rf .next .open-next`):

1. Stale build directory from an earlier `next build` — no change.
2. **Next version outside the adapter's supported range** — this WAS a real
   problem and is worth keeping fixed: `@opennextjs/cloudflare@1.20.x` declares
   `next: ">=15.5.21 <16 || >=16.2.11"`, and the project was pinned to
   **16.2.10**, which falls in the excluded gap. Bumped to 16.2.12. It did not
   fix this error, but it removed an unsupported combination.
3. Building with no middleware at all — the manifest reference remains.

Strong suspicion: a **Windows-only path handling bug in the adapter**. The next
thing to try is building the same commit on Linux (WSL with a real distro, a
Linux machine, or GitHub Actions) and deploying from there — the Cloudflare
account, the Worker, the secret and the database are all already correct, so
only the build environment changes. This has NOT been tested yet; there is no
Linux distro on this machine (`wsl --install --no-distribution` was used for
Docker only).

**Root cause, proven since this was written:** the build HOST. Next bakes its own
`path.sep` into the build output, so a Windows build carries
`.next\server\middleware-manifest.json` while workerd — which is POSIX — looks
it up as `.next/server/middleware-manifest.json`. The lookup misses and falls
through to a dynamic `require()`, which workerd cannot do. Same commit built in a
Linux container: forward slashes, working site, and a bundle 412 KiB smaller.

**The rule: build on Linux.** Use the `deploy` GitHub workflow. Full analysis,
including the six theories eliminated first and how to avoid it on the next tool,
is in `docs/WINDOWS-VS-LINUX-BUILD.md`.

**Everything else in the go-live is done and working** — see docs/PROGRESS.md.

### The GitHub repository is public, and the local history is NOT publishable

`Alkuptan/Newsletters` is public. The local `master` history is not: while the
calculation engine was being built, the sample fixtures, the seed and several
tests carried real quotation references, invoice numbers and contract values for
five named El Gouna units, lifted from the live follow-up sheet. Those commits
still exist on the owner's machine and must never reach the remote.

So the published `main` is a **single scrubbed snapshot**, not the history, and
the two branches are deliberately unrelated. Publishing an update means making a
new commit whose tree is the current clean tree and whose parent is what is
already on `main`:

```sh
TREE=$(git rev-parse master^{tree})
COMMIT=$(git commit-tree "$TREE" -p origin/main -m "…")
git push origin "$COMMIT:main"        # a fast-forward; no --force, nothing lost
```

**Never `git push --force`, and never push `master` itself** — either publishes
the unscrubbed history. `git filter-branch`/`filter-repo` would clean it properly,
but it is a destructive rewrite and was deliberately not run.

Before any publish, run **`pnpm check:publishable`**. It fails the publish rather
than reporting; both of the things it looks for have leaked once already:

1. Every real figure, in every format it can take — plain, two-decimal, rounded,
   comma-grouped and underscore-grouped. A first pass matching only bare numbers
   missed the comma-grouped form — `"1,234,567 LE"` in shape — in the e2e spec,
   and quote numbers in two documents. **Do not quote a real figure here to
   illustrate the point.** Doing exactly that put one back into this file, and it
   was published before the check caught it.
2. Every secret-shaped value in `.env.local` and `.env.production.local` against
   every tracked file. `scripts/check-bundle-secrets.mjs` does this for the
   deploy artifact and is the model for it.

What is safe and expected to appear: the sheet's **column headers** and status
words (the tool must name them to read the sheet), and El Gouna's development
names (Ancient Hill, Cyan, Fanadir — public). Client and PM names in fixtures are
invented, and `public/dev-samples/*.jpg` are generated placeholders, not site
photos.

### The `deploy` workflow on GitHub needs six repository secrets

`.github/workflows/deploy.yml` reads `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`,
`SUPABASE_SECRET_KEY`, `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. **None
are set yet**, so the documented "Actions → deploy → Run workflow" route cannot
run; today's deploys are built in a Linux Docker container on the owner's machine
and uploaded from there. `ci.yml` needs no secrets and is green.

## Graduation triggers

<!-- Requests the scope guard blocked (RULES.md). Each becomes an agenda item
when the dev team gets involved. -->

### Sending the newsletter email to clients from the tool

Asked for on 10 August 2026: the tool composes the covering email, puts the
newsletter image in the body, attaches the PDF, addresses it **To** the unit's
client(s) and **CC**s the project manager, that manager's manager and a standing
list, then sends it.

Three separate scope-guard lines at once, which is why it is here and not built:

- **an email pipeline** — delivery, bounces, retries, a sending domain, SPF/DKIM
  and a suppression list. Supabase's built-in mail reaches only the project
  owner's own address, twice an hour (see RULES.md, free-tier facts), so this
  needs real SMTP or a provider;
- **external, non-employee recipients.** `docs/SPEC.md` draws its boundary at
  "any client or non-employee access", and mail addressed to a client crosses it.
  A wrong address or a stale figure reaches a paying customer directly, with no
  step in between where anyone notices;
- **client PII** — names and email addresses for 317 units, held in a database on
  a personal free-tier account that has no automatic backups.

**What version 1 does instead, and it is most of the value:** the tool prepares
the message and a person presses Send in Outlook. The covering note is generated
per unit with the client's name, title and the edition date; the newsletter image
and the PDF come out already named `<Unit> Newsletter`; and the addressee list is
worked out and shown for copying. Nothing leaves the building without a human
seeing it, and no client address needs to be stored to make it work.

**Revised 10 August 2026, after the owner answered the objections.** They send
about ten a day, one at a time, from their own Orascom mailbox, already doing it
by hand; they accept responsibility for a wrong send; and clicking each one
individually keeps a human in front of every message. That answers the volume and
the accountability concerns, and it leaves a purely technical blocker:

**Sending as a person's own `@elgouna.com` address needs Orascom IT to enable one
of three things. There is no self-service route.**

| Route                                   | What it needs                             | Note                                                                                                                             |
| --------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Microsoft Graph `Mail.Send` (delegated) | an Entra app registration                 | the owner tried and got **401, "You don't have access"** — user app registration is off on the OrascomDH tenant                  |
| SMTP AUTH on the mailbox                | an admin to switch it on for that mailbox | Microsoft disables SMTP AUTH tenant-wide by default; also means a password held as a Worker secret, which the tool should not do |
| A sending service (Resend, SES…)        | SPF/DKIM DNS records on `elgouna.com`     | without them, mail claiming to be from `@elgouna.com` is spoofing: it lands in junk and harms the domain's reputation            |

The first is the one to ask for. It sends **as the signed-in person**, needs no
password anywhere, and the same app registration covers reading the unit photo
folders and client contacts — so it is one IT request, not three.

**Until then, what the tool does instead** gets it to one click without any of the
above: an **Open in Outlook** button opens Outlook on the web with the To, Cc,
subject and message already filled, from any machine rather than only the laptop.
A URL cannot carry a file, so the JPG and the PDF are attached by hand. That is
the only manual step left, and only the app registration removes it.

**True threading also needs the tool to send.** Continuing an existing
conversation means setting the `In-Reply-To`/`References` headers on a real
message, which a compose link cannot do. What works today: keep each unit's
subject byte-identical (`{unit} Newsletter`, the default) and Outlook groups that
unit's newsletters under one conversation topic. Grouping by subject, not real
threading — good enough to find the history, not the same thing.

The dev-team version is worth doing properly: delegated Graph send, a per-unit
send log with the message id so replies thread correctly, a bounce report, and
client contacts held wherever the company already holds them rather than a second
copy here.

### Pulling data out of the internal programme system

Also asked for on 10 August 2026: read client names and email addresses (a unit
can have several of each) from the internal system, rather than typing them.

Same dependency as the photos below, for the same reason: an Orascom IT
credential. Reading a company system of record is not something the owner can
self-serve — the Azure route was tested and returned 401 (see below). Until then
the tool takes client names from a **`Client Name`** column in the sheet, which
is a copy-and-paste the owner already controls.

Worth asking IT for both in one conversation: a read credential for the unit
photo folders **and** a read credential (or a scheduled export) for client
contacts. Two asks, one meeting.

### A live sheet the tool re-reads on a schedule

The owner would prefer to keep the sheet in a shared folder and have the tool
re-read it automatically instead of uploading it.

The blocker is not the schedule — one cron job is inside the paved road. It is
**reaching the file**: a sheet in a SharePoint or OneDrive team folder needs the
same app registration as the photos. Two things would make it possible without
IT, and both are the owner's call rather than a build task:

1. the file shared as **"anyone with the link"**, which for a spreadsheet holding
   every unit's contract value is a decision to take deliberately, not casually;
2. or a copy of the sheet published to a location the tool can already read.

Until one of those exists, the upload stays. It is one file and one click, and it
has the advantage that the owner knows exactly which version the newsletters were
built from — a scheduled pull would silently change figures under a cycle.

### Reading photos straight out of SharePoint / OneDrive

Version 1 has the owner save photos out of the unit's folder and add them with the
picker (a folder chooser, so it is one selection per unit). Reading the folder
automatically would need a **Microsoft Entra app registration from Orascom IT**.

This was tested, not assumed. The real folder link for Ancient Hill 56 —
the unit's SharePoint folder
— returns **403 Forbidden** with `X-Forms_Based_Auth_Required` to an
unauthenticated request. It is a team-site document library, not an
"anyone with the link" share, so no anonymous route exists: not Graph
(`/shares/u!…` needs a bearer token), not the web URL, and not a client-side
fetch (SharePoint sends no CORS headers for our origin).

What it would take: an app registration with `Sites.Selected` or `Files.Read.All`,
admin consent, and a client secret held as a Worker secret. That is an IT
conversation and a real dependency, which is why it sits here rather than in the
tool.

**There may be a route that avoids IT — worth ONE experiment before assuming
otherwise.** Microsoft distinguishes two things people conflate:

- **Application** permissions (the app reads any file in the tenant) always need a
  global admin's consent. That is the IT ticket.
- **Delegated** permissions (the app reads only what the signed-in person can
  already see) do not always. `Files.Read.All` and `Sites.Read.All` are documented
  as delegated permissions a _user_ may consent to for themselves.

So if the tenant leaves two defaults on — "users can register applications" and
"users can consent to apps accessing company data on their behalf" — the owner
could create the app registration themselves in the Azure portal, sign in to the
tool with their own Orascom account, and the tool would read exactly the folders
they can already open. No admin, no client secret (a public client with PKCE).

**Tested, and the answer is no.** The owner opened
portal.azure.com → Microsoft Entra ID → App registrations → New registration and
got **"You don't have access"**, error code **401**, on the OrascomDH tenant. User
app registration is switched off. So this genuinely needs an IT request; there is
no self-service route. Closed.

### The wider programme system

The owner's stated end goal is the whole Extra Works programme on one tool, with
every PM reaching their own units and a read-only view for the board and upper
management. The newsletter is one part of that. The roles are already built for it
(admin / project_manager / member-as-viewer), but the rest is a dev-team
conversation — see `docs/template/HANDOFF.md`.

_None yet._
