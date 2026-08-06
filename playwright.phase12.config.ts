import { defineConfig, devices } from "@playwright/test";

import { getPhase12E2EConfig } from "./tests/phase12/helpers/test-env.mjs";

const phase12Config = getPhase12E2EConfig();
const phase12AppUrl = phase12Config?.appUrl ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/phase12/e2e",
  timeout: 150_000,
  expect: { timeout: 25_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  // Fixtures are shared across specs and cleaned up once in global teardown,
  // so the suite must never run two specs against them concurrently.
  workers: 1,
  reporter: [["list"]],
  globalSetup: phase12Config ? "./tests/phase12/e2e/global-setup.ts" : undefined,
  globalTeardown: phase12Config ? "./tests/phase12/e2e/global-teardown.ts" : undefined,
  webServer: {
    command: "npm run dev:e2e:phase12",
    url: phase12AppUrl,
    // Never adopt a server already running in this tree: it may be a
    // developer's dev server pointed at a different Supabase project.
    reuseExistingServer: false,
    // `dev:e2e:phase12` runs a full `next build` into its own distDir, so
    // every run pays a cold build. 300s matches the proven Phase 11 value.
    timeout: 300_000,
  },
  use: {
    baseURL: phase12AppUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 25_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
});
