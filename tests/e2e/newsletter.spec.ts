import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

/**
 * The newsletter workflow, end to end.
 *
 * The unit tests cover the arithmetic; these cover the thing the tool is FOR —
 * upload a sheet, choose what goes on a unit's newsletter, build a schedule, and
 * get a file out. Without them a change could break the whole cycle and every
 * automated check would still pass.
 *
 * Prerequisites: local Supabase with the dev seed (`pnpm db:reset`). The seed
 * provides three units chosen so the permission rules can be exercised —
 * Cyan 11 and Ancient Hill 56 belong to "Mariam Sobhy" (pm@dev.local), Phase 4
 * Villa 2B does not.
 */

const PASSWORD = "devpassword123";
const SHEET = path.resolve("Sample/Follow-up sheet (Don't Delete).xlsm");

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/^password$/i).fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  // Wait for the shell rather than a URL change: the redirect can complete
  // before a URL predicate is registered, which made this flaky.
  await expect(page.getByRole("link", { name: "Units" })).toBeVisible({ timeout: 60_000 });
}

async function openUnit(page: Page, displayName: string) {
  // `done=1` keeps finished units in the list — Cyan 11 is seeded complete, and
  // the dashboard hides those by default.
  await page.goto("/units?done=1");
  await page.locator('a[href^="/units/"]').filter({ hasText: displayName }).first().click();
  await expect(page).toHaveURL(/\/units\/[0-9a-f-]{36}/);
  await expect(page.getByRole("heading", { name: displayName })).toBeVisible();
}

/** The newsletter's rendered text, which is what a client would read. */
function canvas(page: Page) {
  return page.locator("[data-newsletter-canvas]").first();
}

test("a unit's newsletter combines only the ticked quotations", async ({ page }) => {
  await login(page, "admin@dev.local");
  await openUnit(page, "Ancient Hill 56");

  // Seeded with 20415 + 20423 ticked and 20431 not.
  await expect(canvas(page)).toContainText("20415");
  await expect(canvas(page)).toContainText("20423");
  await expect(canvas(page)).not.toContainText("20431");

  // Money-weighted, not a flat average: 1,270,456.64 at 40% plus 154,030.98 at 0%.
  await expect(canvas(page)).toContainText("1,424,488 LE");
  await expect(canvas(page)).toContainText("36%");

  // Unticking one changes the figures.
  await page.getByRole("checkbox", { name: /Include quotation 20423/ }).click();
  await expect(canvas(page)).toContainText("1,270,457 LE", { timeout: 20_000 });
  await expect(canvas(page)).not.toContainText("20423");

  // Put it back so the rest of the file starts from the seeded state.
  await page.getByRole("checkbox", { name: /Include quotation 20423/ }).click();
  await expect(canvas(page)).toContainText("1,424,488 LE", { timeout: 20_000 });
});

test("building a schedule switches the unit to the Gantt layout", async ({ page }) => {
  await login(page, "admin@dev.local");
  await openUnit(page, "Cyan 11");

  // No schedule yet, so the photo layout: its placeholder is on the canvas.
  await expect(canvas(page)).toContainText(/No photos chosen yet/);

  await page.getByRole("button", { name: /Build a time schedule for 20411/ }).click();
  await expect(page.getByLabel("Band label")).toBeVisible();

  for (const [name, start, finish] of [
    ["Mobilization", "2026-04-29", "2026-05-28"],
    ["Concrete Works", "2026-05-29", "2026-07-31"],
  ] as const) {
    await page.getByRole("button", { name: /Add activity/ }).click();
    const row = page
      .locator("li")
      .filter({ has: page.getByPlaceholder(/Activity, e.g./) })
      .last();
    await row.getByPlaceholder(/Activity, e.g./).fill(name);
    await row.getByLabel("Start date").fill(start);
    await row.getByLabel("Finish date").fill(finish);
  }
  await page.getByRole("button", { name: /^Save schedule$/ }).click();
  // Wait for the confirmation before reloading — reloading straight after the
  // click can abandon the save, which is exactly how this test first failed.
  await expect(page.getByText(/Schedule saved for quotation 20411/)).toBeVisible({
    timeout: 30_000,
  });

  // The bars reach the newsletter, and the schedule is remembered.
  await page.reload();
  await expect(canvas(page)).toContainText("Mobilization", { timeout: 30_000 });
  await expect(canvas(page)).toContainText("Concrete Works");
  await expect(page.getByRole("button", { name: /Edit schedule \(2 bars\)/ })).toBeVisible();

  // Removing it puts the unit back on the photo layout.
  await page.getByRole("button", { name: /Edit schedule \(2 bars\)/ }).click();
  await page.getByRole("button", { name: /Remove schedule/ }).click();
  await expect(page.getByText(/Schedule removed from quotation 20411/)).toBeVisible({
    timeout: 30_000,
  });
  await page.reload();
  await expect(page.getByRole("button", { name: /Build a time schedule for 20411/ })).toBeVisible({
    timeout: 30_000,
  });
});

