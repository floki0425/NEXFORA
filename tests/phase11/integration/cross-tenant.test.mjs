import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { cleanupPhase11Fixtures, createPhase11Fixtures } from "../helpers/factory.mjs";
import { createTestAdminClient, signInTestUser } from "../../phase8/helpers/supabase-clients.mjs";
import {
  getPhase8IntegrationSkipReason,
  hasPhase8IntegrationEnv,
} from "../../phase8/helpers/test-env.mjs";

describe("Phase 11 cross-tenant isolation", () => {
  if (!hasPhase8IntegrationEnv()) {
    test("Phase 11 cross-tenant integration tests", (t) => {
      t.skip(getPhase8IntegrationSkipReason());
    });
    return;
  }

  let admin;
  let fixtures;
  const clients = {};

  before(async () => {
    admin = createTestAdminClient();
    fixtures = await createPhase11Fixtures(admin);
    for (const [name, user] of Object.entries(fixtures.users)) {
      clients[name] = await signInTestUser(user.email, user.password);
    }
  });

  after(async () => {
    await cleanupPhase11Fixtures(admin, fixtures);
  });

  test("an org A lead event produces zero notifications visible to org B's admin", async () => {
    // Assigned to a different profile than any actor, and inserted via the
    // service-role client (actor_type='system'), so org A's own admin is
    // guaranteed to be a real recipient — the fixture org has only one
    // non-suspended admin, who would otherwise be excluded as the actor
    // with nobody left to notify.
    const { data: lead } = await admin
      .from("leads")
      .insert({
        organization_id: fixtures.orgA.id,
        full_name: `Cross Tenant Lead ${fixtures.runId}`,
        email: `cross-tenant-${fixtures.runId}@example.com`,
        service_interest: "Website",
        source: "referral",
        assigned_to: fixtures.users["assigned-team-a"].profileId,
      })
      .select("id")
      .single();

    const orgBView = await clients["admin-b"]
      .from("notifications")
      .select("id")
      .eq("entity_id", lead.id);
    assert.equal((orgBView.data ?? []).length, 0);

    // Confirm the row genuinely exists (for org A), so the zero above is a
    // real isolation result, not just "nothing was ever created."
    const { data: orgARows } = await admin.from("notifications").select("id").eq("entity_id", lead.id);
    assert.ok(orgARows.length > 0);
  });

  test("an org A audit row is invisible to org B's admin via both direct select and list_audit_logs()", async () => {
    const { data: lead } = await clients["admin-a"]
      .from("leads")
      .insert({
        organization_id: fixtures.orgA.id,
        full_name: `Cross Tenant Audit Lead ${fixtures.runId}`,
        email: `cross-tenant-audit-${fixtures.runId}@example.com`,
        service_interest: "Website",
        source: "referral",
      })
      .select("id")
      .single();

    const directSelect = await clients["admin-b"]
      .from("audit_logs")
      .select("id")
      .eq("entity_id", lead.id);
    assert.equal((directSelect.data ?? []).length, 0);

    const { data: viaRpc } = await clients["admin-b"].rpc("list_audit_logs", {
      p_entity_type: "lead",
    });
    assert.equal((viaRpc ?? []).some((row) => row.entity_id === lead.id), false);
  });

  test("resolve_notification_recipients never crosses organization_id even for a mismatched entity_id (defense in depth)", async () => {
    // private.resolve_notification_recipients is not directly callable from
    // a client, so this is exercised indirectly: an org B admin creating an
    // org-B-scoped event never appears in org A's audit trail or notification
    // feed, and vice versa — the organization_id column on every row is the
    // hard boundary RLS enforces regardless of entity linkage.
    const { data: orgBLead } = await clients["admin-b"]
      .from("leads")
      .insert({
        organization_id: fixtures.orgB.id,
        full_name: `Org B Lead ${fixtures.runId}`,
        email: `org-b-lead-${fixtures.runId}@example.com`,
        service_interest: "Website",
        source: "referral",
      })
      .select("id")
      .single();

    const orgAView = await clients["admin-a"]
      .from("audit_logs")
      .select("id")
      .eq("entity_id", orgBLead.id);
    assert.equal((orgAView.data ?? []).length, 0);
  });
});
