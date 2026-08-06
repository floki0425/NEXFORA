import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { createTestAdminClient } from "../../phase8/helpers/supabase-clients.mjs";
import { cleanupPhase12Fixtures, createPhase12Fixtures } from "../helpers/factory.mjs";
import { assertSafeErrorShape, reportArgs, signInPhase12Users } from "../helpers/sessions.mjs";
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

/** Callers that must be refused every report with a safe P0001. */
const DENIED_LABELS = ["team-a", "suspended-a", "portal-owner-a", "no-membership"];

describe("Phase 12A report authorization matrix", () => {
  if (!hasPhase12IntegrationEnv()) {
    test("Phase 12 report authorization integration", (t) => {
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

  for (const rpc of REPORTS) {
    test(`${rpc}: super_admin and admin are allowed`, async () => {
      for (const label of ["super-admin-a", "admin-a"]) {
        const { data, error } = await clients[label].rpc(rpc, reportArgs());
        assert.equal(error, null, `${label} should be allowed: ${JSON.stringify(error)}`);
        assert.ok(data, `${label} should receive a payload`);
      }
    });

    test(`${rpc}: unauthorized authenticated callers get a safe P0001 and no rows`, async () => {
      // A project_manager is authorized for the delivery report only.
      const denied =
        rpc === "get_project_delivery_report" ? DENIED_LABELS : [...DENIED_LABELS, "pm-a"];

      for (const label of denied) {
        const { data, error } = await clients[label].rpc(rpc, reportArgs());

        assert.equal(error?.code, "P0001", `${label} on ${rpc} expected P0001, got ${JSON.stringify(error)}`);
        assert.equal(data, null, `${label} must receive no report payload from ${rpc}`);
        assert.match(error.message, /do not have permission/i);
        assertSafeErrorShape(assert, error);
      }
    });

    test(`${rpc}: anon is refused by EXECUTE privilege (42501), not by the role check`, async () => {
      const { data, error } = await clients.anon.rpc(rpc, reportArgs());

      // PostgreSQL refuses before the function body runs, so anon never
      // reaches the P0001 role check.
      assert.equal(error?.code, "42501", `anon on ${rpc} expected 42501, got ${JSON.stringify(error)}`);
      assert.notEqual(error?.code, "P0001");
      assert.equal(data, null);
      assertSafeErrorShape(assert, error);
    });
  }

  test("project_manager is allowed the delivery report and refused the other four", async () => {
    const { error: allowed } = await clients["pm-a"].rpc(
      "get_project_delivery_report",
      reportArgs(),
    );
    assert.equal(allowed, null, "the PM must be allowed the delivery report");

    for (const rpc of REPORTS.filter((r) => r !== "get_project_delivery_report")) {
      const { error } = await clients["pm-a"].rpc(rpc, reportArgs());
      assert.equal(error?.code, "P0001", `the PM must be refused ${rpc}`);
    }
  });

  test("a suspended admin is refused despite holding the admin role", async () => {
    // Role alone is not authorization: membership.status must be active.
    const { data: membership } = await admin
      .from("organization_members")
      .select("role, status")
      .eq("user_id", fixtures.users["suspended-a"].profileId)
      .single();
    assert.equal(membership.role, "admin");
    assert.equal(membership.status, "suspended");

    const { error } = await clients["suspended-a"].rpc("get_revenue_report", reportArgs());
    assert.equal(error?.code, "P0001");
  });

  test("a second-organization admin is scoped to their own tenant, never Org A", async () => {
    // NOTE: an active admin of Org B is legitimately allowed to run reports --
    // for Org B. The boundary being tested is tenant isolation, not refusal.
    const { data, error } = await clients["admin-b"].rpc(
      "get_lead_conversion_report",
      reportArgs(),
    );
    assert.equal(error, null, "an Org B admin may run their own report");

    // Org B holds exactly one in-window lead; Org A holds eight.
    assert.equal(data.leads_created, 1);
    assert.notEqual(data.leads_created, 8);

    const { data: revenue } = await clients["admin-b"].rpc("get_revenue_report", reportArgs());
    assert.deepEqual(revenue.collected_in_period, [], "Org A revenue must not leak into Org B");
  });

  test("no denied caller ever receives report data", async () => {
    for (const label of [...DENIED_LABELS, "anon"]) {
      for (const rpc of REPORTS) {
        const { data } = await clients[label].rpc(rpc, reportArgs());
        assert.equal(data, null, `${label} received data from ${rpc}`);
      }
    }
  });
});
