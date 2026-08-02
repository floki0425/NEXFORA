import path from "node:path";

import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

import { hasPhase9E2EEnv } from "./tests/phase9/helpers/test-env.mjs";

loadEnv({
  path: path.resolve(process.cwd(), ".env.test.local"),
});

// Phase 9 browser E2E suite only. A separate config file (rather than
// folding this into playwright.config.ts's Phase 8 setup) because
// Playwright only supports one testDir/globalSetup pair per config, and
// Phase 9 needs its own dedicated globalSetup and fixture-id file — see
// tests/phase9/e2e/global-setup.ts for why the E2E test accounts must be
// distinct from Phase 8's. Same timeout/retry reasoning as
// playwright.config.ts (real network round-trips against a remote test
// project, plus next dev's first-hit Turbopack compile cost).
export default defineConfig({
  testDir: "./tests/phase9/e2e",
  timeout: 150_000,
  expect: {
    timeout: 25_000,
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 1,
  workers: 1,
  reporter: [["list"]],
  globalSetup: hasPhase9E2EEnv()
    ? "./tests/phase9/e2e/global-setup.ts"
    : undefined,
  use: {
    baseURL: process.env.TEST_APP_URL ?? "http://localhost:3000",
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
