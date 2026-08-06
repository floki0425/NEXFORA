import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { createTestAdminClient } from "../../phase8/helpers/supabase-clients.mjs";
import {
  cleanupPhase12Fixtures,
  countPhase12FixtureRows,
  createPhase12Fixtures,
} from "../helpers/factory.mjs";
import {
  assertTestProjectRef,
  getPhase12IntegrationSkipReason,
  hasPhase12IntegrationEnv,
} from "../helpers/test-env.mjs";

describe("Phase 12 fixture lifecycle", () => {
  if (!hasPhase12IntegrationEnv()) {
    test("Phase 12 fixture lifecycle integration", (t) => {
      t.skip(getPhase12IntegrationSkipReason());
    });
    return;
  }

  test("the suite refuses to run against a project other than TEST", () => {
    // Second, independent guard alongside the CLI link check: these tests
    // connect through TEST_SUPABASE_URL, which the CLI link does not govern.
    assert.equal(assertTestProjectRef(), "akcxsmdodfgfqilavnlf");
  });

  test("fixtures build, are observable, and clean up to zero rows", async () => {
    const admin = createTestAdminClient();
    let fixtures;

    try {
      fixtures = await createPhase12Fixtures(admin);

      const afterBuild = await countPhase12FixtureRows(admin, fixtures);
      assert.equal(afterBuild.organizations, 2);
      assert.ok(afterBuild.leads > 0);
      assert.ok(afterBuild.invoices > 0);
      assert.ok(afterBuild.projects > 0);
    } finally {
      if (fixtures) {
        await cleanupPhase12Fixtures(admin, fixtures);

        const afterCleanup = await countPhase12FixtureRows(admin, fixtures);
        const leftover = Object.entries(afterCleanup).filter(([, count]) => count > 0);
        assert.deepEqual(
          leftover,
          [],
          `cleanup left rows behind: ${JSON.stringify(leftover)}`,
        );
      }
    }
  });

  test("cleanup is safe to run twice", async () => {
    const admin = createTestAdminClient();
    const fixtures = await createPhase12Fixtures(admin);

    await cleanupPhase12Fixtures(admin, fixtures);
    // A rerun must not throw on already-deleted rows.
    await cleanupPhase12Fixtures(admin, fixtures);

    const counts = await countPhase12FixtureRows(admin, fixtures);
    assert.deepEqual(
      Object.entries(counts).filter(([, c]) => c > 0),
      [],
    );
  });

  test("two consecutive builds do not collide", async () => {
    // Proves the run-id naming keeps organizations, slugs and emails unique,
    // so a second suite run cannot hit a unique violation.
    const admin = createTestAdminClient();
    const first = await createPhase12Fixtures(admin);
    let second;

    try {
      second = await createPhase12Fixtures(admin);
      assert.notEqual(first.runId, second.runId);
      assert.notEqual(first.orgA.id, second.orgA.id);
    } finally {
      await cleanupPhase12Fixtures(admin, first);
      if (second) await cleanupPhase12Fixtures(admin, second);
    }
  });
});
