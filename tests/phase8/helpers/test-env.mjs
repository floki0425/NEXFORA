// Shared environment gating for Phase 8 integration/E2E tests.
//
// Every integration test in tests/phase8/integration/ and every Playwright
// spec in tests/phase8/e2e/ must call one of the guards below before doing
// any real network/database work, and must SKIP (never silently pass, never
// hard-fail the whole suite) when the required test project/credentials are
// not configured. See docs/PHASE_8_AUTOMATED_TESTING.md for how to configure
// a real, dedicated non-production Supabase project for these.
//
// Loading .env.test.local is this module's responsibility, done once here as
// a top-level side effect, rather than in every consumer (playwright.config.ts,
// each *.spec.ts, each integration test, global-setup.ts). Every one of those
// files imports from this module before calling any of its exports, and
// module evaluation runs this load exactly once and before any importer's
// own code — so process.env is always populated before getPhase8E2EConfig()
// or getPhase8SupabaseTestConfig() ever reads it, regardless of which file
// Playwright/node happens to load first. `override: false` means a real CI
// secret already present in process.env always wins over anything read from
// the file, so CI never depends on — or can be confused by — this file.
//
// The path is resolved from process.cwd() rather than import.meta.url: every
// consumer (`node --test`, `npm run test:phase8`, and `playwright test`) is
// always invoked from the project root, matching the same process.cwd()
// convention global-setup.ts already relies on for its fixture-ids path.
// import.meta.url was tried first, but Playwright's own config/dependency
// loader compiles this file in a context where `import.meta` is unavailable
// (it errors with "Cannot use 'import.meta' outside a module") even though
// plain `node --test` handles it fine — process.cwd() works identically in
// both.
import path from "node:path";

import { config as loadEnv } from "dotenv";

loadEnv({
  path: path.resolve(process.cwd(), ".env.test.local"),
  override: false,
  quiet: true,
});

// Known placeholder values from .env.example / docs so a copy-pasted template
// is treated the same as a missing variable, instead of being sent to
// Supabase as a real (and confusingly wrong) credential. Matched
// case-insensitively as a substring, so "viewer@example.com" is caught by
// the "example.com" entry without needing the exact full placeholder value.
const PLACEHOLDER_VALUES = [
  "your_test_project",
  "your_test_publishable_key",
  "your_test_secret_key",
  "your-test-password",
  "example.com",
];

function isPlaceholderValue(value) {
  const normalized = value.trim().toLowerCase();
  return PLACEHOLDER_VALUES.some((placeholder) =>
    normalized.includes(placeholder),
  );
}

// Reads and trims an env var. Trimming matters here specifically because
// these values round-trip through a `.env` file a human edits by hand —
// unlike values set directly in `process.env` by a shell/CI, a stray
// trailing space after `KEY=value ` is easy to introduce and would
// otherwise silently produce a broken URL/email/password.
function readVar(name) {
  const raw = process.env[name];
  return typeof raw === "string" ? raw.trim() : undefined;
}

// Checks a list of required variable names against the current environment
// and buckets each into "missing" (unset or blank) or "placeholder" (set,
// but to a known template value) — never returning the values themselves,
// so callers can build a skip reason that names only the variables, never
// their contents.
function findInvalidVars(names) {
  const missing = [];
  const placeholder = [];
  for (const name of names) {
    const value = readVar(name);
    if (!value) {
      missing.push(name);
    } else if (isPlaceholderValue(value)) {
      placeholder.push(name);
    }
  }
  return { missing, placeholder };
}

function buildSkipReason(label, ...issueLists) {
  const missing = issueLists.flatMap((issues) => issues.missing);
  const placeholder = issueLists.flatMap((issues) => issues.placeholder);

  const parts = [];
  if (missing.length > 0) {
    parts.push(`missing ${missing.join(", ")}`);
  }
  if (placeholder.length > 0) {
    parts.push(`placeholder value in ${placeholder.join(", ")}`);
  }

  const detail =
    parts.length > 0
      ? parts.join("; ")
      : "required test environment variables are not configured";

  return (
    `${label} skipped: ${detail}. Set real values in .env.test.local ` +
    "(see docs/PHASE_8_AUTOMATED_TESTING.md). This is a missing-configuration " +
    "skip, not a passing result."
  );
}

