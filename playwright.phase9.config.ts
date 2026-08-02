import { defineConfig, devices } from "@playwright/test";

import { getPhase9E2EConfig } from "./tests/phase9/helpers/test-env.mjs";

const phase9Config = getPhase9E2EConfig();
const phase9AppUrl = phase9Config?.appUrl ?? "http://localhost:3000";

// Phase 9 browser E2E suite only. A separate config file (rather than
// folding this into playwright.config.ts's Phase 8 setup) because
// Playwright only supports one testDir/globalSetup pair per config, and
// Phase 9 needs its own dedicated globalSetup and fixture-id file — see
// tests/phase9/e2e/global-setup.ts for why the E2E test accounts must be
// distinct from Phase 8's. The shared launcher builds an isolated production
// bundle first, so route compilation is outside each test's timeout budget.
//
// The repository-owned server launcher maps the dedicated TEST_SUPABASE_*
// values to the exact app-facing names before Next.js loads .env.local, so
// the application under test and the Phase 9 fixtures always use the same
// TEST Supabase project. `.env.test.local` itself is loaded as a top-level
// side effect of importing the Phase 8 test-env helper (which the Phase 9
// helper re-exports from), so no separate dotenv call is needed here.
export default defineConfig({
  testDir: "./tests/phase9/e2e",
  timeout: 150_000,
  expect: {
    timeout: 25_000,
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  globalSetup: phase9Config
    ? "./tests/phase9/e2e/global-setup.ts"
    : undefined,
  webServer: {
    command: "npm run dev:e2e:phase9",
    url: phase9AppUrl,
    // Never silently reuse an app started from .env.local: that server would
    // point at a different Supabase project than the fixtures, and sign-in
    // would fail in a way that looks like bad credentials.
    reuseExistingServer: false,
    timeout: 120_000,
  },
  use: {
    baseURL: phase9AppUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 25_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
