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

describe("Phase 11 RLS: notifications, notification_preferences, notification_deliveries, audit_logs", () => {
  if (!hasPhase8IntegrationEnv()) {
    test("Phase 11 RLS integration tests", (t) => {
      t.skip(getPhase8IntegrationSkipReason());
    });
    return;
  }

  let admin;
  let fixtures;
  const clients = {};
  let sampleLeadId;

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
        full_name: `RLS Lead ${fixtures.runId}`,
        email: `rls-lead-${fixtures.runId}@example.com`,
        service_interest: "Website",
        source: "referral",
      })
      .select("id")
      .single();
    sampleLeadId = lead.id;
  });

  after(async () => {
    await cleanupPhase11Fixtures(admin, fixtures);
  });

  test("a user cannot read another user's notifications", async () => {
    const { data: ownNotifs } = await clients["admin-a"].rpc("list_my_notifications", {});
    assert.ok(Array.isArray(ownNotifs));

    // Direct table select as team member never returns admin-a's rows even
    // though both are active members of the same organization.
    const { data: crossUserRead } = await clients["assigned-team-a"]
      .from("notifications")
      .select("id")
      .eq("user_id", fixtures.users["admin-a"].profileId);
    assert.equal(crossUserRead.length, 0);
  });

  test("anon cannot read notifications, notification_preferences, or audit_logs", async () => {
    const notifs = await clients.anon.from("notifications").select("id").limit(1);
    assert.equal(notifs.data?.length ?? 0, 0);

    const prefs = await clients.anon.from("notification_preferences").select("id").limit(1);
    assert.equal(prefs.data?.length ?? 0, 0);

    const audit = await clients.anon.from("audit_logs").select("id").limit(1);
    assert.equal(audit.data?.length ?? 0, 0);
  });

  test("notification_deliveries is unreadable by any authenticated internal member", async () => {
    const { data, error } = await clients["admin-a"]
      .from("notification_deliveries")
      .select("id")
      .limit(1);
    // No SELECT grant at all for authenticated -> PostgREST reports an
    // error (or an empty set), never real rows.
    assert.equal((data ?? []).length, 0);
    if (!error) {
      assert.equal(data.length, 0);
    }
  });

  test("team_member and project_manager cannot read audit_logs (super_admin/admin only)", async () => {
    const { data: teamMemberRead } = await clients["assigned-team-a"]
      .from("audit_logs")
      .select("id")
      .eq("organization_id", fixtures.orgA.id);
    assert.equal(teamMemberRead.length, 0);

    const { data: adminRead } = await clients["admin-a"]
      .from("audit_logs")
      .select("id")
      .eq("organization_id", fixtures.orgA.id);
    assert.ok(adminRead.length > 0, "expected admin to see at least one audit row");
  });

  test("list_audit_logs() itself rejects a non-admin caller (defense in depth beyond RLS)", async () => {
    const { error } = await clients["assigned-team-a"].rpc("list_audit_logs", {});
    assert.ok(error);
    assert.match(error.message, /permission/i);
  });

  test("a client-portal user cannot read notifications or audit_logs", async () => {
    const notifs = await clients["client-owner-a"]
      .from("notifications")
      .select("id")
      .eq("organization_id", fixtures.orgA.id);
    assert.equal(notifs.data?.length ?? 0, 0);

    const audit = await clients["client-owner-a"]
      .from("audit_logs")
      .select("id")
      .eq("organization_id", fixtures.orgA.id);
    assert.equal(audit.data?.length ?? 0, 0);
  });

  test("a suspended member cannot read their own notifications even if a row exists", async () => {
    // Force-create a notification row for the suspended admin so we are
    // testing RLS denial, not merely absence of data.
    await admin.from("notifications").insert({
      organization_id: fixtures.orgA.id,
      user_id: fixtures.users["suspended-admin-a"].profileId,
      event_type: "lead.created",
      title: "Should be unreadable",
      entity_type: "lead",
      entity_id: sampleLeadId,
      dedupe_key: `suspended-check-${fixtures.runId}`,
    });

    const { data } = await clients["suspended-admin-a"]
      .from("notifications")
      .select("id")
      .eq("dedupe_key", `suspended-check-${fixtures.runId}`);
    assert.equal(data.length, 0);
  });

  test("authenticated cannot INSERT, UPDATE, or DELETE audit_logs directly", async () => {
    const insertResult = await clients["admin-a"].from("audit_logs").insert({
      organization_id: fixtures.orgA.id,
      actor_type: "internal",
      action: "lead.created",
      entity_type: "lead",
      entity_id: sampleLeadId,
      metadata: {},
    });
    assert.ok(insertResult.error);

    const updateResult = await clients["admin-a"]
      .from("audit_logs")
      .update({ metadata: { tampered: true } })
      .eq("entity_id", sampleLeadId);
    assert.ok(updateResult.error);

    const deleteResult = await clients["admin-a"].from("audit_logs").delete().eq("entity_id", sampleLeadId);
    assert.ok(deleteResult.error);
  });

  test("authenticated cannot write to notifications or notification_deliveries directly", async () => {
    const notifInsert = await clients["admin-a"].from("notifications").insert({
      organization_id: fixtures.orgA.id,
      user_id: fixtures.users["admin-a"].profileId,
      event_type: "lead.created",
      title: "Forged notification",
      dedupe_key: `forged-${fixtures.runId}`,
    });
    assert.ok(notifInsert.error);

    const deliveryInsert = await clients["admin-a"].from("notification_deliveries").insert({
      notification_id: "00000000-0000-4000-8000-000000000000",
      recipient_email: "forged@example.com",
    });
    assert.ok(deliveryInsert.error);
  });

  test("set_notification_preference only ever writes the caller's own profile_id", async () => {
    const { error } = await clients["assigned-team-a"].rpc("set_notification_preference", {
      p_event_type: "lead.created",
      p_in_app: false,
      p_email: true,
    });
    assert.equal(error, null, error?.message);

    const { data } = await admin
      .from("notification_preferences")
      .select("profile_id, in_app, email")
      .eq("profile_id", fixtures.users["assigned-team-a"].profileId)
      .eq("event_type", "lead.created")
      .single();

    assert.equal(data.in_app, false);
    assert.equal(data.email, true);

    // The admin's own preference for the same event_type must be untouched.
    const { data: adminPref } = await admin
      .from("notification_preferences")
      .select("id")
      .eq("profile_id", fixtures.users["admin-a"].profileId)
      .eq("event_type", "lead.created");
    assert.equal(adminPref.length, 0);
  });
});
