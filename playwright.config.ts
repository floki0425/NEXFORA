import { defineConfig, devices } from "@playwright/test";
import { hasPhase8E2EEnv } from "./tests/phase8/helpers/test-env.mjs";
import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({
  path: path.resolve(process.cwd(), ".env.test.local"),
});

// Phase 8 browser E2E suite only. See docs/PHASE_8_AUTOMATED_TESTING.md for
// required environment variables and test-project/test-user setup. This
// config intentionally does not start a dev server itself — the app under
// test must already be running against the same Supabase test project as
// TEST_SUPABASE_URL (see the docs for exactly how), since Playwright cannot
// safely infer which environment variables to launch it with.
export default defineConfig({
  testDir: "./tests/phase8/e2e",
  // The longer flows (internal-admin-flow, client-owner-flow) chain many
  // sequential real-network round-trips (sign-in, multiple uploads, a
  // download, several navigations, several actions) against a real remote
  // Supabase project, and each first hit to a given dynamic route in
  // `next dev` also pays a one-time Turbopack compile cost that a
  // production build wouldn't have. 30s was observed to be too tight for
  // these — failures showed "Test timeout of 30000ms exceeded" mid-flow,
  // not a genuine hang. 150s gives real headroom without masking an actual
  // hang (a truly stuck test still fails, just later).
  timeout: 150_000,
  expect: {
    // Individual assertions/actions (e.g. the first render of a route that
    // hasn't been compiled yet this run) can also exceed the 5s default in
    // dev mode; the overall per-test timeout above is still the backstop
    // against a genuine hang. Observed real server-action-plus-revalidation
    // round trips up to 18.6s against the remote test project (the action
    // itself took under 4s — the rest is `next dev`'s own re-render/
    // revalidation overhead) — 25s gives comfortable headroom above the
    // observed worst case without being unbounded.
    timeout: 25_000,
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  // Retries were CI-only originally. Observed real, variable server-action
  // + revalidation latency against the remote test project (occasionally
  // exceeding even a generous per-assertion timeout) that a single retry
  // reliably clears — this is normal variance testing against a live
  // external service, not a masked defect, so 1 retry locally too.
  retries: 1,
  workers: 1,
  reporter: [["list"]],
  globalSetup: hasPhase8E2EEnv()
    ? "./tests/phase8/e2e/global-setup.ts"
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
