#!/usr/bin/env node
/**
 * Create the next migration file with the repo's sequential NNNN_ naming
 * (0001_, 0002_, …) — NOT Supabase's default 14-digit timestamp, which
 * `pnpm migration-lint` rejects. Usage:
 *   pnpm db:new add_bookings
 */
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const rawName = process.argv[2];
if (!rawName) {
  console.error("Usage: pnpm db:new <name>   e.g. pnpm db:new add_bookings");
  process.exit(1);
}
const name = rawName
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "");
if (!name) {
  console.error("Name must contain letters or digits (snake_case).");
  process.exit(1);
}

const dir = join(process.cwd(), "supabase", "migrations");
const nums = readdirSync(dir)
  .map((f) => f.match(/^(\d{4})_/))
  .filter(Boolean)
  .map((m) => Number(m[1]));
const next = String((nums.length ? Math.max(...nums) : 0) + 1).padStart(4, "0");
const file = join(dir, `${next}_${name}.sql`);

writeFileSync(
  file,
  `-- ${next}_${name}
-- Additive only (no DROP/TRUNCATE/destructive ALTER — see migration-lint).
-- Every new table MUST enable RLS + define its policies in THIS file.
-- After editing: apply it (pnpm db:reset locally / pnpm db:push linked),
-- then regenerate types (pnpm db:types:local / pnpm db:types).
`,
  { flag: "wx" },
);

console.log(`Created supabase/migrations/${next}_${name}.sql`);
