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

## Graduation triggers

<!-- Requests the scope guard blocked (RULES.md). Each becomes an agenda item
when the dev team gets involved. -->

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
