import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { createTestAdminClient } from "../../phase8/helpers/supabase-clients.mjs";
import { cleanupPhase12Fixtures, createPhase12Fixtures } from "../helpers/factory.mjs";
import { reportArgs, signInPhase12Users } from "../helpers/sessions.mjs";
import {
  assertTestProjectRef,
  getPhase12IntegrationSkipReason,
  hasPhase12IntegrationEnv,
} from "../helpers/test-env.mjs";

const REPORTS = [
  "get_lead_conversion_report",
  "get_lead_source_report",
  "get_proposal_win_rate_report",
  "get_revenue_report",
  "get_project_delivery_report",
];

describe("Phase 12A cross-tenant isolation", () => {
  if (!hasPhase12IntegrationEnv()) {
    test("Phase 12 cross-tenant integration", (t) => {
      t.skip(getPhase12IntegrationSkipReason());
    });
    return;
  }

  let admin;
  let fixtures;
  let clients;

  before(async () => {
    assertTestProjectRef();
    admin = createTestAdminClient();
    fixtures = await createPhase12Fixtures(admin);
    clients = await signInPhase12Users(fixtures);
  });

  after(async () => {
    await cleanupPhase12Fixtures(admin, fixtures);
  });

  test("positive control: Organization B fixtures exist and match the cross-tenant term", async () => {
    const term = fixtures.searchTerms.crossTenant;

    const { data: leads } = await admin
      .from("leads")
      .select("id")
      .eq("organization_id", fixtures.orgB.id)
      .ilike("full_name", `%${term}%`);
    assert.equal(leads.length, 1, "Org B lead must exist and match the term");

    const { data: projects } = await admin
      .from("projects")
      .select("id")
      .eq("organization_id", fixtures.orgB.id)
      .ilike("name", `%${term}%`);
    assert.equal(projects.length, 1, "Org B project must exist and match the term");

    const { data: orgClients } = await admin
      .from("clients")
      .select("id")
      .eq("organization_id", fixtures.orgB.id)
      .ilike("business_name", `%${term}%`);
    assert.equal(orgClients.length, 1, "Org B client must exist and match the term");
  });

  test("an Org A admin searching their own organization receives no Org B rows", async () => {
    const { data, error } = await clients["admin-a"].rpc("search_workspace", {
      p_organization_id: fixtures.orgA.id,
      p_query: fixtures.searchTerms.crossTenant,
      p_limit: 5,
    });

    assert.equal(error, null);
    assert.equal(
      (data ?? []).length,
      0,
      "Org B rows matching the term must never reach an Org A actor",
    );
  });

  test("an Org A admin cannot search Organization B by passing its id", async () => {
    const { data, error } = await clients["admin-a"].rpc("search_workspace", {
      p_organization_id: fixtures.orgB.id,
      p_query: fixtures.searchTerms.crossTenant,
      p_limit: 5,
    });

    // The membership guard rejects a mismatched organization outright.
    assert.equal(error?.code, "P0001");
    assert.ok(!data || data.length === 0);
  });

  test("an Org B admin searching Org B finds their own rows", async () => {
    const { data, error } = await clients["admin-b"].rpc("search_workspace", {
      p_organization_id: fixtures.orgB.id,
      p_query: fixtures.searchTerms.crossTenant,
      p_limit: 5,
    });

    assert.equal(error, null);
    const types = new Set((data ?? []).map((r) => r.entity_type));
    // Proves the term is genuinely searchable -- the zero above is isolation,
    // not an unmatchable query.
    assert.ok(types.has("lead"), "the Org B admin must find their own lead");
    assert.ok(types.has("client") || types.has("project"));
  });

  test("no report RPC aggregates Organization B data for an Org A actor", async () => {
    for (const rpc of REPORTS) {
      const { data, error } = await clients["admin-a"].rpc(rpc, reportArgs());
      assert.equal(error, null, `${rpc} failed for the Org A admin`);

      const serialized = JSON.stringify(data);
      assert.ok(
        !serialized.includes(fixtures.searchTerms.crossTenant),
        `${rpc} leaked an Org B identifier into an Org A report`,
      );
      assert.ok(
        !serialized.includes(fixtures.orgB.id),
        `${rpc} leaked the Org B organization id`,
      );
    }
  });

  test("Org A and Org B lead reports produce different, tenant-correct numbers", async () => {
    const { data: aData } = await clients["admin-a"].rpc(
      "get_lead_conversion_report",
      reportArgs(),
    );
    const { data: bData } = await clients["admin-b"].rpc(
      "get_lead_conversion_report",
      reportArgs(),
    );

    assert.equal(aData.leads_created, 8);
    assert.equal(bData.leads_created, 1);
    assert.notEqual(aData.leads_created, bData.leads_created);

    // Org B's single lead converted, so its rate is 1 -- proving the report
    // genuinely ran against Org B rather than returning an empty shell.
    assert.equal(Number(bData.conversion_rate), 1);
  });

  test("Org B revenue is empty and Org A revenue never appears in it", async () => {
    const { data } = await clients["admin-b"].rpc("get_revenue_report", reportArgs());

    assert.deepEqual(data.collected_in_period, []);
    assert.deepEqual(data.invoice_cohort, []);
    assert.equal(data.refunded_count, 0);
  });
});
