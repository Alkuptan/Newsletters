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

### `pnpm run deploy` on Windows ships a broken site — use `pnpm run upload`

Knowing that the bundle must be built on Linux was not enough to prevent shipping
a Windows one, because **`deploy` rebuilds before uploading**. Its chain is
`build:cf && … && opennextjs-cloudflare deploy`, so running it on Windows quietly
replaced a good Linux build with a broken Windows one and uploaded that. On
5 September this took the live site down: `/login` returned 500 until the Linux
build was uploaded again.

The only visible hint at the time was the gzipped size — **~2,670 KiB from Linux,
~3,080 KiB from Windows** — and the secrets guard reporting 10,642 files scanned
instead of 2,382. Both are meaningless unless you already know the numbers.

So the artefact is now checked rather than the intention:

- **`pnpm run upload`** — uploads what is already in `.open-next`, refusing if it
  was not built on Linux. This is the command to use after the container build.
- **`pnpm run deploy`** still builds first, and now fails at the guard on Windows
  instead of shipping. It remains correct on Linux and in CI.

`scripts/check-linux-build.mjs` looks for `.next\server\…-manifest.json` baked
into `handler.mjs`, which is Next writing its own `path.sep` into the output. Its
first version used a regular expression and a shell heredoc turned `\\+` into
`\+` on the way to disk, so it matched a literal plus sign and passed everything
— a guard that guarded nothing. It now uses `String.raw` and plain substring
searches, and was tested against a real Windows build before being trusted.

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

### Writing `.env.local` from PowerShell corrupts it two different ways

Both hit while bootstrapping the second laptop, and both look like "Supabase is
not configured" rather than like a file-writing problem.

1. **`Out-File -Encoding utf8` writes a BOM.** Windows PowerShell 5.1's `utf8`
   means utf8-WITH-BOM, and the Supabase CLI refuses the file with
   `failed to parse environment file: .env.local (unexpected character '»' in
variable name)`. Use
   `[System.IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding($false)))`,
   or write it from bash.
2. **A regex that silently captures nothing writes empty values.** Parsing
   `supabase status -o env` in PowerShell and getting the capture group wrong
   produces `NEXT_PUBLIC_SUPABASE_URL=` with nothing after it. The file still
   parses, `pnpm db:reset` still works — and only `pnpm dev` fails, at runtime,
   with "Your project's URL and Key are required to create a Supabase client!"

**Verify by length, never by comparison against the old file.** Checking the new
value against the old one with a `-match` is worthless: an empty pattern matches
any string, so an empty value reports as "unchanged". Print the character counts
instead — the URL is 22, the publishable key 46, the secret key 41 — and refuse
to write the file if any of them is zero.

### Classic Outlook's offline file — why the newsletters never threaded

The reply-chain macro (`docs/outlook-macro/`) was blamed for months of
newsletters opening as new emails. It was not the macro. Diagnosed on the
owner's PC on 10 September 2026, by driving Outlook read-only over COM from
PowerShell — which is worth knowing about on its own, because it tests the
macro's exact logic without installing the macro.

**What was actually wrong, in order of how much it mattered:**

1. **The offline file had stopped syncing, at two different dates.** Sent Items
   held 1,934 items and nothing after **28 March 2026**; the Inbox stopped at
   **1 August 2026**. The file was **38.24 GB**, and Outlook had recorded that
   exact path in `HKCU\Software\Microsoft\Office\16.0\Outlook\PST` under
   **`LastCorruptStore`** — Outlook's own note that it considers the store
   damaged. Two folders frozen at two different dates is the signature of a
   damaged store rather than a view filter or a rule, which is what the obvious
   diagnostics chase first.

   This is fatal to the macro specifically, because the macro finds last cycle's
   newsletter by searching **Sent Items**. Nothing since March is in there to
   find, so every recent unit opens as a new message no matter how correct the
   macro is. Reading a message's `PR_INTERNET_MESSAGE_ID` **hangs indefinitely**
   on a store in this state: the subject and sent date come from the folder
   index and return instantly, but anything needing the message's own headers
   goes to the server and never comes back.

