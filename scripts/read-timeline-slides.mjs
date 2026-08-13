/**
 * Read the timelines out of an Office Timeline PowerPoint.
 *
 * ONE-OFF, for the archive of timelines the owner built before this tool existed
 * — one unit per slide. It reads and reports; it writes to no database.
 * `import-timelines.mjs` does that, from this script's JSON.
 *
 * Why this is exact rather than a guess: Office Timeline keeps its own data on
 * every bar it draws, as PowerPoint "tags" — `OTLSTARTDATE` and `OTLENDDATE` hold
 * full timestamps. The dates come from the source, not from measuring pixels.
 *
 * How a slide is laid out, which is what the parsing relies on:
 *
 *   - a **bar** is a shape carrying those two tags and NO text;
 *   - beside each bar sit two text shapes at almost the same height — the printed
 *     date range ("Aug 8 - Sep 1") and the task name ("Finishing Works");
 *   - **scope bands** ("Swimming Pool", "Landscape") are rotated labels to the
 *     LEFT of the chart, so their x is negative. These are what this tool calls a
 *     quotation's row label;
 *   - the **unit code** ("AH-9") is a short run near the top.
 *
 * Bars and names are paired by vertical order, then every pairing is CHECKED
 * against the printed date range. A slide whose check fails is reported and not
 * imported — a timeline silently attached to the wrong dates is worse than one
 * that needs doing by hand.
 *
 * Usage:
 *   node scripts/read-timeline-slides.mjs                  # summary
 *   node scripts/read-timeline-slides.mjs --slide 1        # one slide in full
 *   node scripts/read-timeline-slides.mjs --json out.json  # everything, as JSON
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { unzipSync } from "fflate";
import XLSX from "xlsx";

const FILE =
  process.env.TIMELINE_PPTX ?? "Sample/Time Schedule archive [Autosaved] [Autosaved].pptx";

const decoder = new TextDecoder();
const args = process.argv.slice(2);
const onlySlide = args.includes("--slide") ? Number(args[args.indexOf("--slide") + 1]) : null;
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;

const zip = unzipSync(new Uint8Array(readFileSync(FILE)));
const read = (name) => (zip[name] ? decoder.decode(zip[name]) : null);

const slideNumbers = Object.keys(zip)
  .map((name) => name.match(/^ppt\/slides\/slide(\d+)\.xml$/)?.[1])
  .filter(Boolean)
  .map(Number)
  .sort((a, b) => a - b);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2024-08-08" → "Aug 8", the way Office Timeline prints it. */
function printed(iso) {
  const [, month, day] = iso.split("-").map(Number);
  return `${MONTHS[month - 1]} ${day}`;
}

/** Anything that is a date range, a day count, a month or a year — never a task. */
const IS_DATE_RANGE = /^[A-Z][a-z]{2}\s+\d{1,2}(\s*-\s*[A-Z][a-z]{2}\s+\d{1,2})?$/;
const IS_DAY_COUNT = /^\d+\s+days?$/;
const IS_MONTH = new RegExp(`^(${MONTHS.join("|")})$`);
const IS_YEAR = /^(19|20)\d{2}$/;
const IS_NOISE = (t) =>
  IS_DATE_RANGE.test(t) ||
  IS_DAY_COUNT.test(t) ||
  IS_MONTH.test(t) ||
  IS_YEAR.test(t) ||
  t === "Today";

/**
 * The unit codes that actually exist, read from the follow-up sheet.
 *
 * A first attempt guessed the code by SHAPE — two-to-four letters, a dash, some
 * digits — and confidently identified "Mobilization", "MEP", "SOG" and "Skeleton"
 * as units. Guessing was the wrong instinct when the real list is sitting in the
 * sheet: matching against it cannot invent a unit, and it says immediately which
 * slides have no unit to attach to.
 */
