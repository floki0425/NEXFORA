import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { createTestAdminClient, signInTestUser } from "../../phase8/helpers/supabase-clients.mjs";
import { cleanupPhase12Fixtures, createPhase12Fixtures } from "../helpers/factory.mjs";
import {
  assertTestProjectRef,
  getPhase12IntegrationSkipReason,
  hasPhase12IntegrationEnv,
} from "../helpers/test-env.mjs";

describe("F-104 search bounds and escaping", () => {
  if (!hasPhase12IntegrationEnv()) {
    test("Phase 12 search bounds integration", (t) => {
      t.skip(getPhase12IntegrationSkipReason());
    });
    return;
  }

  let admin;
  let fixtures;
  let adminClient;
  let orgAId;

  before(async () => {
    assertTestProjectRef();
    admin = createTestAdminClient();
    fixtures = await createPhase12Fixtures(admin);
    adminClient = await signInTestUser(
      fixtures.users["admin-a"].email,
      fixtures.users["admin-a"].password,
    );
    orgAId = fixtures.orgA.id;
  });

  after(async () => {
    await cleanupPhase12Fixtures(admin, fixtures);
  });

  async function search(query, limit = 5) {
    const { data, error } = await adminClient.rpc("search_workspace", {
      p_organization_id: orgAId,
      p_query: query,
      p_limit: limit,
    });
    assert.equal(error, null, `search failed: ${JSON.stringify(error)}`);
    return data ?? [];
  }

  test("an empty or one-character query returns no rows and no error", async () => {
    for (const query of ["", " ", "a", " a ", "Z"]) {
      const rows = await search(query);
      assert.equal(rows.length, 0, `query ${JSON.stringify(query)} should be below threshold`);
    }
  });

  test("a two-character query is accepted and stays bounded", async () => {
    const rows = await search("Zq");
    assert.ok(rows.length <= 30, "the total cap must still apply to short queries");
  });

  test("a query over 120 characters is truncated, not rejected, and cannot widen results", async () => {
    // The first 120 characters still match the fixture token; the tail is
    // discarded rather than causing an error.
    const padded = `${fixtures.searchTerms.lead}${"x".repeat(500)}`;
    const rows = await search(padded);
    assert.ok(Array.isArray(rows));
    assert.ok(rows.length <= 30);
  });

  test("% and _ are escaped and never act as wildcards", async () => {
    // A bare wildcard would match everything in the organization.
    const percent = await search("%");
    assert.equal(percent.length, 0, "'%' must not match every row");

    const underscores = await search("__");
    assert.equal(underscores.length, 0, "'__' must not match any two characters");

    const mixed = await search("%Zqx%");
    assert.equal(mixed.length, 0, "wrapping in wildcards must be treated literally");
  });

  test("a backslash is escaped and does not corrupt the pattern", async () => {
    for (const query of ["\\", "\\%", "a\\_b"]) {
      const { error } = await adminClient.rpc("search_workspace", {
        p_organization_id: orgAId,
        p_query: query,
        p_limit: 5,
      });
      assert.equal(error, null, `query ${JSON.stringify(query)} should not error`);
    }
  });

  test("p_limit is clamped for null, zero, negative and excessive values", async () => {
    // The fixture has more than five matching support tickets + projects, so
    // an unclamped limit would be observable.
    for (const limit of [null, 0, -1, -999, 1000000]) {
      const { data, error } = await adminClient.rpc("search_workspace", {
        p_organization_id: orgAId,
        p_query: "Phase12",
        p_limit: limit,
      });
      assert.equal(error, null, `limit ${limit} should not error`);

      const perEntity = {};
      for (const row of data ?? []) {
        perEntity[row.entity_type] = (perEntity[row.entity_type] ?? 0) + 1;
      }
      for (const [entity, count] of Object.entries(perEntity)) {
        assert.ok(count <= 5, `limit ${limit} produced ${count} ${entity} rows (max 5)`);
      }
      assert.ok((data ?? []).length <= 30, `limit ${limit} exceeded the 30-row cap`);
    }
  });

  test("no entity returns more than five rows and the total never exceeds thirty", async () => {
    const rows = await search("Phase12");
    const perEntity = {};
    for (const row of rows) {
      perEntity[row.entity_type] = (perEntity[row.entity_type] ?? 0) + 1;
    }
    for (const [entity, count] of Object.entries(perEntity)) {
      assert.ok(count <= 5, `${entity} returned ${count} rows`);
    }
    assert.ok(rows.length <= 30);
  });

  test("a forbidden field cannot be found by searching its own value", async () => {
    // invoices.notes holds a unique token. It is internal-only and must not
    // be searchable through the palette.
    const note = fixtures.searchTerms.secretNote;

    const { data: control } = await admin
      .from("invoices")
      .select("id")
      .eq("id", fixtures.invoices.i3.id)
      .ilike("notes", `%${note}%`);
    assert.equal(control.length, 1, "positive control: the note genuinely exists");

    const rows = await search(note);
    assert.equal(rows.length, 0, "an internal note must never be reachable through search");
  });

  test("results are ordered by entity type then recency", async () => {
    const rows = await search("Phase12");
    const grouped = {};
    for (const row of rows) {
      (grouped[row.entity_type] ??= []).push(row.updated_at);
    }
    for (const [entity, stamps] of Object.entries(grouped)) {
      const sorted = [...stamps].sort().reverse();
      assert.deepEqual(stamps, sorted, `${entity} rows must be newest-first`);
    }
  });
});
