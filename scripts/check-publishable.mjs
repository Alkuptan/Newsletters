/**
 * Refuse to publish a tree carrying the owner's commercial figures or a secret.
 *
 * The GitHub remote is public and the local history is not (see docs/PROJECT.md).
 * Run this before every publish: `pnpm check:publishable`.
 *
 * It exists because doing the check by eye failed. A real contract total was
 * quoted inside the documentation ABOUT scrubbing contract totals; the loop that
 * looked for it did find it, and an unconditional "clean" printed on the next line
 * sent the push through anyway. A check whose result can be ignored is not a check,
 * so this one exits non-zero and names what it found.
 *
 * The figures live in `.publish-denylist.txt`, which is GITIGNORED and generated
 * from the live sheet by `pnpm check:publishable:build`. They are deliberately not
 * inline: the first version of this file listed them, which meant publishing the
 * checker would have published every figure it was written to protect.
 */

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const DENYLIST = ".publish-denylist.txt";

let figures;
try {
  figures = readFileSync(DENYLIST, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
} catch {
  console.error(
    `check-publishable: no ${DENYLIST}.\n\n` +
      "Generate it with `pnpm check:publishable:build`, which reads the live sheet\n" +
      "in Sample/. Without it nothing can be verified, so nothing may be published —\n" +
      "publish only from a machine that has the sheet.",
  );
  process.exit(1);
}

/** Secret-shaped values from the untracked env files. */
const secrets = new Map();
for (const file of [".env.local", ".env.production.local"]) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const line of text.split(/\r?\n/)) {
    if (!line.includes("=") || line.trimStart().startsWith("#")) continue;
    const at = line.indexOf("=");
    const value = line.slice(at + 1).trim();
    if (value.length >= 16 && !/^https?:\/\//.test(value)) {
      secrets.set(value, line.slice(0, at).trim());
    }
  }
}

const tracked = execSync("git ls-files", { encoding: "utf8" })
  .split(/\r?\n/)
  .filter(Boolean)
  // The template's own docs are upstream text, not this project's data. This
  // script is exempt from the figure scan only because it holds no figures.
  .filter((path) => !path.startsWith("docs/template/"));

const problems = [];
for (const path of tracked) {
  let text;
  try {
    text = readFileSync(path, "latin1");
  } catch {
    continue;
  }
  for (const figure of figures) {
    /*
      Bounded so a five-digit quote reference does not match inside a longer run
      of digits — a UUID or a hash would otherwise trip this on every run.
    */
    const bounded = new RegExp(`(?<![0-9])${figure.replace(/[.]/g, "\\.")}(?![0-9])`);
    if (bounded.test(text)) problems.push(`figure from the sheet (${figure}) in ${path}`);
  }
  for (const [value, name] of secrets) {
    if (text.includes(value)) problems.push(`${name} in ${path}`);
  }
}

if (problems.length > 0) {
  console.error("check-publishable: REFUSING TO PUBLISH —");
  // De-duplicated: one figure in several forms is one problem to fix.
  for (const problem of [...new Set(problems)]) console.error("  " + problem);
  process.exit(1);
}

console.log(
  `check-publishable: clean — ${figures.length} figure forms and ${secrets.size} secrets ` +
    `checked across ${tracked.length} files.`,
);
