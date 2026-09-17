/**
 * Refuse to upload a bundle that was built on Windows.
 *
 * A Windows-built bundle uploads perfectly and then returns 500 on EVERY page.
 * Next bakes its own `path.sep` into the build output, so a Windows build carries
 * `.next\server\middleware-manifest.json` while workerd — which is POSIX — looks
 * for `.next/server/middleware-manifest.json`. The lookup misses and falls
 * through to a dynamic require, which workerd cannot do. The full analysis is in
 * docs/WINDOWS-VS-LINUX-BUILD.md.
 *
 * This exists because knowing that was not enough. `pnpm run deploy` chains
 * `build:cf` first, so running it on Windows silently REPLACES a good Linux build
 * with a broken Windows one and ships it — which is exactly what happened on
 * 5 September, taking the live site down until someone requested a page. The
 * gzipped size jumping from ~2,670 KiB to ~3,080 KiB was the only visible hint,
 * and only to someone who already knew the number.
 *
 * Checking the artefact is the point: it cannot be fooled by which machine, which
 * shell, or which script chain produced it.
 */

import { readFileSync, existsSync } from "node:fs";

const HANDLER = ".open-next/server-functions/default/handler.mjs";

if (!existsSync(HANDLER)) {
  console.error(`check-linux-build: no ${HANDLER} — build first with pnpm run build:cf.`);
  process.exit(1);
}

const handler = readFileSync(HANDLER, "latin1");

/*
  Plain substring searches, not regular expressions.

  The first version of this file used a regex and a shell heredoc turned `\\+`
  into `\+` on the way to disk, so it matched a literal plus sign and found
  nothing — a guard that passed everything. Two backslashes are hard to write
  correctly through several layers of quoting, and `String.raw` states the intent
  once, where it can be read.

  The handler is minified JavaScript, so a Windows path appears in it as a
  string LITERAL: the two characters `\` `\` stand for one real backslash.
*/
const WINDOWS_MARK = String.raw`.next\\server\\`;
const POSIX_MARK = ".next/server/";

const countOf = (haystack, needle) => haystack.split(needle).length - 1;

const windowsHits = countOf(handler, WINDOWS_MARK);
const posixHits = countOf(handler, POSIX_MARK);

if (windowsHits > 0) {
  console.error("check-linux-build: REFUSING TO UPLOAD — this bundle was built on Windows.");
  console.error(`  ${windowsHits} backslashed manifest path(s) baked into the handler.`);
  console.error("");
  console.error("  It would upload successfully and then return 500 on every page.");
  console.error("  Build it in the Linux container first (docs/WINDOWS-VS-LINUX-BUILD.md),");
  console.error("  then upload WITHOUT rebuilding:  pnpm run upload");
  process.exit(1);
}

if (posixHits === 0) {
  console.error("check-linux-build: no manifest path of either kind in the handler.");
  console.error("  The adapter's output shape may have changed — check before uploading.");
  process.exit(1);
}

console.log(`check-linux-build: built on Linux (${posixHits} POSIX manifest path(s)).`);