function knownUnitCodes() {
  const dir = "Sample";
  const workbook = readdirSync(dir).find((f) => /\.xlsm$/i.test(f));
  if (!workbook) return new Map();

  const book = XLSX.read(readFileSync(`${dir}/${workbook}`), { type: "buffer" });
  const codes = new Map();
  for (const tab of ["After Delivery Extra works", "Before Delivery Extra works"]) {
    const sheet = book.Sheets[tab];
    if (!sheet) continue;
    const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    const headers = (grid[1] ?? []).map((h) => String(h).trim().toLowerCase());
    const column = headers.indexOf("unit");
    if (column < 0) continue;
    const delivery = tab.startsWith("After") ? "after" : "before";
    for (const row of grid.slice(2)) {
      const code = String(row[column] ?? "").trim();
      // After Delivery wins: those are the units this tool actually holds.
      const key = normaliseCode(code);
      if (code && (delivery === "after" || !codes.has(key))) codes.set(key, { code, delivery });
    }
  }
  return codes;
}

/** "ASV-81B", "asv 81 b" and "ASV81B" are one unit as far as matching goes. */
function normaliseCode(value) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const KNOWN_CODES = knownUnitCodes();

function readSlide(number) {
  const xml = read(`ppt/slides/slide${number}.xml`);
  if (!xml) return null;

  // rId → tag file, so a shape's Office Timeline data can be found.
  const rels = read(`ppt/slides/_rels/slide${number}.xml.rels`) ?? "";
  const tagFiles = new Map();
  for (const m of rels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    if (/tags\/tag\d+\.xml/.test(m[2])) tagFiles.set(m[1], "ppt/tags/" + m[2].split("/").pop());
  }

  /*
    A shape never contains another shape in this format — only GROUPS nest — so a
    non-greedy match is correct here, and far simpler than counting depth.
  */
  const shapes = [...xml.matchAll(/<p:sp(?:\s[^>]*)?>[\s\S]*?<\/p:sp>/g)].map((m) => m[0]);

  const bars = [];
  const texts = [];

  for (const shape of shapes) {
    const runs = [...shape.matchAll(/<a:t>([^<]*)<\/a:t>/g)]
      .map((m) => m[1].trim())
      .filter(Boolean);
    const off = shape.match(/<a:off\s+x="(-?\d+)"\s+y="(-?\d+)"/);
    const x = off ? Number(off[1]) : null;
    const y = off ? Number(off[2]) : null;

    const rId = shape.match(/<p:tags\s+r:id="([^"]+)"/)?.[1];
    const tagXml = rId && tagFiles.get(rId) ? read(tagFiles.get(rId)) : null;
    const start = tagXml?.match(/name="OTLSTARTDATE"\s+val="([^"]+)"/)?.[1];
    const finish = tagXml?.match(/name="OTLENDDATE"\s+val="([^"]+)"/)?.[1];

    if (start && finish) {
      bars.push({ start: start.slice(0, 10), finish: finish.slice(0, 10), y });
    } else if (runs.length > 0) {
      texts.push({ text: runs.join(" "), x, y });
    }
  }

  /*
    Bands are the rotated labels to the LEFT of the chart, which is why a negative
    x identifies them. On a single-scope timeline there are none, and every bar
    belongs to the one unnamed band.
  */
  const bands = texts
    .filter((t) => t.x !== null && t.x < 0 && !IS_NOISE(t.text))
    .sort((a, b) => (a.y ?? 0) - (b.y ?? 0));

  /*
    The title is the topmost text on the slide, and it is matched against the
    sheet's real unit codes. `titleShape` is remembered by identity so it can be
    excluded from the task names even if some task happens to read the same.
  */
  const onChart = texts.filter((t) => (t.x ?? 0) >= 0 && !IS_NOISE(t.text));
  const byHeight = [...onChart].sort((a, b) => (a.y ?? 0) - (b.y ?? 0));
  const titleShape = byHeight[0] ?? null;

  let unitCode = null;
  let delivery = null;
  let matchedFrom = null;
  for (const candidate of byHeight.slice(0, 3)) {
    const hit = KNOWN_CODES.get(normaliseCode(candidate.text));
    if (hit) {
      unitCode = hit.code;
      delivery = hit.delivery;
      matchedFrom = candidate.text;
      break;
    }
  }

  const nameLabels = onChart
    .filter((t) => t !== titleShape)
    .sort((a, b) => (a.y ?? 0) - (b.y ?? 0));

  const dateLabels = texts
    .filter((t) => IS_DATE_RANGE.test(t.text))
    .sort((a, b) => (a.y ?? 0) - (b.y ?? 0));

  bars.sort((a, b) => (a.y ?? 0) - (b.y ?? 0));

  /*
    Paired by vertical order — rows are ~267,000 EMU apart while a label sits
    within ~45,000 of its bar, so the order cannot cross over. Then every pairing
    is checked against the printed range, which is the part that makes this
    trustworthy rather than plausible.
  */
  const problems = [];

  /*
    Each bar finds its OWN printed date range by TEXT, not by position in the list.

    Pairing by vertical order was the first attempt and it broke on any slide
    carrying an extra label — a milestone, or a note like
    "Modification works Quotation # 16880". One extra shape shifted every pairing
    below it by one, so a whole timeline came out attached to its neighbour's
    dates while looking perfectly plausible.

    Matching the text pins each bar to its own label, and an unmatched bar is
    reported rather than guessed at.
  */
  const usedDates = new Set();
  const takenNames = new Set();

  const activities = bars.map((bar, index) => {
    const expected = `${printed(bar.start)} - ${printed(bar.finish)}`;
    const singleDay = printed(bar.start);

    const label =
      dateLabels.find((d) => !usedDates.has(d) && (d.text === expected || d.text === singleDay)) ??
      null;
    if (label) usedDates.add(label);
    const matches = Boolean(label);
    if (!matches) {
      problems.push(`bar ${index + 1}: nothing on the slide prints its dates ("${expected}")`);
    }

    /*
      The name is the nearest unused label to the bar's own height. A row is about
      267,000 EMU tall and a label sits within ~45,000 of its bar, so "nearest"
      is unambiguous unless the slide is unusual — and a name further away than
      half a row is rejected rather than accepted on faith.
    */
    const anchor = label?.y ?? bar.y ?? 0;
    let name = null;
    let bestGap = Infinity;
    for (const candidate of nameLabels) {
      if (takenNames.has(candidate)) continue;
      const gap = Math.abs((candidate.y ?? 0) - anchor);
      if (gap < bestGap) {
        bestGap = gap;
        name = candidate;
      }
    }
    if (name && bestGap <= 133_000) takenNames.add(name);
    else name = null;
    if (!name) problems.push(`bar ${index + 1}: no task name close enough to it`);
    // The nearest band label above or at this bar.
    const band =
      bands.length === 0
        ? null
        : bands.reduce((best, candidate) =>
            Math.abs((candidate.y ?? 0) - (bar.y ?? 0)) < Math.abs((best.y ?? 0) - (bar.y ?? 0))
              ? candidate
              : best,
          ).text;
    return {
      name: name?.text ?? null,
      start: bar.start,
      finish: bar.finish,
      band,
      checked: matches,
    };
  });

  return {
    slide: number,
    unitCode,
    delivery,
    titleText: titleShape?.text ?? null,
    matchedFrom,
    bands: bands.map((b) => b.text),
    activities,
    problems,
  };
}

