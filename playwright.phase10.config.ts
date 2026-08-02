import { defineConfig, devices } from "@playwright/test";

import { getPhase10E2EConfig } from "./tests/phase10/helpers/test-env.mjs";

const phase10Config = getPhase10E2EConfig();
const phase10AppUrl = phase10Config?.appUrl ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/phase10/e2e",
  timeout: 150_000,
  expect: { timeout: 25_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  globalSetup: phase10Config
    ? "./tests/phase10/e2e/global-setup.ts"
    : undefined,
  webServer: {
    command: "npm run dev:e2e:phase10",
    url: phase10AppUrl,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  use: {
    baseURL: phase10AppUrl,
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
