import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import {
  cleanupPhase10Fixtures,
  createPhase10Fixtures,
  createSubscription,
} from "../helpers/factory.mjs";
import {
  createTestAdminClient,
  createTestAnonClient,
  signInTestUser,
} from "../../phase8/helpers/supabase-clients.mjs";
import {
  getPhase8IntegrationSkipReason,
  hasPhase8IntegrationEnv,
} from "../../phase8/helpers/test-env.mjs";

describe("Phase 10 maintenance subscriptions and usage RLS", () => {
  if (!hasPhase8IntegrationEnv()) {
    test("Phase 10 subscription integration tests", (t) => {
      t.skip(getPhase8IntegrationSkipReason());
    });
    return;
  }

  let admin;
  let fixtures;
  const clients = {};

  before(async () => {
    admin = createTestAdminClient();
    fixtures = await createPhase10Fixtures(admin);
    for (const [name, user] of Object.entries(fixtures.users)) {
      clients[name] = await signInTestUser(user.email, user.password);
    }
    clients.anon = createTestAnonClient();
  });

  after(async () => {
    await cleanupPhase10Fixtures(admin, fixtures);
  });

  test("admin can create a valid maintenance subscription", async () => {
    const subscription = await createSubscription(
      clients["internal-admin"],
      fixtures,
      { plan_name: "Valid monthly care plan" },
    );
    assert.ok(subscription.id);
    assert.equal(subscription.client_id, fixtures.clientA.id);
    assert.equal(subscription.organization_id, fixtures.orgA.id);
  });

  test("cross-organization clients and mismatched project/client pairs are rejected", async () => {
    const crossOrg = await clients["internal-admin"].from("subscriptions").insert({
      organization_id: fixtures.orgA.id,
      client_id: fixtures.clientOtherOrg.id,
      plan_name: "Forged cross-org plan",
      billing_cycle: "monthly",
      amount: 100,
      created_by: fixtures.users["internal-admin"].profileId,
    });
    assert.ok(crossOrg.error);

    const wrongProject = await clients["internal-admin"]
      .from("subscriptions")
      .insert({
        organization_id: fixtures.orgA.id,
        client_id: fixtures.clientA.id,
        project_id: fixtures.projectB.id,
        plan_name: "Mismatched project plan",
        billing_cycle: "monthly",
        amount: 100,
        created_by: fixtures.users["internal-admin"].profileId,
      });
    assert.ok(wrongProject.error);
  });

  test("invalid cycle, currency, amount, and included hours are rejected", async () => {
    const base = {
      organization_id: fixtures.orgA.id,
      client_id: fixtures.clientA.id,
      project_id: fixtures.projectA.id,
      plan_name: "Invalid plan",
      billing_cycle: "monthly",
      amount: 100,
      included_hours: 5,
      created_by: fixtures.users["internal-admin"].profileId,
    };
    for (const override of [
      { billing_cycle: "weekly" },
      { currency: "INVALID" },
      { amount: -1 },
      { included_hours: -0.01 },
    ]) {
      const { error } = await clients["internal-admin"]
        .from("subscriptions")
        .insert({ ...base, ...override });
      assert.ok(error);
    }
  });

  test("cancellation requires status and cancelled_at to change atomically", async () => {
    const subscription = await createSubscription(
      clients["internal-admin"],
      fixtures,
      { plan_name: "Cancellation invariant plan" },
    );
    const invalid = await clients["internal-admin"]
      .from("subscriptions")
      .update({ status: "cancelled" })
      .eq("id", subscription.id);
    assert.ok(invalid.error);

    const cancelledAt = "2026-08-15T00:00:00.000Z";
    const valid = await clients["internal-admin"]
      .from("subscriptions")
      .update({ status: "cancelled", cancelled_at: cancelledAt })
      .eq("id", subscription.id)
      .select("status, cancelled_at")
      .single();
    assert.equal(valid.error, null);
    assert.equal(valid.data.status, "cancelled");
    assert.ok(valid.data.cancelled_at);
  });

  test("valid usage is append-only and rejects zero or negative hours", async () => {
    const subscription = await createSubscription(
      clients["internal-admin"],
      fixtures,
      { plan_name: "Usage ledger plan" },
    );
    const { data: usage, error: usageError } = await clients[
      "internal-admin"
    ]
      .from("subscription_usage")
      .insert({
        organization_id: fixtures.orgA.id,
        subscription_id: subscription.id,
        description: "Production support",
        hours_used: 2.5,
        usage_date: "2026-08-10",
        recorded_by: fixtures.users["internal-admin"].profileId,
      })
      .select("id")
      .single();
    assert.equal(usageError, null);

    for (const hours of [0, -1]) {
      const { error } = await clients["internal-admin"]
        .from("subscription_usage")
        .insert({
          organization_id: fixtures.orgA.id,
          subscription_id: subscription.id,
          description: "Invalid usage",
          hours_used: hours,
          usage_date: "2026-08-10",
          recorded_by: fixtures.users["internal-admin"].profileId,
        });
      assert.ok(error);
    }

    const update = await clients["internal-admin"]
      .from("subscription_usage")
      .update({ hours_used: 99 })
      .eq("id", usage.id);
    const deletion = await clients["internal-admin"]
      .from("subscription_usage")
      .delete()
      .eq("id", usage.id);
    assert.ok(update.error);
    assert.ok(deletion.error);
  });

  test("project manager can record usage only for a manageable project", async () => {
    const ownProjectSubscription = await createSubscription(
      clients["internal-admin"],
      fixtures,
      { plan_name: "Managed project plan" },
    );
    const otherProjectSubscription = await createSubscription(
      clients["internal-admin"],
      fixtures,
      {
        client_id: fixtures.clientB.id,
        project_id: fixtures.projectB.id,
        plan_name: "Unmanaged project plan",
      },
    );
    const allowed = await clients["project-manager"]
      .from("subscription_usage")
      .insert({
        organization_id: fixtures.orgA.id,
        subscription_id: ownProjectSubscription.id,
        description: "Managed project support",
        hours_used: 1,
        usage_date: "2026-08-11",
        recorded_by: fixtures.users["project-manager"].profileId,
      });
    assert.equal(allowed.error, null, allowed.error?.message);

    const denied = await clients["project-manager"]
      .from("subscription_usage")
      .insert({
        organization_id: fixtures.orgA.id,
        subscription_id: otherProjectSubscription.id,
        description: "Unmanaged project support",
        hours_used: 1,
        usage_date: "2026-08-11",
        recorded_by: fixtures.users["project-manager"].profileId,
      });
    assert.ok(denied.error);
  });

  test("cross-organization usage and all portal-authored usage are denied", async () => {
    const ownClientSubscription = await createSubscription(
      clients["internal-admin"],
      fixtures,
      { plan_name: "Portal write boundary plan" },
    );
    const otherOrgSubscription = await clients["other-org-admin"]
      .from("subscriptions")
      .insert({
        organization_id: fixtures.orgB.id,
        client_id: fixtures.clientOtherOrg.id,
        project_id: fixtures.projectOtherOrg.id,
        plan_name: "Other organization plan",
        billing_cycle: "monthly",
        amount: 500,
        included_hours: 2,
        created_by: fixtures.users["other-org-admin"].profileId,
      })
      .select("id")
      .single();
    assert.equal(otherOrgSubscription.error, null);

    const forged = await clients["internal-admin"]
      .from("subscription_usage")
      .insert({
        organization_id: fixtures.orgA.id,
        subscription_id: otherOrgSubscription.data.id,
        description: "Cross-org usage",
        hours_used: 1,
        usage_date: "2026-08-12",
        recorded_by: fixtures.users["internal-admin"].profileId,
      });
    assert.ok(forged.error);

    const portalWrite = await clients["client-owner"]
      .from("subscription_usage")
      .insert({
        organization_id: fixtures.orgA.id,
        subscription_id: otherOrgSubscription.data.id,
        description: "Portal-forged usage",
        hours_used: 1,
        usage_date: "2026-08-12",
        recorded_by: fixtures.users["client-owner"].profileId,
      });
    assert.ok(portalWrite.error);

    const ownClientPortalWrite = await clients["client-owner"]
      .from("subscription_usage")
      .insert({
        organization_id: fixtures.orgA.id,
        subscription_id: ownClientSubscription.id,
        description: "Portal-forged own-client usage",
        hours_used: 1,
        usage_date: "2026-08-12",
        recorded_by: fixtures.users["client-owner"].profileId,
      });
    assert.ok(ownClientPortalWrite.error);
  });

  test("used and remaining hours are derived correctly, including overage", async () => {
    const subscription = await createSubscription(
      clients["internal-admin"],
      fixtures,
      { plan_name: "Hours calculation plan", included_hours: 3 },
    );
    const entries = [
      ["First support session", 1.25, "2026-08-01"],
      ["Second support session", 2.5, "2026-08-02"],
    ].map(([description, hours, usageDate]) => ({
      organization_id: fixtures.orgA.id,
      subscription_id: subscription.id,
      description,
      hours_used: hours,
      usage_date: usageDate,
      recorded_by: fixtures.users["internal-admin"].profileId,
    }));
    const { error: insertError } = await clients["internal-admin"]
      .from("subscription_usage")
      .insert(entries);
    assert.equal(insertError, null);

    const { data, error } = await clients["client-owner"].rpc(
      "get_client_subscriptions",
    );
    assert.equal(error, null);
    const plan = data.find((row) => row.id === subscription.id);
    assert.equal(Number(plan.used_hours), 3.75);
    assert.equal(Number(plan.remaining_hours), -0.75);
  });

  test("portal reads only its own plans and never receives internal notes", async () => {
    const own = await createSubscription(clients["internal-admin"], fixtures, {
      plan_name: "Client-safe plan",
      notes: "This must stay internal.",
    });
    const other = await createSubscription(clients["internal-admin"], fixtures, {
      client_id: fixtures.clientB.id,
      project_id: fixtures.projectB.id,
      plan_name: "Other client plan",
    });

    const { data: ownList, error: ownError } = await clients[
      "client-owner"
    ].rpc("get_client_subscriptions");
    assert.equal(ownError, null);
    assert.ok(ownList.some((row) => row.id === own.id));
    assert.ok(!ownList.some((row) => row.id === other.id));
    assert.equal("notes" in ownList.find((row) => row.id === own.id), false);
    assert.equal("organization_id" in ownList[0], false);

    const { data: ownDetail, error: ownDetailError } = await clients[
      "client-owner"
    ].rpc("get_client_subscription", { target_subscription_id: own.id });
    assert.equal(ownDetailError, null);
    assert.equal(ownDetail?.[0]?.id, own.id);
    assert.equal("notes" in ownDetail[0], false);

    const { data: crossClientDetail, error: crossClientDetailError } =
      await clients["other-client-owner"].rpc("get_client_subscription", {
        target_subscription_id: own.id,
      });
    assert.equal(crossClientDetailError, null);
    assert.deepEqual(crossClientDetail, []);

    const { data: directBaseRows, error: directBaseError } = await clients[
      "client-owner"
    ]
      .from("subscriptions")
      .select("id, notes")
      .eq("id", own.id);
    assert.equal(directBaseError, null);
    assert.deepEqual(directBaseRows, []);

    const { data: otherClientList } = await clients[
      "other-client-owner"
    ].rpc("get_client_subscriptions");
    assert.ok(!otherClientList.some((row) => row.id === own.id));
  });

  test("suspended portal member and anonymous caller receive no subscription data", async () => {
    for (const client of [clients["client-suspended"], clients.anon]) {
      const { data, error } = await client.rpc("get_client_subscriptions");
      assert.ok(error || (data ?? []).length === 0);
    }
  });

  test("team members have no unrestricted subscription or usage read access", async () => {
    const subscription = await createSubscription(
      clients["internal-admin"],
      fixtures,
      { plan_name: "Restricted financial plan" },
    );
    const { data: subscriptions, error: subscriptionError } = await clients[
      "assigned-team"
    ]
      .from("subscriptions")
      .select("id")
      .eq("id", subscription.id);
    assert.equal(subscriptionError, null);
    assert.equal(subscriptions.length, 0);

    const { data: usage, error: usageError } = await clients["assigned-team"]
      .from("subscription_usage")
      .select("id")
      .eq("subscription_id", subscription.id);
    assert.equal(usageError, null);
    assert.equal(usage.length, 0);
  });
});