// ── One slide, in full ───────────────────────────────────────────────────────

if (onlySlide) {
  const one = readSlide(onlySlide);
  if (!one) {
    console.error(`No slide ${onlySlide}.`);
    process.exit(1);
  }
  console.log(`slide ${one.slide}   unit: ${one.unitCode ?? "NOT FOUND"}`);
  console.log(`bands: ${one.bands.length ? one.bands.join(" | ") : "(none — one scope)"}`);
  console.log(`activities: ${one.activities.length}`);
  for (const a of one.activities) {
    console.log(
      `   ${a.start} → ${a.finish}  ${a.checked ? "ok " : "?? "} [${a.band ?? "-"}]  ${a.name ?? "(no name)"}`,
    );
  }
  if (one.problems.length) console.log(`\nproblems:\n   ${one.problems.join("\n   ")}`);
  process.exit(0);
}

// ── Everything ──────────────────────────────────────────────────────────────

const slides = slideNumbers.map(readSlide).filter(Boolean);
const withBars = slides.filter((s) => s.activities.length > 0);

const ready = withBars.filter((s) => s.delivery === "after" && s.problems.length === 0);
const readyButFlagged = withBars.filter((s) => s.delivery === "after" && s.problems.length > 0);
const beforeDelivery = withBars.filter((s) => s.delivery === "before");
const noUnit = withBars.filter((s) => !s.unitCode);