2. **The macro was never installed.** No `VbaProject.OTM` existed anywhere in
   `%APPDATA%\Microsoft\Outlook\`.

3. **The macro has no double-click hook, and never did.** It is a plain
   `Public Sub` for a ribbon button — there is no `Application_ItemLoad` and no
   `NewInspector` handler in it. So _double-clicking the downloaded `.eml` can
   never produce a reply_, by design: the file opens as an ordinary draft. The
   documented workflow is download the file, then click the **button**. Anyone
   reasoning from "I double-click it and the macro runs" will misdiagnose this
   completely, and a handover document written from that assumption did.

**What was verified as working**, so it never needs re-testing: enumerating
every store, `GetDefaultFolder(olFolderSentMail)` skipping the Public Folders
store cleanly, and the DASL filter
`@SQL="urn:schemas:httpmail:subject" like '%…%'` — which returned **1,328**
newsletters. The historical subjects are already `<Unit> Newsletter`, matching
the tool's `{unit} Newsletter` default exactly, so the subject convention is
sound. The macro's search logic is correct; it was searching an empty cupboard.

**The disk-space trap in rebuilding the file.** The standard fix is to rename
`Outlook.ost` and let Outlook re-download it. Renaming keeps the old 38.24 GB on
disk while a new one downloads, and there were **52.4 GB free** — so a full
re-download would have left about 14 GB, with no margin. **Reduce
Account Settings → "Mail to keep offline" to a year or less FIRST**, then
rebuild. Doing it in the documented order fills the disk.

**Order of preference for a fix**, given the owner has already moved to new
Outlook (which cannot run macros at all — no VBA engine, no COM add-in host,
and Microsoft's guidance names Power Automate, Graph and Office.js as the
replacements):

- The macro is the only route that needs nothing from IT, but it needs a healthy
  offline file and classic Outlook, and classic's support ends in 2029.
- **Delegated Microsoft Graph, draft-only, is the better target.** It needs no
  app registration: the Graph PowerShell SDK signs in through a first-party app
  that already exists in every tenant, so the **401 recorded below for
  _creating_ an app registration does not close this route** — it is a different
  mechanism and must be tested separately, with
  `Connect-MgGraph -Scopes "Mail.ReadWrite"`. Ask for `Mail.ReadWrite` and not
  `Mail.Send`, so the script is structurally incapable of sending.
- **The end state worth building** is neither: have the tool store each unit's
  previous `Message-ID` and write real `In-Reply-To`/`References` into the
  `.eml`. Then threading needs no macro, no classic Outlook and no send-time
  script — the owner double-clicks the file exactly as they do now, from any
  machine. It needs only **read** access to fetch the ids, which is a smaller
  ask than anything above.

  **This is what was built, on 13 September 2026** — see "Sending the newsletter
  email to clients from the tool" below, and `docs/plans/005-real-thread-replies.md`.
  It is **confirmed working, and only in classic Outlook** — the open question
  about whether Outlook carries those headers from a file through to sending was
  settled by three real sends, and the answer differs by which Outlook opens the
  file. See "Which Outlook opens the file decides whether it threads" below.

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

### The workaround that does not need permission: hand Outlook a message file

Being signed in to Outlook and OneDrive on the org laptop does **not** grant this
tool any permission. Consent is granted to an app identity at the tenant, not to a
device — so no app registration means no Graph token, whoever is signed in where.

But the signed-in desktop apps can be used as the BRIDGE, and that is the whole
workaround. It is already how photos work (OneDrive syncs the folders, the tool
reads them off disk), and it is now how mail works:

**The tool builds a `.eml` file and the browser downloads it. Opening it gives a
finished Outlook draft** — addressed, written, the newsletter shown in the body,
the PDF attached — and the person presses Send. Two headers make it behave:

- **`X-Unsent: 1`** — Outlook opens it in compose mode with a live Send button
  instead of read-only. Without this header the file is useless.
- **no `From:`** — Outlook fills in the signed-in account, so it sends from the
  person's own mailbox with their own signature. Nothing is impersonated, no
  password is stored, and no permission is needed, because **Outlook is doing the
  sending, not the tool**.

Verified end to end: an 803 KB file whose inline part is a valid 3200 × 1800 JPEG
and whose attachment is a valid PDF. `src/lib/newsletter/eml.ts` builds it and is
unit-tested for the things that fail silently — header injection, non-ASCII
subjects, CRLF, and base64 line length.

A compose LINK (`mailto:` or the Outlook web deeplink) is kept alongside for a
machine with no Outlook installed, but a link can never carry a file, and saying
otherwise was a mistake made once in this project's history.

**True threading — solved on 13 September 2026, and not the way this section
expected.** A real reply carries `In-Reply-To`/`References` pointing at the
previous message's `Message-ID`, which exists only after Exchange has sent
something. That was written up as needing Graph, and it did; what changed is that
Graph became available.

The Microsoft 365 connector is authorised for this account with `Mail.Read`,
`Mail.ReadWrite`, `Mail.Send`, `Files.Read.All` and `Sites.Read.All` — so the
**401 recorded below closes only the "create your own app registration" route,
not delegated Graph as a whole**. A pre-approved app with admin consent works.
Several conclusions in this file were drawn too broadly from that 401 and are
marked where they appear.

What makes it cheap: **`PMOTeam@elgouna.com` is CC'd on every newsletter**, so
that mailbox already holds a copy of each one carrying its `internetMessageId`.
No shared-mailbox permission is needed, and it reads Microsoft's servers rather
than the damaged local store.

So the design is: the id is captured outside the tool, stored per unit
(`units.thread_message_id`, migration 0018), and written into the `.eml` as
`In-Reply-To`/`References`. The owner opens the file and presses Send exactly as
before, and it lands in the thread. `scripts/import-thread-ids.mjs` does the
matching; it refuses to guess, because `Ancient Sands 192A` and `192B` are
different clients and a wrong anchor shows a paying customer someone else's
conversation.

#### Which Outlook opens the file decides whether it threads

Proven by three real sends of the same unit on 13 September, compared by
`conversationId` against the previous newsletter:

| Opened with         | Conversation                         |
| ------------------- | ------------------------------------ |
| **new** Outlook     | a NEW one — threading lost           |
| **classic** Outlook | the SAME one as August — threaded ✅ |

The reason is visible in what each one sent. New Outlook rewrote the body into
its own editor (`class="elementToProof"`, a `<div id="Signature">`) and renamed
the attachments to `image.png` — it **rebuilt the message**, and the two reply
headers went with the original. Classic sent the file as written:
`WordSection1` markup, attachments still named `<Unit> Newsletter.jpg` / `.pdf`.

So an earlier claim in this file — "no macro, no classic Outlook, from any
machine" — was **wrong**, and was written before the test existed. The file route
needs a mail program that sends the file rather than re-composing it. Classic
Outlook does; new Outlook does not.

A second thing the test settled: **opening the file adds no signature at all**.
The sent message ended "Kind Regards," and nothing. So the tool's own sign-off
(Email screen → Your sign-off) is not optional — without it clients get unsigned
newsletters.

#### The macro is not superseded after all — it covers the units with no anchor

A unit the tool has no `thread_message_id` for cannot thread on double-click;
there is nothing to point at. That is every unit not sent since the anchors
started being recorded — 305 of 344 at the time of writing.

`ReplyIntoSelectedThread` in `docs/outlook-macro/` closes that gap: the owner
finds the unit's conversation, clicks any message in it, and one button puts this
cycle's wording, picture and PDF into a reply on that thread. It is deliberately
the _manual_ counterpart to `SendNewsletterInThread`, which searches Sent Items
and therefore depends on the offline file being healthy — the thing that failed
here.

**Using it once fixes that unit permanently.** The reply lands in the thread with
PMOTeam copied, so the next run of `import-thread-ids.mjs` picks it up as the
unit's anchor and the following cycle threads on double-click. The coverage gap
closes itself as the cycle is worked through; it does not need a bulk fix.

Two traps it guards against explicitly, because both are silent:

- replying into **the wrong unit's** conversation — it shows both subjects and
  says in as many words when they do not match;
- replying to **the unsent draft** rather than the thread, which is the likeliest
  mistake: the draft from the double-click is the active window, so Outlook hands
  the macro that unless it checks `MailItem.Sent`.

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