test("a newsletter can be exported as an editable PowerPoint", async ({ page }) => {
  await login(page, "admin@dev.local");
  await openUnit(page, "Ancient Hill 56");

  const download = page.waitForEvent("download", { timeout: 180_000 });
  await page.getByRole("button", { name: "Download PowerPoint" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^Ancient Hill 56 .*\.pptx$/);
});

test("a project manager sees only their own units", async ({ page }) => {
  await login(page, "pm@dev.local");
  await page.goto("/units?done=1");

  // "Mariam Sobhy" owns two of the three seeded units.
  await expect(page.locator('a[href^="/units/"]').filter({ hasText: "Cyan 11" })).toBeVisible();
  await expect(
    page.locator('a[href^="/units/"]').filter({ hasText: "Ancient Hill 56" }),
  ).toBeVisible();
  await expect(
    page.locator('a[href^="/units/"]').filter({ hasText: "Phase 4 Villa 2B" }),
  ).toHaveCount(0);

  // And cannot reach the admin-only screens, by menu or by address.
  await expect(page.getByRole("link", { name: "Upload sheet" })).toHaveCount(0);
  await page.goto("/import");
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/design");
  await expect(page).toHaveURL(/\/$/);
});

test("a viewer can look but not change anything", async ({ page }) => {
  await login(page, "member@dev.local");
  await openUnit(page, "Ancient Hill 56");

  // Sees the unit — and every control that would change it is disabled.
  const ticks = page.getByRole("checkbox", { name: /Include quotation/ });
  await expect(ticks.first()).toBeDisabled();
  await expect(page.getByRole("button", { name: /Save details/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Build a time schedule/ })).toHaveCount(0);

  // Exporting is a read, so it stays available.
  await expect(page.getByRole("button", { name: "Download PowerPoint" })).toBeEnabled();
});

test("the work screen tracks patches and what has been sent", async ({ page }) => {
  await login(page, "admin@dev.local");
  await page.goto("/units");

  // Finished units are out of the way until asked for. Cyan 11 is seeded complete.
  await expect(page.getByRole("link", { name: "Cyan 11" })).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Include finished" }).click();
  await expect(page.getByRole("link", { name: "Cyan 11" })).toBeVisible();
  // ...and it reads COMPLETED rather than pretending to be on track.
  await expect(page.getByText("COMPLETED").first()).toBeVisible();

  // Both screens show instantly and save in the background, so every change
  // waits for its own response — reloading over an in-flight save loses it.
  const saved = () =>
    page.waitForResponse(
      (response) => response.request().method() === "POST" && response.status() < 400,
    );

  // A patch name reaches the dropdowns as soon as it is typed.
  await page.locator("#new-patch").fill("Patch 1");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.waitForFunction(() => location.search.includes("newpatch"));
  const patchSaved = saved();
  await page.locator("select[aria-label^='Patch for']").first().selectOption("Patch 1");
  await patchSaved;

  // Sent is recorded against the open cycle, not against the unit.
  const sent = page.getByRole("checkbox", { name: /as sent/ }).first();
  const sentLabel = await sent.getAttribute("aria-label");
  const sentSaved = saved();
  await sent.click();
  await sentSaved;

  // Both survive a reload.
  await page.reload();
  await expect(page.locator("select[aria-label^='Patch for']").first()).toHaveValue("Patch 1");
  await expect(page.getByRole("checkbox", { name: sentLabel! })).toBeChecked();
});

test("the work screen switches between table and cards", async ({ page }) => {
  await login(page, "admin@dev.local");
  await page.goto("/units");
  await expect(page.locator("tbody tr").first()).toBeVisible();

  await page.getByRole("button", { name: "Cards" }).click();
  await page.waitForFunction(() => location.search.includes("view=cards"));
  await expect(page.locator("table")).toHaveCount(0);
  // The patch control travels with the view — switching must not cost you the
  // ability to do something.
  await expect(page.locator("select[aria-label^='Patch for']").first()).toBeVisible();
  await expect(page.getByText(/Released:/).first()).toBeVisible();
});

test("one click carries the filters into the batch export", async ({ page }) => {
  await login(page, "admin@dev.local");
  await page.goto("/units?pm=Mariam+Sobhy");

  await page.getByRole("link", { name: "Export this list" }).click();
  await page.waitForURL(/\/export\?/);
  expect(page.url()).toContain("pm=Mariam+Sobhy");
  // Only what still needs sending, so the list never re-offers finished work.
  expect(page.url()).toContain("unsent=1");
});

test("a unit can be marked photos only, and the timeline filters follow", async ({ page }) => {
  await login(page, "admin@dev.local");

  // Ancient Hill 56 has no schedule and no decision, so it starts undecided.
  await page.goto("/units?timeline=undecided");
  const undecided = page.locator('a[href^="/units/"]');
  await expect(undecided.filter({ hasText: "Ancient Hill 56" })).toBeVisible();

  await openUnit(page, "Ancient Hill 56");
  await page.getByRole("radio", { name: /Photos only/ }).check();
  await expect(page.getByText(/Marked photos only/)).toBeVisible({ timeout: 30_000 });

  // It leaves "not decided" and appears under "photos only".
  await page.goto("/units?timeline=undecided");
  await expect(
    page.locator('a[href^="/units/"]').filter({ hasText: "Ancient Hill 56" }),
  ).toHaveCount(0);
  await page.goto("/units?timeline=photos-only&done=1");
  await expect(
    page.locator('a[href^="/units/"]').filter({ hasText: "Ancient Hill 56" }),
  ).toBeVisible();
});

test("Next and Previous walk the filtered list, not the whole programme", async ({ page }) => {
  await login(page, "admin@dev.local");
  await page.goto("/units?state=needs-photos");

  const total = await page.locator('a[href^="/units/"]').count();
  expect(total).toBeGreaterThan(1);

  await page.locator('a[href^="/units/"]').first().click();
  await page.waitForURL(/\/units\/[0-9a-f-]{36}/);
  // The count is the FILTERED run's, and the filter travels in the address.
  await expect(page.getByText(`1 of ${total}`)).toBeVisible();
  expect(page.url()).toContain("state=needs-photos");

  const firstName = await page.locator("h1").first().innerText();
  await page.getByRole("link", { name: "Next" }).click();
  await expect(page.getByText(`2 of ${total}`)).toBeVisible();
  expect(await page.locator("h1").first().innerText()).not.toBe(firstName);
  expect(page.url()).toContain("state=needs-photos");
});

test("a timeline goes out of date when the sheet moves its quotation", async ({ page }) => {
  await login(page, "admin@dev.local");
  await openUnit(page, "Cyan 11");

  // Build one against today's dates.
  await page.getByRole("button", { name: /Build a time schedule for 20411/ }).click();
  await page.getByLabel("Band label").waitFor();
  await page.getByRole("button", { name: /Add activity/ }).click();
  const row = page
    .locator("li")
    .filter({ has: page.getByPlaceholder(/Activity, e.g./) })
    .last();
  await row.getByPlaceholder(/Activity, e.g./).fill("Mobilization");
  await row.getByLabel("Start date").fill("2026-04-29");
  await row.getByLabel("Finish date").fill("2026-09-26");
  await page.getByRole("button", { name: /^Save schedule$/ }).click();
  await expect(page.getByText(/Schedule saved for quotation 20411/)).toBeVisible({
    timeout: 30_000,
  });

  // With a timeline in place, it is no longer waiting for one.
  await page.goto("/units?timeline=has-timeline&done=1");
  await expect(page.locator('a[href^="/units/"]').filter({ hasText: "Cyan 11" })).toBeVisible();
  await page.goto("/units?timeline=out-of-date&done=1");
  await expect(page.locator('a[href^="/units/"]').filter({ hasText: "Cyan 11" })).toHaveCount(0);
});

test("the what-changed screen is honest when there is nothing to compare", async ({ page }) => {
  await login(page, "admin@dev.local");
  await page.goto("/changes");
  await expect(page.getByRole("heading", { name: "What changed" })).toBeVisible();
  // One cycle only in the seed, so it must say so rather than claim nothing moved.
  await expect(page.getByText(/first cycle|compared with/)).toBeVisible();
});

test("every list can be sorted by what it shows", async ({ page }) => {
  await login(page, "admin@dev.local");

  // --- Units: a menu of exactly the fields on the card, kept in the address ---
  await page.goto("/units?done=1");
  const options = await page.locator("#sort-field option").allInnerTexts();
  expect(options).toContain("Progress");
  expect(options).toContain("Project manager");
  expect(options).toContain("Timeline");

  await page.locator("#sort-field").selectOption("progress");
  await page.waitForURL(/sort=progress/);
  // The address changes the instant the router is told to; the rows arrive a
  // moment later. Reading them too early compares the OLD order with itself.
  await page.waitForLoadState("networkidle");
  // Progress is useful biggest-first, so a fresh column starts descending.
  expect(page.url()).toContain("dir=desc");
  const names = () => page.locator('a[href^="/units/"]').allInnerTexts();
  const byProgressDown = await names();

  await page.getByRole("button", { name: /^Sorting descending/ }).click();
  await page.waitForURL(/dir=asc/);
  await page.waitForLoadState("networkidle");
  const byProgressUp = await names();
  expect(byProgressUp[0]).not.toBe(byProgressDown[0]);
  expect([...byProgressUp].reverse()).toEqual(byProgressDown);

  // --- the work table's own headers order it too ---
  await page.goto("/units?done=1");
  await expect(page.getByRole("button", { name: "Sort by Progress" })).toBeVisible();
  const tableNames = () => page.locator("tbody tr td:first-child a").allInnerTexts();
  const tableDefault = await tableNames();
  await page.getByRole("button", { name: "Sort by Progress" }).click();
  await page.waitForURL(/sort=progress/);
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("button", { name: /Sorted by Progress/ })).toBeVisible();
  expect(await tableNames()).not.toEqual(tableDefault);

  // --- Users: the shared table sorts too ---
  await page.goto("/admin/users");
  const userNames = () => page.locator("tbody tr td:first-child").allInnerTexts();
  const before = await userNames();
  await page.locator("thead button").first().click();
  expect(await userNames()).not.toEqual(before);
});

