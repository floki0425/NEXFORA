import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { cleanupPhase11Fixtures, createPhase11Fixtures } from "../helpers/factory.mjs";
import {
  createTestAdminClient,
  createTestAnonClient,
  signInTestUser,
} from "../../phase8/helpers/supabase-clients.mjs";
import {
  getPhase8IntegrationSkipReason,
  hasPhase8IntegrationEnv,
} from "../../phase8/helpers/test-env.mjs";

describe("Phase 11 audit_logs immutability", () => {
  if (!hasPhase8IntegrationEnv()) {
    test("Phase 11 audit immutability integration tests", (t) => {
      t.skip(getPhase8IntegrationSkipReason());
    });
    return;
  }

  let admin;
  let fixtures;
  const clients = {};
  let auditRowId;

  before(async () => {
    admin = createTestAdminClient();
    fixtures = await createPhase11Fixtures(admin);
    for (const [name, user] of Object.entries(fixtures.users)) {
      clients[name] = await signInTestUser(user.email, user.password);
    }
    clients.anon = createTestAnonClient();

    const { data: lead } = await admin
      .from("leads")
      .insert({
        organization_id: fixtures.orgA.id,
        full_name: `Immutability Lead ${fixtures.runId}`,
        email: `immutability-${fixtures.runId}@example.com`,
        service_interest: "Website",
        source: "referral",
      })
      .select("id")
      .single();

    const { data: auditRow } = await admin
      .from("audit_logs")
      .select("id, metadata")
      .eq("entity_id", lead.id)
      .single();
    auditRowId = auditRow.id;
  });

  after(async () => {
    await cleanupPhase11Fixtures(admin, fixtures);
  });

  for (const role of ["admin-a", "assigned-team-a", "client-owner-a"]) {
    test(`${role} cannot UPDATE an existing audit_logs row`, async () => {
      const { error, count } = await clients[role]
        .from("audit_logs")
        .update({ metadata: { tampered: true } })
        .eq("id", auditRowId)
        .select("id", { count: "exact" });
      // Either PostgREST denies outright (error) or the update silently
      // matches zero rows (no UPDATE policy = zero affected rows) — both
      // are acceptable proof of immutability, unlike an update that
      // actually changed the row.
      if (!error) {
        assert.equal(count ?? 0, 0);
      }
    });

    test(`${role} cannot DELETE an existing audit_logs row`, async () => {
      const { error, count } = await clients[role]
        .from("audit_logs")
        .delete()
        .eq("id", auditRowId)
        .select("id", { count: "exact" });
      if (!error) {
        assert.equal(count ?? 0, 0);
      }
    });
  }

  test("anon cannot UPDATE or DELETE an audit_logs row", async () => {
    const updateResult = await clients.anon
      .from("audit_logs")
      .update({ metadata: { tampered: true } })
      .eq("id", auditRowId);
    assert.ok(updateResult.error);

    const deleteResult = await clients.anon.from("audit_logs").delete().eq("id", auditRowId);
    assert.ok(deleteResult.error);
  });

  test("the row is byte-for-byte unchanged after every attempted tamper above", async () => {
    const { data } = await admin.from("audit_logs").select("metadata").eq("id", auditRowId).single();
    assert.deepEqual(data.metadata, { source: "referral" });
  });
});
