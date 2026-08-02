import { defineConfig, devices } from "@playwright/test";

import { getPhase8E2EConfig } from "./tests/phase8/helpers/test-env.mjs";

const phase8Config = getPhase8E2EConfig();
const phase8AppUrl = phase8Config?.appUrl ?? "http://localhost:3000";

// Phase 8 browser E2E suite only. See docs/PHASE_8_AUTOMATED_TESTING.md for
// required environment variables and test-project/test-user setup. The
// repository-owned server launcher maps the dedicated TEST_SUPABASE_* values
// to the exact app-facing names before Next.js loads .env.local.
export default defineConfig({
  testDir: "./tests/phase8/e2e",
  // The longer flows chain many sequential real-network round-trips against
  // the dedicated TEST project. The production E2E server removes dev-mode
  // compilation from this budget; 150s remains the finite workflow backstop.
  timeout: 150_000,
  expect: {
    // Remote server actions may exceed Playwright's 5s default. The overall
    // per-test timeout above remains the backstop against a genuine hang.
    timeout: 25_000,
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  globalSetup: phase8Config
    ? "./tests/phase8/e2e/global-setup.ts"
    : undefined,
  webServer: {
    command: "npm run dev:e2e:phase8",
    url: phase8AppUrl,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  use: {
    baseURL: phase8AppUrl,
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
