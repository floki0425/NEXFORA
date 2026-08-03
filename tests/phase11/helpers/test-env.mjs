// Phase 11 E2E needs its own fixture accounts (never Phase 8/9's) — same
// reasoning documented at .env.example:41-46 for Phase 9's own accounts:
// reusing an existing E2E identity would give one auth user active
// memberships in two different E2E organizations at once, which
// requireInternalMember() and private.active_client_id() both fail closed
// on. It also specifically needs a super_admin (for the audit log + "Run
// reminders now"), which no earlier phase's fixed admin account has.
import { getPhase8SupabaseTestConfig } from "../../phase8/helpers/test-env.mjs";

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
  if (missing.length > 0) parts.push(`missing ${missing.join(", ")}`);
  if (placeholder.length > 0) parts.push(`placeholder value in ${placeholder.join(", ")}`);

  const detail =
    parts.length > 0 ? parts.join("; ") : "required test environment variables are not configured";

  return (
    `${label} skipped: ${detail}. Set real values in .env.test.local ` +
    "(see docs/PHASE_11_NOTIFICATIONS_SETUP.md). This is a missing-configuration " +
    "skip, not a passing result."
  );
}

const E2E_ONLY_VARS = [
  "TEST_APP_URL",
  "TEST_P11_INTERNAL_ADMIN_EMAIL",
  "TEST_P11_INTERNAL_ADMIN_PASSWORD",
  "TEST_P11_TEAM_MEMBER_EMAIL",
  "TEST_P11_TEAM_MEMBER_PASSWORD",
  "TEST_P11_CLIENT_OWNER_EMAIL",
  "TEST_P11_CLIENT_OWNER_PASSWORD",
];

export function getPhase11E2EConfig() {
  const supabase = getPhase8SupabaseTestConfig();

  const appUrl = readVar("TEST_APP_URL");
  const internalAdminEmail = readVar("TEST_P11_INTERNAL_ADMIN_EMAIL");
  const internalAdminPassword = readVar("TEST_P11_INTERNAL_ADMIN_PASSWORD");
  const teamMemberEmail = readVar("TEST_P11_TEAM_MEMBER_EMAIL");
  const teamMemberPassword = readVar("TEST_P11_TEAM_MEMBER_PASSWORD");
  const clientOwnerEmail = readVar("TEST_P11_CLIENT_OWNER_EMAIL");
  const clientOwnerPassword = readVar("TEST_P11_CLIENT_OWNER_PASSWORD");

  if (
    !supabase ||
    !appUrl ||
    !internalAdminEmail ||
    !internalAdminPassword ||
    !teamMemberEmail ||
    !teamMemberPassword ||
    !clientOwnerEmail ||
    !clientOwnerPassword ||
    [appUrl, internalAdminEmail, internalAdminPassword, teamMemberEmail, teamMemberPassword, clientOwnerEmail, clientOwnerPassword].some(isPlaceholderValue)
  ) {
    return null;
  }

  return {
    ...supabase,
    appUrl,
    internalAdmin: { email: internalAdminEmail, password: internalAdminPassword },
    teamMember: { email: teamMemberEmail, password: teamMemberPassword },
    clientOwner: { email: clientOwnerEmail, password: clientOwnerPassword },
  };
}

export function hasPhase11E2EEnv() {
  return getPhase11E2EConfig() !== null;
}

export function getPhase11E2ESkipReason() {
  return buildSkipReason(
    "Phase 11 E2E",
    findInvalidVars(["TEST_SUPABASE_URL", "TEST_SUPABASE_PUBLISHABLE_KEY", "TEST_SUPABASE_SECRET_KEY"]),
    findInvalidVars(E2E_ONLY_VARS),
  );
}