const SUPABASE_TEST_VARS = [
  "TEST_SUPABASE_URL",
  "TEST_SUPABASE_PUBLISHABLE_KEY",
  "TEST_SUPABASE_SECRET_KEY",
];

export function getPhase8SupabaseTestConfig() {
  // Read into local consts and guard each one by name (rather than reusing
  // findInvalidVars()'s array here) so TypeScript's control-flow narrowing
  // can see that every field is a definite `string` — not `string |
  // undefined` — for the return statement below. A `.some()` over an array
  // of these same values would report the same missing/placeholder
  // condition but does not narrow the individual named variables.
  const url = readVar("TEST_SUPABASE_URL");
  const publishableKey = readVar("TEST_SUPABASE_PUBLISHABLE_KEY");
  const secretKey = readVar("TEST_SUPABASE_SECRET_KEY");

  if (
    !url ||
    !publishableKey ||
    !secretKey ||
    isPlaceholderValue(url) ||
    isPlaceholderValue(publishableKey) ||
    isPlaceholderValue(secretKey)
  ) {
    return null;
  }

  return { url, publishableKey, secretKey };
}

export function hasPhase8IntegrationEnv() {
  return getPhase8SupabaseTestConfig() !== null;
}

export function getPhase8IntegrationSkipReason() {
  return buildSkipReason(
    "Phase 8 integration",
    findInvalidVars(SUPABASE_TEST_VARS),
  );
}

const E2E_ONLY_VARS = [
  "TEST_APP_URL",
  "TEST_INTERNAL_ADMIN_EMAIL",
  "TEST_INTERNAL_ADMIN_PASSWORD",
  "TEST_CLIENT_OWNER_EMAIL",
  "TEST_CLIENT_OWNER_PASSWORD",
  "TEST_CLIENT_VIEWER_EMAIL",
  "TEST_CLIENT_VIEWER_PASSWORD",
];

export function getPhase8E2EConfig() {
  const supabase = getPhase8SupabaseTestConfig();

  // Same reasoning as getPhase8SupabaseTestConfig(): read into named
  // consts and guard each individually so every field is narrowed to
  // `string` by the time the return statement below runs.
  const appUrl = readVar("TEST_APP_URL");
  const internalAdminEmail = readVar("TEST_INTERNAL_ADMIN_EMAIL");
  const internalAdminPassword = readVar("TEST_INTERNAL_ADMIN_PASSWORD");
  const clientOwnerEmail = readVar("TEST_CLIENT_OWNER_EMAIL");
  const clientOwnerPassword = readVar("TEST_CLIENT_OWNER_PASSWORD");
  const clientViewerEmail = readVar("TEST_CLIENT_VIEWER_EMAIL");
  const clientViewerPassword = readVar("TEST_CLIENT_VIEWER_PASSWORD");

  if (
    !supabase ||
    !appUrl ||
    !internalAdminEmail ||
    !internalAdminPassword ||
    !clientOwnerEmail ||
    !clientOwnerPassword ||
    !clientViewerEmail ||
    !clientViewerPassword ||
    isPlaceholderValue(appUrl) ||
    isPlaceholderValue(internalAdminEmail) ||
    isPlaceholderValue(internalAdminPassword) ||
    isPlaceholderValue(clientOwnerEmail) ||
    isPlaceholderValue(clientOwnerPassword) ||
    isPlaceholderValue(clientViewerEmail) ||
    isPlaceholderValue(clientViewerPassword)
  ) {
    return null;
  }

  return {
    ...supabase,
    appUrl,
    internalAdmin: { email: internalAdminEmail, password: internalAdminPassword },
    clientOwner: { email: clientOwnerEmail, password: clientOwnerPassword },
    clientViewer: { email: clientViewerEmail, password: clientViewerPassword },
  };
}

export function hasPhase8E2EEnv() {
  return getPhase8E2EConfig() !== null;
}

export function getPhase8E2ESkipReason() {
  return buildSkipReason(
    "Phase 8 E2E",
    findInvalidVars(SUPABASE_TEST_VARS),
    findInvalidVars(E2E_ONLY_VARS),
  );
}

// A short, run-unique suffix so parallel/repeated runs never collide on
// email local-parts, slugs, or file names.
export function testRunId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
