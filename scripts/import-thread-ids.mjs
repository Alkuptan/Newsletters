/**
 * Give each unit the Message-ID of its last newsletter, so the next one is a
 * REPLY in the client's existing thread rather than a new email.
 *
 * Where the ids come from: `PMOTeam@elgouna.com` is CC'd on every newsletter, so
 * that mailbox holds a copy of each one with its `internetMessageId`. They are
 * read out through Microsoft Graph and written to a JSON file, which this reads.
 * The tool itself has no Graph credential and this does not give it one — see
 * `docs/PROJECT.md`.
 *
 * Input (default `.thread-ids.json`, gitignored — the repository is public):
 *
 *     [{ "subject": "Cyan 76A Newsletter",
 *        "messageId": "<...@...>",
 *        "sentAt": "2026-08-24T19:31:14Z" }]
 *
 * Dry by default: it prints what it would do and changes nothing until --apply.
 *
 *   node scripts/import-thread-ids.mjs                       # plan, local
 *   node scripts/import-thread-ids.mjs --cloud               # plan, live
 *   node scripts/import-thread-ids.mjs --cloud --apply       # write, live
 */

import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const cloud = args.includes("--cloud");
const fileArg = args.find((a) => !a.startsWith("--"));
const input = fileArg ?? ".thread-ids.json";
const envFile = cloud ? ".env.production.local" : ".env.local";

function env(name) {
  const line = readFileSync(envFile, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} is not in ${envFile}`);
  return line.slice(name.length + 1).trim();
}

const API = env("NEXT_PUBLIC_SUPABASE_URL");
const KEY = env("SUPABASE_SECRET_KEY");
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

/*
  The same shape the message file enforces and the database CHECK constrains.
  Three places, deliberately: a malformed id does not fail loudly — the
  newsletter sends, looks perfect, and quietly starts a new thread.
*/
const MESSAGE_ID = /^<[^<>\s]+@[^<>\s]+>$/;

/**
 * "RE: Cyan 76A Newsletter" -> "Cyan 76A"
 *
 * Only the reply prefixes and the trailing word are stripped. The unit's own
 * name is NEVER altered, because the match against it has to be exact: "Ancient
 * Sands 192A" and "192B" are different clients, and anchoring one's newsletter
 * to the other's thread would show a paying customer someone else's
 * conversation. That is the failure this guards against, and it is worse than
 * not threading at all.
 *
 * "Newletter" is here because the owner's real sent mail contains that typo.
 * Tolerating a misspelt SUFFIX is not fuzzy matching — what follows still has to
 * equal a unit's name exactly.
 */
function unitNameFromSubject(subject) {
  let s = String(subject ?? "").trim();
  for (;;) {
    const shorter = s.replace(/^(re|fw|fwd)\s*:\s*/i, "");
    if (shorter === s) break;
    s = shorter;
  }
  return s.replace(/\s+(newsletter|newletter)\s*$/i, "").trim();
}

const entries = JSON.parse(readFileSync(input, "utf8"));
if (!Array.isArray(entries)) throw new Error(`${input} should contain a JSON array.`);

const res = await fetch(`${API}/rest/v1/units?select=id,display_name,thread_message_at`, {
  headers,
});
if (!res.ok) throw new Error(`could not read units: ${res.status} ${res.statusText}`);
const units = await res.json();

/**
 * The one normalisation applied to BOTH sides before comparing.
 *
 * Two differences show up in the real data and neither carries meaning:
 *
 *   "The  Nines 55A"    typed with two spaces
 *   "Ancient Hill 71A-0" where the unit is recorded as "Ancient Hill 71A 0"
 *
 * So runs of spaces and hyphens collapse to one space. This is NOT fuzzy
 * matching — every other character still has to be identical, and a key that
 * two different units collapse onto is refused below rather than guessed at.
 * "Ancient Sands 192A" and "192B" stay as far apart as they were.
 */
function matchKey(name) {
  return name
    .trim()
    .replace(/[\s-]+/g, " ")
    .toLocaleLowerCase();
}

const byName = new Map();
for (const u of units) {
  const key = matchKey(u.display_name);
  // A name two units collapse onto cannot be matched safely either way.
  byName.set(key, byName.has(key) ? null : u);
}

/** Newest wins: a unit sent several times should anchor to the latest. */
const best = new Map();
const malformed = [];
const unmatched = new Map();
let ambiguous = 0;

for (const entry of entries) {
  const id = String(entry.messageId ?? "").trim();
  if (!MESSAGE_ID.test(id)) {
    malformed.push(entry.subject ?? "(no subject)");
    continue;
  }

  const name = unitNameFromSubject(entry.subject);
  const unit = byName.get(matchKey(name));

  if (unit === null) {
    ambiguous += 1;
    continue;
  }
  if (!unit) {
    unmatched.set(name, (unmatched.get(name) ?? 0) + 1);
    continue;
  }

  const sentAt = entry.sentAt ? new Date(entry.sentAt) : null;
  const existing = best.get(unit.id);
  if (!existing || (sentAt && existing.sentAt && sentAt > existing.sentAt) || !existing.sentAt) {
    best.set(unit.id, { unit, messageId: id, sentAt, subject: entry.subject });
  }
}

console.log(`read ${entries.length} message(s) from ${input}`);
console.log(`matched ${best.size} of ${units.length} unit(s)\n`);

for (const { unit, messageId, sentAt } of [...best.values()].sort((a, b) =>
  a.unit.display_name.localeCompare(b.unit.display_name),
)) {
  const when = sentAt ? sentAt.toISOString().slice(0, 10) : "date unknown";
  const already = unit.thread_message_at ? " (replacing an existing anchor)" : "";
  console.log(`  ${unit.display_name.padEnd(34)} ${when}  ${messageId.slice(0, 28)}…${already}`);
}

if (unmatched.size > 0) {
  console.log(`\nNOT matched to any unit — these keep starting new threads:`);
  for (const [name, count] of [...unmatched.entries()].sort()) {
    console.log(`  ${name}${count > 1 ? `  (${count} messages)` : ""}`);
  }
}
if (malformed.length > 0) {
  console.log(`\n${malformed.length} message(s) had no usable Message-ID:`);
  for (const s of malformed.slice(0, 10)) console.log(`  ${s}`);
}
if (ambiguous > 0) {
  console.log(`\n${ambiguous} message(s) matched a duplicated unit name and were skipped.`);
}

// Deliberately not `process.exit()`: ending the process while fetch still holds
// libuv handles makes Node on Windows print "Assertion failed: !(handle->flags &
// UV_HANDLE_CLOSING)" after the output. Harmless, but it reads like a crash on a
// script whose whole job is to look trustworthy before it writes to live data.
let written = 0;
for (const { unit, messageId, sentAt } of apply ? best.values() : []) {
  const patch = {
    thread_message_id: messageId,
    thread_message_at: sentAt ? sentAt.toISOString() : null,
  };
  const put = await fetch(`${API}/rest/v1/units?id=eq.${unit.id}`, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
  if (!put.ok) {
    console.error(`  FAILED ${unit.display_name}: ${put.status} ${await put.text()}`);
    continue;
  }
  written += 1;
}

if (apply) {
  console.log(`\nwrote ${written} anchor(s) to ${cloud ? "the LIVE" : "the local"} database.`);
} else {
  console.log(`\nNothing written. Re-run with --apply${cloud ? "" : " --cloud"} to write.`);
}
