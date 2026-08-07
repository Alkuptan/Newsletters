import { test, expect, type Page } from "@playwright/test";

/**
 * Auth smoke tests.
 *
 * Prerequisites:
 *   1. Local Supabase with dev users seeded:  pnpm db:reset
 *      (seeds admin@dev.local / member@dev.local, password devpassword123)
 *   2. App running: `pnpm dev`, or let the Playwright webServer in
 *      playwright.config.ts start it.
 *
 * These tests are deliberately loose about shell markup (another slice owns
 * it): they look for a nav landmark and a control named /sign out/i, not for
 * specific components.
 */

const PASSWORD = "devpassword123";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/^password$/i).fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test("anonymous visit to / redirects to /login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
});

test("admin can sign in and lands on the app shell", async ({ page }) => {
  await login(page, "admin@dev.local");
  await expect(page.getByRole("navigation").first()).toBeVisible();
});

test("sign out returns to /login", async ({ page }) => {
  await login(page, "admin@dev.local");

  // Sign-out may be a top-level control or tucked into a user menu.
  const signOutControl = page
    .getByRole("button", { name: /sign out/i })
    .or(page.getByRole("link", { name: /sign out/i }))
    .or(page.getByRole("menuitem", { name: /sign out/i }));

  if (
    !(await signOutControl
      .first()
      .isVisible()
      .catch(() => false))
  ) {
    await page
      .getByRole("button", { name: /account|profile|user|menu|admin/i })
      .first()
      .click();
  }
  await signOutControl.first().click();

  await page.waitForURL(/\/login/);
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
});

test("member cannot access /admin/users", async ({ page }) => {
  await login(page, "member@dev.local");

  await page.goto("/admin/users");
  await page.waitForLoadState();

  const path = new URL(page.url()).pathname;
  if (path.startsWith("/admin")) {
    // Rendered in place — must be an access-denied state, not the user table.
    await expect(
      page.getByText(/access denied|not authorized|no permission|don't have permission/i).first(),
    ).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
  } else {
    // Or the role guard bounced them home.
    expect(path).toBe("/");
  }
});
