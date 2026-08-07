import { defineConfig, devices } from "@playwright/test";

/**
 * E2E smoke tests. Run against a local dev server by default:
 *   pnpm e2e
 * Or against a deployed URL:
 *   E2E_BASE_URL=https://<tool>.workers.dev pnpm e2e
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // Dedicated port + never reuse: on dev machines port 3000 often hosts
        // a DIFFERENT app's dev server, and silently testing against it
        // produces baffling failures. If 3100 is somehow taken, Playwright
        // fails loudly instead of testing the wrong app.
        command: "pnpm dev --port 3100",
        url: "http://localhost:3100",
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
