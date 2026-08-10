/**
 * Build the list of figures that must never be published, from the live sheet.
 *
 * Writes `.publish-denylist.txt`, which is gitignored. The list is derived rather
 * than typed for two reasons:
 *
 * 1. A hand-written list of the owner's contract values IS the leak. The first
 *    version of the checker held them inline, so publishing the checker would
 *    have published every figure it was meant to protect — the check caught
 *    itself, which is the only reason it did not happen.
 * 2. The sheet changes. A derived list picks up new quotations for free; a typed
 *    one silently goes stale and reports "clean" about data it has never seen.
 *
 * Usage: pnpm check:publishable:build
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

const SAMPLE_DIR = "Sample";
const OUT = ".publish-denylist.txt";

/** The tabs the tool reads, and the columns worth protecting. */
const TABS = ["After Delivery Extra works", "Before Delivery Extra works"];
const ID_COLUMNS = ["quote #", "invoice #"];
const VALUE_COLUMNS = ["value of invoice", "dry cost", "value of agreement"];

/** The header row, 1-based as Excel shows it (row 1 holds the tab's title). */
const HEADER_ROW = 2;

/** Below this, a number is too likely to collide with a timeout or a limit. */
const MIN_VALUE = 100_000;

/*
  Round values are skipped. A contract value of exactly 120,000 is barely
  identifying, while 120_000 is a perfectly ordinary Playwright timeout — so
  including it produces a false alarm on every run, and an alarm that cries wolf
  gets ignored, which is how the figure it was guarding got published in the first
  place. The values worth keeping are the distinctive ones — an odd figure with
  piastres on the end — and those are exactly what this keeps.

  NOTE TO WHOEVER EDITS THIS FILE: do not paste a real figure in to illustrate a
  point. That has now happened three times — in PROJECT.md, in the checker's own
  denylist, and here — and each time it published, or nearly published, the thing
  the code was written to protect.
*/
const isRound = (value) => value % 1000 === 0;

let workbookName;
try {
  workbookName = readdirSync(SAMPLE_DIR).find((f) => /\.xlsm$/i.test(f));
} catch {
  console.error(`build-publish-denylist: no ${SAMPLE_DIR}/ directory on this machine.`);
  process.exit(1);
}
if (!workbookName) {
  console.error(`build-publish-denylist: no .xlsm workbook in ${SAMPLE_DIR}/.`);
  process.exit(1);
}

const workbook = XLSX.read(readFileSync(path.join(SAMPLE_DIR, workbookName)), { type: "buffer" });

/** Every way a figure might be written in code or prose. */
function forms(value) {
  const out = new Set();
  const plain = String(value);
  const [whole, decimals] = plain.split(".");
  const group = (sep) => whole.replace(/\B(?=(\d{3})+(?!\d))/g, sep);

  for (const base of [plain, whole]) out.add(base);
  for (const sep of [",", "_"]) {
    out.add(group(sep));
    if (decimals) out.add(`${group(sep)}.${decimals}`);
  }
  if (typeof value === "number") {
    const rounded = String(Math.round(value));
    out.add(rounded);
    out.add(rounded.replace(/\B(?=(\d{3})+(?!\d))/g, ","));
  }
  return [...out];
}

const tokens = new Set();
for (const tab of TABS) {
  const sheet = workbook.Sheets[tab];
  if (!sheet) continue;
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const headers = (grid[HEADER_ROW - 1] ?? []).map((h) => String(h).trim().toLowerCase());

  for (const row of grid.slice(HEADER_ROW)) {
    headers.forEach((header, column) => {
      const cell = row[column];
      if (ID_COLUMNS.includes(header)) {
        const id = String(cell ?? "").trim();
        // 5+ digits, and not a round thousand: four-digit ids collide with
        // years, and 20000 is both a plausible reference and a plausible pixel
        // offset. Round numbers identify nobody.
        if (/^\d{5,6}$/.test(id) && !isRound(Number(id))) tokens.add(id);
      }
      if (
        VALUE_COLUMNS.includes(header) &&
        typeof cell === "number" &&
        cell >= MIN_VALUE &&
        !isRound(cell)
      ) {
        for (const form of forms(cell)) tokens.add(form);
      }
    });
  }
}

if (tokens.size === 0) {
  console.error("build-publish-denylist: found nothing — the columns may have been renamed.");
  process.exit(1);
}

writeFileSync(OUT, [...tokens].join("\n") + "\n", "utf8");
console.log(
  `build-publish-denylist: wrote ${tokens.size} forms to ${OUT} (gitignored) from ${workbookName}.`,
);
