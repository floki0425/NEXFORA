import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { createTestAdminClient } from "../../phase8/helpers/supabase-clients.mjs";
import { cleanupPhase12Fixtures, createPhase12Fixtures } from "../helpers/factory.mjs";
import { assertSafeErrorShape, signInPhase12Users } from "../helpers/sessions.mjs";
import {
  assertTestProjectRef,
  getPhase12IntegrationSkipReason,
  hasPhase12IntegrationEnv,
} from "../helpers/test-env.mjs";

describe("F-104 search per-entity permission matrix", () => {
  if (!hasPhase12IntegrationEnv()) {
    test("Phase 12 search matrix integration", (t) => {
      t.skip(getPhase12IntegrationSkipReason());
    });
    return;
  }

  let admin;
  let fixtures;
  let clients;
  let orgAId;

  before(async () => {
    assertTestProjectRef();
    admin = createTestAdminClient();
    fixtures = await createPhase12Fixtures(admin);
    clients = await signInPhase12Users(fixtures);
    orgAId = fixtures.orgA.id;
  });

  after(async () => {
    await cleanupPhase12Fixtures(admin, fixtures);
  });

  async function search(label, query, organizationId = orgAId) {
    return clients[label].rpc("search_workspace", {
      p_organization_id: organizationId,
      p_query: query,
      p_limit: 5,
    });
  }

  const typesIn = (rows) => new Set((rows ?? []).map((r) => r.entity_type));

  // ---- service-role positive controls --------------------------------
  // Every zero-row expectation below is only meaningful if the target row
  // genuinely exists and genuinely matches the query term.

  test("positive control: every searchable fixture row exists and matches its term", async () => {
    const checks = [
      ["leads", "full_name", fixtures.searchTerms.lead],
      ["clients", "business_name", fixtures.searchTerms.client],
      ["projects", "name", fixtures.searchTerms.project],
      ["proposals", "title", fixtures.searchTerms.proposal],
      ["support_tickets", "title", fixtures.searchTerms.ticket],
    ];

    for (const [table, column, term] of checks) {
      const { data, error } = await admin
        .from(table)
        .select("id")
        .eq("organization_id", orgAId)
        .ilike(column, `%${term}%`);
      assert.equal(error, null);
      assert.ok(data.length > 0, `no ${table} row matches "${term}"`);
    }

    const { data: invoice } = await admin
      .from("invoices")
      .select("id")
      .eq("id", fixtures.invoices.i3.id)
      .single();
    assert.ok(invoice, "invoice fixture must exist");
  });

  // ---- lead: super_admin/admin only -----------------------------------

  test("lead: super_admin and admin find it; PM and team_member never do", async () => {
    for (const label of ["super-admin-a", "admin-a"]) {
      const { data, error } = await search(label, fixtures.searchTerms.lead);
      assert.equal(error, null);
      assert.ok(typesIn(data).has("lead"), `${label} should find the lead`);
    }

    for (const label of ["pm-a", "team-a"]) {
      const { data, error } = await search(label, fixtures.searchTerms.lead);
      assert.equal(error, null);
      assert.equal(typesIn(data).has("lead"), false, `${label} must not receive lead rows`);
    }
  });

  // ---- client ----------------------------------------------------------

  test("client: admins organization-wide; PM only via a project they manage; team_member never", async () => {
    for (const label of ["super-admin-a", "admin-a"]) {
      const { data } = await search(label, fixtures.searchTerms.client);
      assert.ok(typesIn(data).has("client"), `${label} should find the client`);
    }

    // The PM manages p7, whose client is clientA2 -- not the searched client.
    const { data: pmRows } = await search("pm-a", fixtures.searchTerms.client);
    assert.equal(
      typesIn(pmRows).has("client"),
      false,
      "the PM manages no project for this client, so it must not surface",
    );

    const { data: teamRows } = await search("team-a", fixtures.searchTerms.client);
    assert.equal(typesIn(teamRows).has("client"), false, "team_member gets no client results");
  });

  test("client: a PM DOES find a client reachable through a project they manage", async () => {
    // p7 is managed by the PM and belongs to clientA2.
    const { data } = await search("pm-a", "Phase12 Delivery Client");
    const clientRows = (data ?? []).filter((r) => r.entity_type === "client");
    assert.equal(clientRows.length, 1);
    assert.equal(clientRows[0].entity_id, fixtures.clientA2.id);
  });

  // ---- project ---------------------------------------------------------

  test("project: PM sees only projects they manage, not ones they merely contribute to", async () => {
    const { data } = await search("pm-a", fixtures.searchTerms.project);
    const ids = (data ?? []).filter((r) => r.entity_type === "project").map((r) => r.entity_id);

    assert.ok(ids.includes(fixtures.projects.p7.id), "the managed project must be visible");
    assert.equal(
      ids.includes(fixtures.projects.p8.id),
      false,
      "a project they only contribute to must not be visible",
    );

    // Positive control: an admin sees both similarly named projects.
    const { data: adminRows } = await search("admin-a", fixtures.searchTerms.project);
    const adminIds = adminRows.filter((r) => r.entity_type === "project").map((r) => r.entity_id);
    assert.ok(adminIds.includes(fixtures.projects.p7.id));
    assert.ok(adminIds.includes(fixtures.projects.p8.id));
  });

  test("project: team_member sees only projects assigned through project_members", async () => {
    const { data } = await search("team-a", "Phase12 Project");
    const ids = (data ?? []).filter((r) => r.entity_type === "project").map((r) => r.entity_id);

    assert.ok(ids.includes(fixtures.projects.p9.id), "the assigned project must be visible");
    assert.equal(ids.includes(fixtures.projects.p5.id), false, "unassigned projects must not be");
  });

  // ---- proposal and invoice: super_admin/admin only ---------------------

  test("proposal: admins only", async () => {
    for (const label of ["super-admin-a", "admin-a"]) {
      const { data } = await search(label, fixtures.searchTerms.proposal);
      assert.ok(typesIn(data).has("proposal"), `${label} should find the proposal`);
    }
    for (const label of ["pm-a", "team-a"]) {
      const { data } = await search(label, fixtures.searchTerms.proposal);
      assert.equal(typesIn(data).has("proposal"), false, `${label} must not receive proposals`);
    }
  });

  test("invoice: admins only", async () => {
    const number = "NXF-INV-2026-0003";
    for (const label of ["super-admin-a", "admin-a"]) {
      const { data } = await search(label, number);
      assert.ok(typesIn(data).has("invoice"), `${label} should find the invoice`);
    }
    for (const label of ["pm-a", "team-a"]) {
      const { data } = await search(label, number);
      assert.equal(typesIn(data).has("invoice"), false, `${label} must not receive invoices`);
    }
  });

  // ---- support ticket: existing RLS preserved ---------------------------

  test("support_ticket: team_member sees only tickets assigned to them", async () => {
    const { data } = await search("team-a", fixtures.searchTerms.ticket);
    const ids = (data ?? []).filter((r) => r.entity_type === "support_ticket").map((r) => r.entity_id);

    assert.ok(ids.includes(fixtures.tickets.t1.id), "their own ticket must be visible");
    assert.equal(ids.includes(fixtures.tickets.t2.id), false, "another user's ticket must not be");
  });

  test("support_ticket: PM sees tickets on projects they manage, not unrelated ones", async () => {
    const { data } = await search("pm-a", fixtures.searchTerms.ticket);
    const ids = (data ?? []).filter((r) => r.entity_type === "support_ticket").map((r) => r.entity_id);

    assert.ok(ids.includes(fixtures.tickets.t3.id), "a ticket on their managed project must be visible");
    assert.equal(
      ids.includes(fixtures.tickets.t4.id),
      false,
      "a ticket on an unrelated project must not be",
    );
  });

  test("support_ticket: admins see the organization's tickets", async () => {
    const { data } = await search("admin-a", fixtures.searchTerms.ticket);
    const ids = (data ?? []).filter((r) => r.entity_type === "support_ticket").map((r) => r.entity_id);
    assert.ok(ids.includes(fixtures.tickets.t1.id));
    assert.ok(ids.includes(fixtures.tickets.t2.id));
  });

  // ---- denial paths -----------------------------------------------------

  test("portal, suspended, no-membership and wrong-organization callers get a safe P0001", async () => {
    for (const label of ["portal-owner-a", "suspended-a", "no-membership"]) {
      const { data, error } = await search(label, fixtures.searchTerms.lead);
      assert.equal(error?.code, "P0001", `${label} expected P0001, got ${JSON.stringify(error)}`);
      assert.ok(!data || data.length === 0);
      assertSafeErrorShape(assert, error);
    }

    // An Org B admin asking for Org A is refused by the organization guard.
    const { data: crossData, error: crossError } = await search(
      "admin-b",
      fixtures.searchTerms.lead,
      orgAId,
    );
    assert.equal(crossError?.code, "P0001");
    assert.ok(!crossData || crossData.length === 0);
  });

  test("anon is refused by EXECUTE privilege (42501), never reaching the guard", async () => {
    const { data, error } = await search("anon", fixtures.searchTerms.lead);
    assert.equal(error?.code, "42501");
    assert.notEqual(error?.code, "P0001");
    assert.ok(!data || data.length === 0);
    assertSafeErrorShape(assert, error);
  });

  test("results carry only the six mapped fields and a known entity type", async () => {
    const { data } = await search("admin-a", fixtures.searchTerms.ticket);
    assert.ok(data.length > 0);

    for (const row of data) {
      assert.deepEqual(
        Object.keys(row).sort(),
        ["entity_id", "entity_type", "status", "subtitle", "title", "updated_at"],
      );
      assert.ok(
        ["lead", "client", "project", "proposal", "invoice", "support_ticket"].includes(row.entity_type),
      );
    }
  });
});
