# Why this project must be built on Linux

A full analysis of the defect that cost the most time during go-live: a
deployment that **succeeds, reports no error, and then fails on every single
request** — purely because the bundle was built on Windows.

Written for the IT team and for whoever inherits this project. It covers what
happened, the proven mechanism, what was eliminated on the way, how it was
solved, whose fault it actually is, and — the part that matters — how to stop it
happening on the next tool.

---

## 1. The answer in one paragraph

Next.js writes file paths into its build output using **the separator of the
machine that ran the build**. On Windows that is a backslash. The Cloudflare
Workers runtime (`workerd`) is POSIX — its `node:path` always produces forward
slashes. So a bundle built on Windows carries `.next\server\middleware-manifest.json`
in its baked-in data, while at runtime the same file is looked up as
`.next/server/middleware-manifest.json`. The lookup misses, execution falls
through to a dynamic `require()`, and `workerd` cannot do dynamic requires. Every
page returns 500. Nothing in the build or deploy reports a problem, because
nothing _is_ wrong until the code runs.

---

## 2. What was actually observed

The deploy was flawless:

```
Total Upload: 12463.42 KiB / gzip: 2645.89 KiB
  https://newsletter-system.pmoteam.workers.dev
Current Version ID: 4612c4ec-…
```

The site then behaved like this:

| Request          | Result                                           |
| ---------------- | ------------------------------------------------ |
| `GET /`          | **307** → `/login` (correct — the auth gate ran) |
| `GET /login`     | **500**                                          |
| every other page | **500**                                          |

That combination is what made it confusing. The redirect proves the Worker was
running, the middleware executed, and the routing was right. Only _rendering_
failed. It looks like an application bug, so that is where the search starts —
and there is no application bug.

`wrangler tail` gave the only honest signal:

```
GET /login - Ok
  (error) ⨯ Error: Dynamic require of "/.next/server/middleware-manifest.json" is not supported
```

Note the path: `/.next/server/…`, rooted at `/`. In `workerd` the working
directory is `/`, so this is Next computing a path at **runtime** with POSIX
semantics — while the build had recorded it with backslashes.

---

## 3. The proof

The same commit, the same `@opennextjs/cloudflare` 1.20.2, the same Next 16.2.12,
built twice. This is the entire difference:

**Built on Windows:**

```
".next\\server\\functions-config-manifest.json",".next\\server\\middleware-manifest.json",…
```

**Built on Linux (Docker, `node:22-bookworm`):**

```
".next/server/functions-config-manifest.json",".next/server/middleware-manifest.json",…
```

Two further measurements from the same comparison:

- Both bundles contained **56** inlined manifest branches — so the adapter's
  inlining ran identically on both. This is worth stating because it **rules out**
  the obvious theory that the Windows build simply failed to find the files.
- The adapter's own separator normalisation was generated correctly for each
  host: `replaceAll("\\","/")` on Windows, `replaceAll("/","/")` (a no-op) on
  Linux — 26 occurrences each.

So the adapter is **not** naive about this. It actively tries to handle it. The
coverage is just incomplete, and the gap is only reachable at runtime.

**One honest limitation:** the exact lookup that falls through was not isolated
to a single line of the adapter. Doing so means stepping through its AST-based
patches, which is upstream maintainer work. What _is_ proven is the class of
fault and the decisive variable — the build host — and that is enough to act on.

---

## 4. The mechanism, layer by layer

Four independent facts have to line up. Remove any one and this never happens.

**Layer 1 — Next bakes host paths into data.**
`required-server-files.json` and similar artefacts contain a literal list of file
paths, written with `path.join` on the build machine. On Windows those are
backslash-separated. This is not a bug in Next; those files are meant to be
consumed on the machine that produced them.

**Layer 2 — the deployment target is a different operating system.**
The artefact is not consumed where it was built. It is uploaded to `workerd`,
where `node:path` is POSIX. Any path computed at runtime uses forward slashes.
The build-time assumption silently stops holding.

**Layer 3 — the adapter bridges this by string matching.**
`@opennextjs/cloudflare` cannot ship a filesystem, so it rewrites Next's
file-reading code into inlined lookups. Its generated code looks like:

```js
function loadManifest(path, …) {
  path = path.replaceAll("\\", "/");                       // host separator → POSIX
  if (path.endsWith("/server/middleware-manifest.json")) {
    return { /* the manifest, inlined at build time */ };
  }
  …
}
```

That is a **string comparison standing in for a filesystem**. It works only if
every path that reaches it has been normalised the same way. Where a path arrives
from a source the patch does not cover, the comparison quietly returns false.

**Layer 4 — the fallback is fatal, not graceful.**
A missed match falls through to Next's original `require(path)`. esbuild bundles
that as a shim which throws:

```js
throw Error('Dynamic require of "' + x + '" is not supported');
```