console.log(`file: ${FILE}`);
console.log(`slides: ${slides.length}   with a timeline: ${withBars.length}`);
console.log(`bars in total: ${withBars.reduce((n, s) => n + s.activities.length, 0)}`);
console.log(`unit codes in the sheet to match against: ${KNOWN_CODES.size}`);
console.log("");
console.log("what these slides are for:");
console.log(`  ready to import — an After Delivery unit, every bar checked: ${ready.length}`);
console.log(
  `  an After Delivery unit but something did not check out:      ${readyButFlagged.length}`,
);
console.log(
  `  a BEFORE Delivery unit, which this tool does not hold yet:   ${beforeDelivery.length}`,
);
console.log(`  no unit in the sheet by that name at all:                    ${noUnit.length}`);

const readyBars = ready.reduce((n, s) => n + s.activities.length, 0);
const readyUnits = new Set(ready.map((s) => s.unitCode));
console.log("");
console.log(`so: ${readyBars} bars across ${readyUnits.size} units could go in now.`);

const bandCounts = new Map();
for (const s of ready) bandCounts.set(s.bands.length, (bandCounts.get(s.bands.length) ?? 0) + 1);
console.log(
  `scope bands on those slides: ${[...bandCounts]
    .sort()
    .map(([n, c]) => `${n}→${c}`)
    .join("  ")}`,
);

const multi = ready.filter((s) => s.bands.length > 1);
if (multi.length) {
  console.log("");
  console.log(
    `slides with more than one scope band (${multi.length}) — these map onto separate quotations:`,
  );
  for (const s of multi.slice(0, 8)) console.log(`   ${s.unitCode}: ${s.bands.join(" | ")}`);
}

const repeats = new Map();
for (const s of ready) repeats.set(s.unitCode, (repeats.get(s.unitCode) ?? 0) + 1);
const twice = [...repeats].filter(([, n]) => n > 1);
if (twice.length) {
  console.log("");
  console.log(`units with more than one ready slide (${twice.length}) — needs a rule:`);
  for (const [code, n] of twice.slice(0, 10)) console.log(`   ${code} on ${n} slides`);
}

if (readyButFlagged.length) {
  console.log("");
  console.log("the After Delivery slides that did not check out:");
  for (const s of readyButFlagged.slice(0, 10)) {
    console.log(`   slide ${s.slide} ${s.unitCode}: ${s.problems[0]}`);
  }
}

if (noUnit.length) {
  console.log("");
  console.log(`titles with no matching unit (${noUnit.length}), first 15:`);
  console.log(
    "   " +
      noUnit
        .slice(0, 15)
        .map((s) => s.titleText ?? "?")
        .join(", "),
  );
}

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify(slides, null, 1), "utf8");
  console.log(`
written to ${jsonOut}`);
}
