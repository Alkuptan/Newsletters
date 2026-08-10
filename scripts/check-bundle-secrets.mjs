/**
 * Refuse to ship a bundle carrying a secret.
 *
 * `opennextjs-cloudflare build` inlines every environment variable Next loaded
 * into `.open-next/cloudflare/next-env.mjs`, which travels inside the uploaded
 * Worker. Next loads `.env.local` and `.env.production.local` automatically, so
 * building with the plain adapter command — rather than `pnpm run build:cf`,
 * which blanks them — puts the service-role key and the database password in the
 * artifact.
 *
 * That is not theoretical. It happened here: a build run directly as
 * `opennextjs-cloudflare build` inside a container shipped both the cloud and the
 * local service-role keys. The GitHub workflow already checked for this; a
 * workstation deploy did not, which is precisely the gap that let it through.
 *
 * This runs before every deploy and exits non-zero if any known secret appears
 * anywhere under `.open-next/`. It prints no secret values, only which variable
 * was found.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const BUNDLE = ".open-next";

/** Variables that must never reach the artifact, read from the env files. */
const FORBIDDEN = ["SUPABASE_SECRET_KEY", "SUPABASE_DB_PASSWORD"];

function readEnv(file) {
  try {
    return readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((line) => line.includes("=") && !line.trimStart().startsWith("#"))
      .reduce((all, line) => {
        const at = line.indexOf("=");
        all[line.slice(0, at).trim()] = line.slice(at + 1).trim();
        return all;
      }, {});
  } catch {
    return {};
  }
}

/** Every value worth looking for, from both env files, de-duplicated. */
const wanted = new Map();
for (const file of [".env.local", ".env.production.local"]) {
  const env = readEnv(file);
  for (const name of FORBIDDEN) {
    // Short values would match by coincidence; a real key is long.
    if (env[name] && env[name].length >= 12) wanted.set(env[name], `${name} (${file})`);
  }
}

if (wanted.size === 0) {
  console.log("check-bundle-secrets: no secrets configured locally, nothing to look for.");
  process.exit(0);
}

/*
  Per-file problems are counted, not fatal, and never reported as "no bundle" —
  a single unreadable file used to make this claim nothing had been built, which
  is a misleading diagnosis of a real failure.
*/
let skipped = 0;

function* files(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    skipped += 1;
    return;
  }
  for (const entry of entries) {
    const path = join(dir, entry);
    let isDirectory;
    try {
      isDirectory = statSync(path).isDirectory();
    } catch {
      skipped += 1;
      continue;
    }
    if (isDirectory) yield* files(path);
    else yield path;
  }
}

try {
  statSync(BUNDLE);
} catch {
  console.error(`check-bundle-secrets: no ${BUNDLE} to check — build first.`);
  process.exit(1);
}

const found = new Set();
let scanned = 0;
for (const path of files(BUNDLE)) {
  let text;
  try {
    text = readFileSync(path, "latin1");
  } catch {
    skipped += 1;
    continue;
  }
  scanned += 1;
  for (const [value, label] of wanted) {
    if (text.includes(value)) found.add(`${label} in ${path}`);
  }
}

if (found.size > 0) {
  console.error("check-bundle-secrets: REFUSING TO DEPLOY — a secret is inside the bundle:");
  for (const line of found) console.error("  " + line);
  console.error(
    "\nBuild with `pnpm run build:cf` (it blanks these for the build) rather than calling\n" +
      "the adapter directly, then deploy again.",
  );
  process.exit(1);
}

console.log(
  `check-bundle-secrets: clean — ${wanted.size} secret(s) checked against ${scanned} files` +
    (skipped > 0 ? `, ${skipped} unreadable and skipped` : "") +
    ".",
);
