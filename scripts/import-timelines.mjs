/**
 * Put the archive's timelines into the database. ONE-OFF.
 *
 * Reads the JSON that `read-timeline-slides.mjs` writes, and creates a Gantt
 * schedule per matched quotation. Dry by default: it prints the plan and changes
 * nothing until `--apply`.
 *
 * The owner chose the cautious rules, and they are enforced here rather than
 * being a matter of care at run time:
 *
 *   1. **Only slides where every scope band matches exactly ONE quotation** by
 *      name. A band matching two quotations of the same scope is not a match —
 *      picking between them would be a guess.
 *   2. **Units appearing on more than one slide are skipped.** Ten units have a
 *      revision in the deck and the owner will do those by hand.
 *   3. **A quotation that already has a timeline is left alone.** Anything built
 *      in the tool is newer than this archive.
 *
 * Everything excluded is counted and named, because "imported 80 of 374" invites
 * exactly one question and the answer should already be on screen.
 *
 * Usage:
 *   node scripts/import-timelines.mjs                        # plan, local
 *   node scripts/import-timelines.mjs --apply                # write, local
 *   node scripts/import-timelines.mjs --cloud --apply        # write, live
 */

import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const cloud = args.includes("--cloud");
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

async function rest(path, options = {}) {
  const response = await fetch(`${API}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Prefer: options.method === "POST" ? "return=representation" : "",
      ...options.headers,
    },
  });
  if (!response.ok) throw new Error(`${response.status} on ${path}: ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

const normalise = (value) => (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

// ── What the slides say ──────────────────────────────────────────────────────

const slides = JSON.parse(readFileSync("Sample/timelines.json", "utf8"));
const candidates = slides.filter(
  (s) => s.delivery === "after" && s.problems.length === 0 && s.activities.length > 0,
);

// Rule 2: a unit with more than one slide is skipped entirely.
const slideCount = new Map();
for (const s of candidates) slideCount.set(s.unitCode, (slideCount.get(s.unitCode) ?? 0) + 1);
const duplicated = [...slideCount].filter(([, n]) => n > 1).map(([code]) => code);
const single = candidates.filter((s) => slideCount.get(s.unitCode) === 1);

// ── What the database has ────────────────────────────────────────────────────

const units = await rest(
  "units?select=id,unit_code,display_name&delivery=eq.after_delivery&limit=2000",
);
const unitByCode = new Map(units.map((u) => [normalise(u.unit_code), u]));

const quotations = await rest(
  "quotations?select=id,unit_id,scope_of_work,invoice_value,include_in_newsletter,gantt_schedules(id)&limit=5000",
);
const quotesByUnit = new Map();
for (const q of quotations) {
  const list = quotesByUnit.get(q.unit_id) ?? [];
  list.push(q);
  quotesByUnit.set(q.unit_id, list);
}

// ── Build the plan ───────────────────────────────────────────────────────────

const plan = [];
const skipped = { noUnit: [], noMatch: [], ambiguous: [], hasSchedule: [] };

for (const slide of single) {
  const unit = unitByCode.get(normalise(slide.unitCode));
  if (!unit) {
    skipped.noUnit.push(slide.unitCode);
    continue;
  }
  const quotes = quotesByUnit.get(unit.id) ?? [];
  const bands = slide.bands.length > 0 ? slide.bands : [null];

  const perBand = [];
  let usable = true;
  for (const band of bands) {
    // A band with no name only makes sense when the unit has exactly one quote.
    const matches =
      band === null ? quotes : quotes.filter((q) => normalise(q.scope_of_work) === normalise(band));

    if (matches.length === 0) {
      skipped.noMatch.push(`${slide.unitCode} — band "${band ?? "(single)"}"`);
      usable = false;
      break;
    }
    if (matches.length > 1) {
      skipped.ambiguous.push(
        `${slide.unitCode} — "${band ?? "(single)"}" matches ${matches.length} quotations`,
      );
      usable = false;
      break;
    }
    const quotation = matches[0];
    if (quotation.gantt_schedules) {
      skipped.hasSchedule.push(`${slide.unitCode} — ${quotation.scope_of_work}`);
      usable = false;
      break;
    }
    const activities = slide.activities.filter((a) => (a.band ?? null) === band && a.name);
    if (activities.length === 0) {
      skipped.noMatch.push(`${slide.unitCode} — band "${band ?? "(single)"}" has no named bars`);
      usable = false;
      break;
    }
    perBand.push({ quotation, band, activities });
  }
  if (usable) plan.push({ slide, unit, perBand });
}

const bars = plan.reduce((n, p) => n + p.perBand.reduce((m, b) => m + b.activities.length, 0), 0);

console.log(
  `${cloud ? "LIVE" : "local"} database — ${apply ? "APPLYING" : "plan only, nothing written"}`,
);
console.log("");
console.log(`slides with a checked timeline for an After Delivery unit: ${candidates.length}`);
console.log(
  `  minus units with more than one slide (${duplicated.length} units): ${single.length}`,
);
console.log("");
/*
  Counted per SCHEDULE, not per slide. A slide with two scope bands becomes two
  timelines, one per quotation — the first version of this line said "50
  timelines" and the run then reported 60, which is the kind of small
  inconsistency that makes someone distrust the larger number beside it.
*/
const schedules = plan.reduce((n, p) => n + p.perBand.length, 0);
console.log(
  `will create ${schedules} timelines (${bars} bars) ` +
    `from ${plan.length} slides, across ${new Set(plan.map((p) => p.unit.unit_code)).size} units`,
);
console.log("");
console.log("not imported:");
console.log(`  unit not in the database:            ${skipped.noUnit.length}`);
console.log(`  no quotation of that scope:           ${skipped.noMatch.length}`);
console.log(`  scope matches several quotations:     ${skipped.ambiguous.length}`);
console.log(`  that quotation already has a timeline:${skipped.hasSchedule.length}`);
for (const [why, list] of Object.entries(skipped)) {
  if (list.length)
    console.log(
      `\n  ${why}: ${list.slice(0, 8).join("; ")}${list.length > 8 ? ` …+${list.length - 8}` : ""}`,
    );
}

if (!apply) {
  console.log("\nFirst three, in full:");
  for (const p of plan.slice(0, 3)) {
    console.log(`  ${p.unit.display_name} (${p.unit.unit_code})`);
    for (const b of p.perBand) {
      console.log(
        `     → quotation "${b.quotation.scope_of_work}" as "${b.band ?? b.quotation.scope_of_work}"`,
      );
      for (const a of b.activities) console.log(`        ${a.start} → ${a.finish}  ${a.name}`);
    }
  }
  console.log("\nRun again with --apply to write it.");
  process.exit(0);
}

// ── Write ────────────────────────────────────────────────────────────────────

let created = 0;
let activitiesCreated = 0;
for (const p of plan) {
  for (const b of p.perBand) {
    const [schedule] = await rest("gantt_schedules", {
      method: "POST",
      body: JSON.stringify({
        quotation_id: b.quotation.id,
        row_label: b.band ?? b.quotation.scope_of_work,
      }),
    });
    const rows = b.activities.map((a, index) => ({
      schedule_id: schedule.id,
      name: a.name.slice(0, 300),
      start_date: a.start,
      finish_date: a.finish,
      // Every bar comes in as a normal bar; the owner marks attention bars.
      tone: "normal",
      sort_order: index,
    }));
    await rest("gantt_activities", { method: "POST", body: JSON.stringify(rows) });
    created += 1;
    activitiesCreated += rows.length;
    if (created % 20 === 0) console.log(`  … ${created} timelines written`);
  }
}

console.log(`\ndone: ${created} timelines, ${activitiesCreated} bars.`);
