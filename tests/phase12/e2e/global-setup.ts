import { writeFile } from "node:fs/promises";
import path from "node:path";

import { createTestAdminClient } from "../../phase8/helpers/supabase-clients.mjs";
import { createPhase12Fixtures } from "../helpers/factory.mjs";
import { assertTestProjectRef, getPhase12E2EConfig } from "../helpers/test-env.mjs";

// Provisions one run's worth of Phase 12 E2E fixtures and records everything
// the specs need in a gitignored file.
//
// This reuses the Phase 12 INTEGRATION factory rather than duplicating a
// second fixture set: it already builds two organizations, all eight
// identities, deterministic data for every report, and unique search tokens
// for all six searchable entities. Building a parallel E2E dataset would mean
// two definitions of the same expected numbers, and they would drift.
//
// The service-role client is used here and in global-teardown only. It never
// reaches the browser: the app server receives the secret key through
// SUPABASE_SECRET_KEY (server-side), and specs sign in through the normal
// login form with per-run credentials.

/**
 * The shape createPhase12Fixtures() returns. factory.mjs is plain JS, so TS
 * infers only the initial accumulator; this states the contract explicitly
 * rather than widening to `any` and losing every check downstream.
 */
interface FactoryUser {
  label: string;
  email: string;
  password: string;
  authUserId: string;
  profileId: string;
}

interface FactoryRow {
  id: string;
}

interface Phase12FactoryResult {
  runId: string;
  searchTerms: Record<string, string>;
  users: Record<string, FactoryUser>;
  orgA: FactoryRow;
  orgB: FactoryRow;
  clientA1: FactoryRow;
  clientA2: FactoryRow;
  clientB: FactoryRow;
  leads: Record<string, FactoryRow>;
  projects: Record<string, FactoryRow>;
  proposals: Record<string, FactoryRow>;
  invoices: Record<string, FactoryRow>;
  tickets: Record<string, FactoryRow>;
}

export const FIXTURE_FILE = path.join(
  process.cwd(),
  "tests/phase12/e2e/.e2e-fixture-ids.json",
);

export default async function globalSetup() {
  const config = getPhase12E2EConfig();
  if (!config) {
    console.warn(
      "Phase 12 E2E global setup skipped: TEST_SUPABASE_* / TEST_APP_URL are not configured.",
    );
    return;
  }

  // Fail closed before creating anything if this is not the TEST project.
  assertTestProjectRef();

  const admin = createTestAdminClient();
  const fixtures = (await createPhase12Fixtures(admin)) as Phase12FactoryResult;

  // Credentials are per-run, ephemeral, and destroyed in teardown. The file
  // is gitignored and never contains a Supabase key or service-role secret.
  const payload = {
    runId: fixtures.runId,
    organizations: { a: fixtures.orgA.id, b: fixtures.orgB.id },
    searchTerms: fixtures.searchTerms,
    clients: {
      converted: fixtures.clientA1.id,
      delivery: fixtures.clientA2.id,
      orgB: fixtures.clientB.id,
    },
    projects: {
      managedByPm: fixtures.projects.p7.id,
      pmContributorOnly: fixtures.projects.p8.id,
      assignedToTeamMember: fixtures.projects.p9.id,
      activeOverdue: fixtures.projects.p5.id,
    },
    tickets: {
      assignedToTeamMember: fixtures.tickets.t1.id,
      assignedToAdmin: fixtures.tickets.t2.id,
      onPmManagedProject: fixtures.tickets.t3.id,
      onUnrelatedProject: fixtures.tickets.t4.id,
    },
    leads: { searchable: fixtures.leads.l1.id },
    proposals: { searchable: fixtures.proposals.pr4.id },
    invoices: { overdue: fixtures.invoices.i3.id },
    users: Object.fromEntries(
      Object.entries(fixtures.users).map(([label, user]) => [
        label,
        { email: user.email, password: user.password, profileId: user.profileId },
      ]),
    ),
    // The complete factory result, so global-teardown can delete exactly the
    // ids this run created rather than matching on a name pattern.
    _fixtures: fixtures,
  };

  await writeFile(FIXTURE_FILE, JSON.stringify(payload, null, 2), "utf8");
  console.log(`Phase 12 E2E fixtures ready (run ${fixtures.runId}).`);
}
