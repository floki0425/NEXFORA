// Proves the event-atomicity fix: private.emit_event no longer silently
// discards a recipient-resolution/notification-fan-out failure, while the
// business mutation still commits regardless.
//
// private.notification_dispatch_failures lives in the `private` schema and
// is not PostgREST-reachable by design (revoked from every role, including
// service_role) — so this suite verifies the OBSERVABLE, PostgREST-reachable
// side effects (the mutation succeeds; no partial/corrupt notification state
// is left behind for the failing recipient) via the same admin client every
// other Phase 11 integration test uses, and separately via the new
// service-role-only list_notification_dispatch_failures() RPC, which is the
// one new surface this fix adds specifically to make the failure record
// observable/testable rather than reachable only via direct SQL. Both were
// also manually verified against TEST during this fix (see the session
// report) since the RPC did not exist yet at the moment the underlying bug
// was first reproduced.

import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { cleanupPhase11Fixtures, createPhase11Fixtures } from "../helpers/factory.mjs";
import { createTestAdminClient } from "../../phase8/helpers/supabase-clients.mjs";
import {
  getPhase8IntegrationSkipReason,
  hasPhase8IntegrationEnv,
} from "../../phase8/helpers/test-env.mjs";

describe("Phase 11 event-atomicity fix: fan-out failures are recorded, not swallowed", () => {
  if (!hasPhase8IntegrationEnv()) {
    test("Phase 11 event-atomicity integration tests", (t) => {
      t.skip(getPhase8IntegrationSkipReason());
    });
    return;
  }

  let admin;
  let fixtures;
  let malformedEmailUser;

  before(async () => {
    admin = createTestAdminClient();
    fixtures = await createPhase11Fixtures(admin);

    // A dot-less-domain email (e.g. "user@localhost") passes Supabase Auth's
    // own signup validation but fails
    // notification_deliveries_recipient_email_format's regex
    // (`^[^\s@]+@[^\s@]+\.[^\s@]+$`, which requires a dotted domain) —
    // reachable through completely ordinary account creation, not a
    // contrived value. Made the ONLY admin of its own dedicated org so it is
    // unambiguously the sole qualifying recipient for the event below.
    const email = `phase11-atomicity-${fixtures.runId}@localhost`;
    const { data: authUser, error: authError } = await admin.auth.admin.createUser({
      email,
      password: "Phase11AtomicityTest!1",
      email_confirm: true,
    });
    if (authError || !authUser?.user) {
      throw new Error(`Failed to create malformed-email fixture user: ${authError?.message}`);
    }
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .insert({ auth_user_id: authUser.user.id, full_name: "Malformed Email Admin" })
      .select("id")
      .single();
    if (profileError || !profile) {
      throw new Error(`Failed to create profile: ${profileError?.message}`);
    }
    const { error: memberError } = await admin.from("organization_members").insert({
      organization_id: fixtures.orgB.id,
      user_id: profile.id,
      role: "admin",
      status: "active",
    });
    if (memberError) {
      throw new Error(`Failed to create membership: ${memberError.message}`);
    }

    malformedEmailUser = { authUserId: authUser.user.id, profileId: profile.id, email };
  });

  after(async () => {
    await admin
      .from("organization_members")
      .delete()
      .eq("organization_id", fixtures.orgB.id)
      .eq("user_id", malformedEmailUser.profileId);
    await admin.from("profiles").delete().eq("id", malformedEmailUser.profileId);
    await admin.auth.admin.deleteUser(malformedEmailUser.authUserId);
    await cleanupPhase11Fixtures(admin, fixtures);
  });

  test("the business mutation still commits even when the only recipient's email fails the delivery format check", async () => {
    const { data: lead, error } = await admin
      .from("leads")
      .insert({
        organization_id: fixtures.orgB.id,
        full_name: `Atomicity Fix Lead ${fixtures.runId}`,
        email: `atomicity-fix-${fixtures.runId}@example.com`,
        service_interest: "Website",
        source: "referral",
      })
      .select("id")
      .single();

    assert.equal(error, null, error?.message);
    assert.ok(lead?.id, "the lead must be created regardless of the downstream fan-out failure");

    const { data: auditRows } = await admin
      .from("audit_logs")
      .select("id, action")
      .eq("entity_id", lead.id);
    assert.equal(auditRows.length, 1, "the audit row must still be written unconditionally");
    assert.equal(auditRows[0].action, "lead.created");
  });

  test("no partial/corrupt notification or delivery row is left behind for the failing recipient", async () => {
    const { data: lead } = await admin
      .from("leads")
      .insert({
        organization_id: fixtures.orgB.id,
        full_name: `Atomicity Fix Lead 2 ${fixtures.runId}`,
        email: `atomicity-fix-2-${fixtures.runId}@example.com`,
        service_interest: "Website",
        source: "referral",
      })
      .select("id")
      .single();

    const { data: notifs } = await admin
      .from("notifications")
      .select("id")
      .eq("entity_id", lead.id)
      .eq("user_id", malformedEmailUser.profileId);
    // The whole fan-out block shares one savepoint: when the
    // notification_deliveries insert fails, the notifications insert that
    // preceded it in the same iteration is rolled back too — proven here as
    // "zero rows", not a half-written notification with no delivery.
    assert.equal(notifs.length, 0);
  });

  test("list_notification_dispatch_failures() (service_role only) now shows the failure, with the real audit_log_id and SQLSTATE 23514", async () => {
    const { data: lead } = await admin
      .from("leads")
      .insert({
        organization_id: fixtures.orgB.id,
        full_name: `Atomicity Fix Lead 3 ${fixtures.runId}`,
        email: `atomicity-fix-3-${fixtures.runId}@example.com`,
        service_interest: "Website",
        source: "referral",
      })
      .select("id")
      .single();

    const { data: auditRows } = await admin
      .from("audit_logs")
      .select("id")
      .eq("entity_id", lead.id)
      .single();

    const { data: failures, error } = await admin.rpc("list_notification_dispatch_failures", {
      p_limit: 50,
    });
    assert.equal(error, null, error?.message);

    const match = (failures ?? []).find((row) => row.audit_log_id === auditRows.id);
    assert.ok(match, "expected a failure record linked to this event's audit_log_id");
    assert.equal(match.error_sqlstate, "23514");
    assert.equal(match.entity_type, "lead");
  });

  test("list_notification_dispatch_failures() is not executable by an authenticated internal member", async () => {
    const { signInTestUser } = await import("../../phase8/helpers/supabase-clients.mjs");
    const adminClient = await signInTestUser(
      fixtures.users["admin-a"].email,
      fixtures.users["admin-a"].password,
    );
    const { error } = await adminClient.rpc("list_notification_dispatch_failures", { p_limit: 1 });
    assert.ok(error, "expected an authenticated caller to be denied");
  });
});
