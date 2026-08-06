// Environment gating for Phase 12 integration tests.
//
// Phase 12 integration deliberately adds NO new environment variables. It
// reuses the same three TEST_SUPABASE_* values every integration suite since
// Phase 8 has used, and it creates its own ephemeral auth users per run
// through the service-role factory rather than depending on pre-provisioned
// fixture accounts. (Fixed TEST_P*_* accounts exist only for Playwright E2E,
// where a browser must log in as a stable identity.)
//
// Missing configuration must SKIP, never pass silently — a green run with no
// database behind it is worse than a red one.
import {
  getPhase8IntegrationSkipReason,
  getPhase8SupabaseTestConfig,
  hasPhase8IntegrationEnv,
  testRunId,
} from "../../phase8/helpers/test-env.mjs";

export { testRunId };

/** The TEST project this suite is allowed to touch. Never DEV. */
export const EXPECTED_TEST_PROJECT_REF = "akcxsmdodfgfqilavnlf";

export function getPhase12SupabaseTestConfig() {
  return getPhase8SupabaseTestConfig();
}

export function hasPhase12IntegrationEnv() {
  return hasPhase8IntegrationEnv();
}

export function getPhase12IntegrationSkipReason() {
  return getPhase8IntegrationSkipReason().replace("Phase 8", "Phase 12");
}

/**
 * Configuration for the Phase 12 E2E server and specs.
 *
 * Unlike Phases 8-11, Phase 12 E2E does NOT require phase-specific fixture
 * accounts in .env.test.local. Those phases pin a fixed email/password per
 * identity; Phase 12 instead provisions ephemeral identities in
 * global-setup through the service-role client -- the same lifecycle the
 * Phase 12 integration factory already uses -- and tears them down in
 * global-teardown. That keeps the number of permanent TEST accounts from
 * growing every phase, and means this suite runs from the same four values
 * every other Phase 12 tier already needs.
 *
 * Returns null (-> the suite SKIPS, never silently passes) when the shared
 * TEST project values or TEST_APP_URL are missing.
 */
export function getPhase12E2EConfig() {
  const supabase = getPhase8SupabaseTestConfig();
  if (!supabase) return null;

  const appUrl = (process.env.TEST_APP_URL ?? "").trim();
  if (!appUrl || appUrl.toLowerCase().includes("example.com")) return null;

  return { ...supabase, appUrl };
}

export function hasPhase12E2EEnv() {
  return getPhase12E2EConfig() !== null;
}

export function getPhase12E2ESkipReason() {
  return (
    "Phase 12 E2E skipped: TEST_SUPABASE_URL, TEST_SUPABASE_PUBLISHABLE_KEY, " +
    "TEST_SUPABASE_SECRET_KEY and TEST_APP_URL must all be set to real values " +
    "in .env.test.local. This is a missing-configuration skip, not a passing result."
  );
}

/**
 * Fail closed if the configured TEST_SUPABASE_URL is not the expected TEST
 * project. This is a second, independent guard alongside the CLI link check:
 * the CLI link governs `supabase` commands, while these tests connect through
 * TEST_SUPABASE_URL and would otherwise be entirely unconstrained by it.
 *
 * Returns the project ref on success; throws otherwise. Never prints a key.
 */
export function assertTestProjectRef() {
  const config = getPhase12SupabaseTestConfig();
  if (!config) {
    throw new Error("assertTestProjectRef() called without a configured TEST environment.");
  }

  const match = config.url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i);
  const ref = match?.[1];

  if (ref !== EXPECTED_TEST_PROJECT_REF) {
    throw new Error(
      `Refusing to run: TEST_SUPABASE_URL points at project "${ref ?? "unparsed"}", ` +
        `expected "${EXPECTED_TEST_PROJECT_REF}". Phase 12 integration tests must never ` +
        "run against another project.",
    );
  }

  return ref;
}
