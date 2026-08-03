import { defineConfig, devices } from "@playwright/test";

import { getPhase11E2EConfig } from "./tests/phase11/helpers/test-env.mjs";

const phase11Config = getPhase11E2EConfig();
const phase11AppUrl = phase11Config?.appUrl ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/phase11/e2e",
  timeout: 150_000,
  expect: { timeout: 25_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  globalSetup: phase11Config ? "./tests/phase11/e2e/global-setup.ts" : undefined,
  webServer: {
    command: "npm run dev:e2e:phase11",
    url: phase11AppUrl,
    reuseExistingServer: false,
    // `npm run dev:e2e:phase11` runs a full `next build` before serving, and
    // that build cannot reuse a warm cache: Next.js wipes the distDir at the
    // start of every build, and this phase builds into its own
    // `.next/e2e-phase-11-e2e`, so the cache goes with it. Every E2E run
    // therefore pays a cold build. Measured at 179s on a developer machine
    // under load — comfortably over the 120s the other phase configs use, which
    // fails as `Timed out waiting 120000ms from config.webServer` before a
    // single test runs. 300s matches the current default Vercel function
    // ceiling and leaves headroom without masking a genuine hang: the 150s
    // per-test `timeout` above is still the backstop for that.
    timeout: 300_000,
  },
  use: {
    baseURL: phase11AppUrl,
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
