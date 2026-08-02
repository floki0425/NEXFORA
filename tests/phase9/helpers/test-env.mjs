// Environment gating for Phase 9 E2E tests, mirroring
// tests/phase8/helpers/test-env.mjs's exact shape and reasoning (see that
// file's header comment for the full rationale on load timing and
// placeholder detection).
//
// Deliberately distinct env var names from Phase 8's E2E config
// (TEST_P9_* rather than TEST_INTERNAL_ADMIN_EMAIL/TEST_CLIENT_OWNER_EMAIL):
// requireInternalMember() fails closed the instant a profile has more than
// one active organization_members row (see src/lib/auth/server.ts,
// "Phase 1 has one Nexfora organization... fail closed instead of
// selecting an arbitrary role"). Reusing Phase 8's E2E accounts would give
// the same auth user membership rows in both phase8-e2e-org and
// phase9-e2e-org simultaneously and break sign-in for both suites — this
// is exactly the bug class documented in
// docs/PHASE_8_AUTOMATED_TESTING.md's "shared-test-email lesson". Separate
// dedicated accounts sidestep it entirely.

import { getPhase8SupabaseTestConfig, testRunId } from "../../phase8/helpers/test-env.mjs";

export { testRunId };

const PLACEHOLDER_VALUES = [
  "your_test_project",
  "your_test_publishable_key",
  "your_test_secret_key",
  "your-test-password",
  "example.com",
];

function isPlaceholderValue(value) {
  const normalized = value.trim().toLowerCase();
  return PLACEHOLDER_VALUES.some((placeholder) => normalized.includes(placeholder));
}

function readVar(name) {
  const raw = process.env[name];
  return typeof raw === "string" ? raw.trim() : undefined;
}

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
    "(see docs/PHASE_9_INVOICES_PAYMENTS_SETUP.md). This is a " +
    "missing-configuration skip, not a passing result."
  );
}

const E2E_ONLY_VARS = [
  "TEST_APP_URL",
  "TEST_P9_INTERNAL_ADMIN_EMAIL",
  "TEST_P9_INTERNAL_ADMIN_PASSWORD",
  "TEST_P9_CLIENT_OWNER_EMAIL",
  "TEST_P9_CLIENT_OWNER_PASSWORD",
];

export function getPhase9E2EConfig() {
  const supabase = getPhase8SupabaseTestConfig();

  const appUrl = readVar("TEST_APP_URL");
  const internalAdminEmail = readVar("TEST_P9_INTERNAL_ADMIN_EMAIL");
  const internalAdminPassword = readVar("TEST_P9_INTERNAL_ADMIN_PASSWORD");
  const clientOwnerEmail = readVar("TEST_P9_CLIENT_OWNER_EMAIL");
  const clientOwnerPassword = readVar("TEST_P9_CLIENT_OWNER_PASSWORD");

  if (
    !supabase ||
    !appUrl ||
    !internalAdminEmail ||
    !internalAdminPassword ||
    !clientOwnerEmail ||
    !clientOwnerPassword ||
    isPlaceholderValue(appUrl) ||
    isPlaceholderValue(internalAdminEmail) ||
    isPlaceholderValue(internalAdminPassword) ||
    isPlaceholderValue(clientOwnerEmail) ||
    isPlaceholderValue(clientOwnerPassword)
  ) {
    return null;
  }

  return {
    ...supabase,
    appUrl,
    internalAdmin: { email: internalAdminEmail, password: internalAdminPassword },
    clientOwner: { email: clientOwnerEmail, password: clientOwnerPassword },
  };
}

export function hasPhase9E2EEnv() {
  return getPhase9E2EConfig() !== null;
}

export function getPhase9E2ESkipReason() {
  return buildSkipReason(
    "Phase 9 E2E",
    findInvalidVars(["TEST_SUPABASE_URL", "TEST_SUPABASE_PUBLISHABLE_KEY", "TEST_SUPABASE_SECRET_KEY"]),
    findInvalidVars(E2E_ONLY_VARS),
  );
}