So a _string mismatch_ becomes a _hard runtime crash_. There is no degraded mode,
no warning, no fallback read.

---

## 5. Why the build and deploy both reported success

This is the important part for anyone designing a pipeline.

- **The build succeeded** because generating a string comparison that will never
  match is not an error. The code is syntactically valid and type-correct.
- **The deploy succeeded** because `wrangler deploy` uploads a bundle. It checks
  size and syntax. It does not execute a request.
- **`pnpm verify` passed** — 219 unit tests, lint, typecheck. None of them touch
  the adapter; they test our code, which was never wrong.
- **`pnpm dev` worked perfectly** — but `next dev` never invokes
  `opennextjs-cloudflare build` at all. It is a different runtime with a real
  filesystem. Local success carried **zero** information about this failure.

Every green light in the pipeline was truthful about what it measured. Not one of
them measured "does the deployed thing serve a page?"

---

## 6. What was eliminated on the way

Recording the dead ends, because they are the expensive part and the next person
should skip them.

| #   | Theory                                                                       | How it was eliminated                                                                                                                                                             | Verdict                |
| --- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| 1   | Stale `.next` from an earlier `next build`                                   | `rm -rf .next .open-next`, rebuilt, redeployed                                                                                                                                    | Not it                 |
| 2   | Wrong middleware filename (`proxy.ts` vs `middleware.ts`, a documented trap) | `src/middleware.ts` — already correct                                                                                                                                             | Not it                 |
| 3   | The manifest missing from the output                                         | Found present at `.open-next/…/.next/server/middleware-manifest.json`                                                                                                             | Not it                 |
| 4   | Unsupported Next version                                                     | **Real, and fixed.** The adapter allows `>=15.5.21 <16 \|\| >=16.2.11`; the project was pinned to **16.2.10**, inside the excluded gap. Upgraded to 16.2.12 — the error persisted | Real bug, not this one |
| 5   | The middleware itself                                                        | Deleted `src/middleware.ts` entirely, rebuilt — the manifest reference survived                                                                                                   | Not it                 |
| 6   | The adapter failing to inline manifests on Windows                           | Counted branches in both bundles: **56 each**                                                                                                                                     | Not it                 |

Only after six eliminations did the build **host** become the suspect — because
it was the last variable left.

A worthwhile aside: eliminating (4) surfaced a genuine second defect that would
have caused trouble later. Being wrong carefully is not wasted.

---

## 7. How it was solved

**Immediately** — build inside a Linux container, using the Docker that was
already installed for the local database:

```bash
docker run --rm \
  -v "H:\Claude Apps\Newsletter system\Newsletters-main:/app" \
  -v newsletter_nm:/app/node_modules \
  -w /app node:22-bookworm \
  bash -lc "corepack enable && pnpm install && pnpm exec opennextjs-cloudflare build"
```

The named volume for `node_modules` matters: it shadows the Windows-installed
dependencies, so the container gets Linux binaries while the source stays on the
host. The resulting `.open-next` lands back on the host and is deployed with the
already-authenticated `wrangler` from Windows.

Result: forward slashes, a working site, **and a bundle 412 KiB smaller** (2645
KiB vs 3057 KiB gzipped) — comfortably clear of Cloudflare's 3 MiB ceiling
instead of scraping under it.

**Permanently** — `.github/workflows/deploy.yml` builds on `ubuntu-latest`, so a
Windows machine is never in the deployment path. That workflow also:

- runs `pnpm verify` before building, so a broken build cannot ship;
- greps the finished bundle for the service-role key and **refuses to deploy** if
  it is present;
- and, after deploying, requests `/login` and fails the run unless it returns
  **200** — the check whose absence let this reach production in the first place.

---

## 8. Whose fault is it, really?

Four contributors, in descending order of how much each is worth fixing.

### 8.1 The way of working — the largest share

The pipeline was **build on a workstation, upload the artefact**. That pattern
carries an unstated assumption: _the developer's machine is representative of
production_. Here it was not, in the single most basic way an operating system
can differ.

This is not a Windows problem so much as a **reproducibility** problem. The same
class of bug is waiting in any workstation-built artefact: a different Node
version, a case-insensitive filesystem accepting `Button.tsx` where Linux demands
`button.tsx`, a locale changing date formatting, a missing native binary.

The correct default is that **the deployment artefact is built by a machine
nobody develops on**. That is what CI is for. It was skipped because it needs a
GitHub repository and a token, and going live felt faster without them — which it
was, right up until it wasn't.

### 8.2 The template — a real, narrower share

The template gets the hard parts right (RLS-first, typed database, migration
discipline, feature slices) and this project inherited all of that intact. But on
this specific point it is at fault twice:

1. **Its `deploy` script is written for POSIX shells.** It chained commands
   inside single quotes:

   ```json
   "deploy": "dotenv -e .env.production.local -- sh -c '… build && … deploy'"
   ```

   Windows `cmd.exe` does not parse single quotes. It split on the inner `&&` and
   ran `opennextjs-cloudflare deploy'` — trailing quote included. So the template
   had **never been run on Windows**, and its own documentation ("Use `pnpm run
deploy`") could not work there.

2. **It documents deploying from the developer's machine**, with a list of
   hard-won Workers gotchas — none of which is "build on Linux". A template that
   ships a Windows-capable local stack should either guarantee Windows builds work
   or state plainly that they do not.

Both are worth reporting upstream. `docs/PROJECT.md` already carries the
instruction to do so for gotchas costing more than half an hour; this one cost
several.

### 8.3 The adapter — a genuine upstream bug

`@opennextjs/cloudflare` clearly knows about this hazard: it has a
`getCrossPlatformPathRegex` helper, it emits `replaceAll(sep, posix.sep)`, and it
passes `windowsPathsNoEscape` to its globbing. Someone thought about Windows. The
coverage is simply not complete, and the failure mode it leaves behind is the
worst kind: **silent at build time, fatal at runtime**.

A defensible upstream fix would be to normalise every baked path to POSIX at
build time regardless of host, since the target runtime is always POSIX. A
cheaper one: refuse to build, or warn loudly, when `path.sep !== "/"`.

### 8.4 The thinking — worth naming explicitly

Three specific errors, all of them mine, all of them generic enough to repeat:

- **"It deployed" was treated as "it works".** A successful upload is evidence
  about a file transfer, nothing more. The fix is a smoke test in the pipeline,
  which now exists.
- **Local green was treated as evidence.** `pnpm dev` and `pnpm verify` were both
  passing throughout. They _could not_ have caught this — dev mode never runs the
  adapter. Knowing what a check does **not** cover is as important as running it.
- **The first plausible cause was chased instead of the distinguishing one.** The
  Next version mismatch was real, so it absorbed attention. The question that
  actually resolves things is "what is different between the working case and the
  broken one?" — and there was no working case until one was deliberately
  manufactured by building on Linux.

---

## 9. How to avoid this from the beginning

Concrete rules, most valuable first.

1. **Never build a deployment artefact on a workstation.** Build in CI on Linux
   from the very first deploy. If CI is not set up yet, build in a container —
   that is one `docker run`, and it costs minutes.
2. **A deploy is not finished until the deployed thing answers.** Every pipeline
   should end with an HTTP request against the real URL that fails the run on a
   non-2xx. This single check would have caught this within seconds of the first
   deploy.
3. **Pin the whole build environment, not just dependencies.** OS, Node version,
   package manager version, and a frozen lockfile. `pnpm install --frozen-lockfile`
   on `ubuntu-latest` with a pinned Node is reproducible; `pnpm install` on
   "whatever laptop" is not.
4. **Write npm scripts that both shells can run.** Chain with `&&` at the script
   level, never inside `sh -c '…'`. Assume someone will run it on Windows.
5. **Check the adapter's supported range before upgrading a framework.**
   `npm view @opennextjs/cloudflare@latest peerDependencies` takes five seconds
   and would have prevented defect (4) outright.
6. **Distrust green builds from bundler-based adapters specifically.** When a tool
   rewrites your code to run somewhere it was not designed for, "it compiled" is
   almost meaningless. The meaningful test is execution.
7. **When stuck, manufacture a working case.** Debugging a single broken state is
   guesswork; comparing a broken state against a working one is arithmetic. The
   Linux container was worth more than every hypothesis that preceded it.

---

## 10. What is now permanent

| Change                                  | Where                          | Effect                                 |
| --------------------------------------- | ------------------------------ | -------------------------------------- |
| Linux-only deploy pipeline              | `.github/workflows/deploy.yml` | The failure cannot recur               |
| Post-deploy HTTP check                  | same workflow                  | A dead deploy fails the run            |
| Secret-in-bundle check                  | same workflow                  | Refuses to ship the service-role key   |
| Cross-platform deploy script            | `package.json`                 | `pnpm run deploy` works on both shells |
| Next pinned into the supported range    | `package.json`                 | 16.2.12, inside the adapter's range    |
| Dev-only pages excluded from production | `next.config.ts`               | 107 KiB back under the size ceiling    |
| The full diagnosis                      | `docs/PROJECT.md`              | Next person starts where this ended    |

---

## 11. What it cost

Roughly half a working day, most of it after everything _looked_ finished — the
database was live, the secret was stored, the bundle was under budget, and the
deploy was reporting success. The tool was completely unusable that whole time.

The single change that would have collapsed it to minutes is rule 2: **ask the
deployed site for a page, and fail if it does not answer.** Everything else in
this document is elaboration on that one omission.
