import { readFile, rm } from "node:fs/promises";
import path from "node:path";

import { createTestAdminClient } from "../../phase8/helpers/supabase-clients.mjs";
import {
  cleanupPhase12Fixtures,
  countPhase12FixtureRows,
} from "../helpers/factory.mjs";
import { assertTestProjectRef, getPhase12E2EConfig } from "../helpers/test-env.mjs";

const FIXTURE_FILE = path.join(
  process.cwd(),
  "tests/phase12/e2e/.e2e-fixture-ids.json",
);

// Deletes exactly the rows global-setup created, scoped by id -- never by a
// name pattern and never with a broad predicate. Then proves the run left
// nothing behind, so a leak fails the run rather than silently accumulating.

export default async function globalTeardown() {
  if (!getPhase12E2EConfig()) return;

  assertTestProjectRef();

  let parsed: { _fixtures?: unknown; runId?: string };
  try {
    parsed = JSON.parse(await readFile(FIXTURE_FILE, "utf8"));
  } catch {
    console.warn("Phase 12 E2E teardown: no fixture file found; nothing to clean up.");
    return;
  }

  const fixtures = parsed._fixtures;
  if (!fixtures) {
    console.warn("Phase 12 E2E teardown: fixture file carried no cleanup payload.");
    return;
  }

  const admin = createTestAdminClient();

  // Cleanup is idempotent, so a partially-torn-down run is safe to retry.
  await cleanupPhase12Fixtures(admin, fixtures);

  const remaining = (await countPhase12FixtureRows(admin, fixtures)) as Record<string, number>;
  const leftover = Object.entries(remaining).filter(([, count]) => count > 0);

  if (leftover.length > 0) {
    throw new Error(
      `Phase 12 E2E teardown left fixture rows behind (run ${parsed.runId}): ` +
        JSON.stringify(leftover),
    );
  }

  await rm(FIXTURE_FILE, { force: true });
  console.log(`Phase 12 E2E fixtures cleaned up (run ${parsed.runId}); zero rows remain.`);
}