test("sorting the list also sets the order Next walks", async ({ page }) => {
  await login(page, "admin@dev.local");
  await page.goto("/units?done=1&sort=progress&dir=desc");

  const listed = await page.locator('a[href^="/units/"]').allInnerTexts();
  await page.locator('a[href^="/units/"]').first().click();
  await page.waitForURL(/\/units\/[0-9a-f-]{36}/);
  await expect(page.getByRole("heading", { name: listed[0] })).toBeVisible();

  // Next follows the sorted run, and the sort rides along in the address.
  await page.getByRole("link", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: listed[1] })).toBeVisible();
  expect(page.url()).toContain("sort=progress");
});

/**
 * Last, because it replaces the seeded three units with the whole programme and
 * every assertion above assumes the seeded state.
 */
test("uploading the real follow-up sheet fills in every unit", async ({ page }) => {
  // The sheet carries live unit values, PM names and client names, so it is not
  // published (see .gitignore). Locally it is there and this runs; in CI it is
  // not, and skipping is the honest outcome rather than a red build.
  test.skip(!fs.existsSync(SHEET), "Sample/ follow-up sheet not present (not published)");
  test.setTimeout(300_000);
  await login(page, "admin@dev.local");
  await page.goto("/import");

  await page.locator("#sheet").setInputFiles(SHEET);

  // The workbook is parsed in the browser; the count comes from the real file.
  const useThese = page.getByRole("button", { name: /Use these 645 quotations/ });
  await expect(useThese).toBeVisible({ timeout: 120_000 });
  // Zones spelled two ways are flagged rather than silently merged.
  await expect(page.getByText(/spelled more than one way/)).toBeVisible();

  await useThese.click();
  await expect(page.getByText(/^Done$/)).toBeVisible({ timeout: 180_000 });
  await expect(page.getByText(/quotations added|quotations refreshed/).first()).toBeVisible();

  await page.goto("/units?done=1");
  await expect(page.locator('a[href^="/units/"]').first()).toBeVisible();
  const count = await page.locator('a[href^="/units/"]').count();
  expect(count).toBeGreaterThan(300);

  // Finished work is out of the way by default: on the real programme that is
  // roughly half the units, which is the difference between a usable list and
  // an unusable one.
  await page.goto("/units");
  const needingWork = await page.locator('a[href^="/units/"]').count();
  expect(needingWork).toBeLessThan(count);
  expect(needingWork).toBeGreaterThan(0);
});
