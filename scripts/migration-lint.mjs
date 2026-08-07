#!/usr/bin/env node
/**
 * Migration lint — runs in CI and in the verify loop.
 *
 * Rules (why: non-developers cannot recover from destructive mistakes, and
 * every table must be born with RLS):
 *   1. Additive-only: no DROP TABLE/COLUMN, TRUNCATE, or destructive ALTER.
 *      Override for a genuinely needed destructive change: add a line
 *      `-- migration-lint: allow-destructive <reason>` after dev-team review.
 *   2. Every `create table` must have `enable row level security` for that
 *      table in the SAME file.
 *   3. File names are `NNNN_snake_case.sql` with strictly increasing,
 *      gap-free numbering.
 *   4. Applied migrations are append-only (checked in CI via git diff, not here).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "supabase", "migrations");
let files;
try {
  files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
} catch {
  console.log("migration-lint: no supabase/migrations directory — nothing to check.");
  process.exit(0);
}

const errors = [];

// Rule 3: naming + numbering
const numbers = [];
for (const f of files) {
  const m = f.match(/^(\d{4})_[a-z0-9_]+\.sql$/);
  if (!m) {
    errors.push(`${f}: name must match NNNN_snake_case.sql (e.g. 0005_add_bookings.sql)`);
    continue;
  }
  numbers.push(Number(m[1]));
}
for (let i = 1; i < numbers.length; i++) {
  if (numbers[i] !== numbers[i - 1] + 1) {
    errors.push(
      `numbering gap or duplicate between ${String(numbers[i - 1]).padStart(4, "0")} and ${String(
        numbers[i],
      ).padStart(4, "0")} — migrations must be strictly sequential`,
    );
  }
}

const DESTRUCTIVE = [
  { re: /\bdrop\s+table\b/i, what: "DROP TABLE" },
  { re: /\bdrop\s+column\b/i, what: "DROP COLUMN" },
  { re: /\btruncate\b/i, what: "TRUNCATE" },
  { re: /\balter\s+table\s+\S+\s+alter\s+column\s+\S+\s+type\b/i, what: "ALTER COLUMN TYPE" },
  { re: /\bdrop\s+policy\b/i, what: "DROP POLICY" },
  { re: /\bdisable\s+row\s+level\s+security\b/i, what: "DISABLE ROW LEVEL SECURITY" },
  { re: /\bdelete\s+from\b/i, what: "DELETE FROM" },
];

for (const f of files) {
  const sql = readFileSync(join(dir, f), "utf8");
  const stripped = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  const allowDestructive = /--\s*migration-lint:\s*allow-destructive/.test(sql);

  // Rule 1: additive only
  for (const { re, what } of DESTRUCTIVE) {
    if (re.test(stripped) && !allowDestructive) {
      errors.push(
        `${f}: contains ${what}. Migrations are additive-only. If this is genuinely needed, ` +
          `get dev-team review and add: -- migration-lint: allow-destructive <reason>`,
      );
    }
  }

  // Rule 2: create table ⇒ enable RLS in the same file
  const created = [
    ...stripped.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z0-9_.]+)/gi),
  ].map((m) => m[1].replace(/^public\./, ""));
  for (const table of created) {
    const rlsRe = new RegExp(
      `alter\\s+table\\s+(?:public\\.)?${table}\\s+enable\\s+row\\s+level\\s+security`,
      "i",
    );
    if (!rlsRe.test(stripped)) {
      errors.push(
        `${f}: creates table "${table}" without enabling row level security in the same file. ` +
          `A table without RLS must not exist, even for a minute.`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error("migration-lint FAILED:\n");
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.error(`\n${errors.length} problem(s).`);
  process.exit(1);
}

console.log(`migration-lint: ${files.length} migration(s) OK.`);
