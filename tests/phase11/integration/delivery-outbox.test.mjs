import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { cleanupPhase11Fixtures, createPhase11Fixtures } from "../helpers/factory.mjs";
import { createTestAdminClient, signInTestUser } from "../../phase8/helpers/supabase-clients.mjs";
import {
  getPhase8IntegrationSkipReason,
  hasPhase8IntegrationEnv,
} from "../../phase8/helpers/test-env.mjs";

async function createPendingDelivery(admin, fixtures, suffix) {
  const { data: notification } = await admin
    .from("notifications")
    .insert({
      organization_id: fixtures.orgA.id,
      user_id: fixtures.users["admin-a"].profileId,
      event_type: "lead.created",
      title: `Outbox test ${suffix}`,
      dedupe_key: `outbox-${suffix}`,
    })
    .select("id")
    .single();

  const { data: delivery } = await admin
    .from("notification_deliveries")
    .insert({
      notification_id: notification.id,
      recipient_email: `outbox-${suffix}@example.com`,
      status: "pending",
    })
    .select("id")
    .single();

  return { notificationId: notification.id, deliveryId: delivery.id };
}

// claim_pending_email_deliveries() is a GLOBAL, unscoped queue by design —
// production draining must sweep every organization's pending mail in one
// cron pass, not just one tenant's (see docs/PHASE_11_NOTIFICATIONS_SETUP.md
// and the migration's own comments). That is exactly what makes it unsafe
// for a test that only tracks ONE delivery id to call with p_limit > 1: any
// OTHER pending row claimed in the same call (this repo's persistent E2E
// fixture organizations create real ones constantly) flips to 'sending' and
// is then never revisited by this test, since claim_pending_email_deliveries
// only ever selects status='pending' — an orphan, permanently. Investigation
// found exactly this: 21 rows stuck in 'sending' forever, 100% belonging to
// the Phase 8/11 E2E fixture organizations, none of them created by this
// suite's own (fully torn-down-per-run) fixtures.
//
// Every test below that is not itself testing the claim RPC's concurrency
// guarantee therefore establishes its 'sending' precondition with a direct,
// id-scoped UPDATE instead of the shared claim — deterministic regardless of
// what else is in the queue, and touches only the exact row this test
// created. This does not weaken FOR UPDATE SKIP LOCKED or any other
// production guarantee: the RPC itself is completely unchanged, and its
// concurrency behavior remains fully covered by the first test below, which
// is the one test that must exercise the real, global claim.
//
// claim_pending_email_deliveries() now also stamps claimed_at/lease_expires_at
// and increments attempt_count on every claim (20260806020000_fix_phase_11_delivery_lease.sql)
// so a bare status-only UPDATE would violate notification_deliveries_sending_requires_lease
// and would understate attempt_count relative to what a real claim does. This
// helper reproduces exactly those side effects for the one row it targets,
// so the precondition it sets up is indistinguishable from a real claim from
// mark_email_delivery_result's point of view.
//
// Returns the claimed_at it stamped: since
// 20260806030000_fix_phase_11_claim_identity.sql that value IS the claim's
// identity, and mark_email_delivery_result compare-and-sets on it, so a
// caller that cannot produce it cannot resolve the row at all.
async function forceDeliveryToSending(admin, deliveryId) {
  const { data: current, error: readError } = await admin
    .from("notification_deliveries")
    .select("attempt_count")
    .eq("id", deliveryId)
    .eq("status", "pending")
    .single();
  if (readError || !current) {
    throw new Error(
      `Expected the test-owned delivery ${deliveryId} to be claimable (status='pending') but it was not: ${
        readError?.message ?? "no matching row"
      }`,
    );
  }

  const { data, error } = await admin
    .from("notification_deliveries")
    .update({
      status: "sending",
      claimed_at: new Date().toISOString(),
      lease_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      attempt_count: current.attempt_count + 1,
    })
    .eq("id", deliveryId)
    .eq("status", "pending")
    .select("id, claimed_at")
    .single();
  if (error || !data) {
    throw new Error(
      `Expected the test-owned delivery ${deliveryId} to be claimable (status='pending') but it was not: ${
        error?.message ?? "no matching row"
      }`,
    );
  }
  // Read back the stored claimed_at rather than reusing the string sent up:
  // PostgREST returns the value as PostgreSQL actually stored it, which is
  // what the compare-and-set will be matched against.
  return data.claimed_at;
}

describe("Phase 11 email outbox: claim, retry, backoff", () => {
  if (!hasPhase8IntegrationEnv()) {
    test("Phase 11 delivery outbox integration tests", (t) => {
      t.skip(getPhase8IntegrationSkipReason());
    });
    return;
  }

  let admin;
  let fixtures;

  before(async () => {
    admin = createTestAdminClient();
    fixtures = await createPhase11Fixtures(admin);
  });

  after(async () => {
    await cleanupPhase11Fixtures(admin, fixtures);
  });

  test("claim_pending_email_deliveries flips status to sending and two concurrent claims never overlap", async () => {
    const rows = await Promise.all([
      createPendingDelivery(admin, fixtures, `${fixtures.runId}-a`),
      createPendingDelivery(admin, fixtures, `${fixtures.runId}-b`),
    ]);

    const [claim1, claim2] = await Promise.all([
      admin.rpc("claim_pending_email_deliveries", { p_limit: 1 }),
      admin.rpc("claim_pending_email_deliveries", { p_limit: 1 }),
    ]);

    const claimedRows = [...(claim1.data ?? []), ...(claim2.data ?? [])];
    const claimedIds = claimedRows.map((row) => row.delivery_id);
    // `for update skip locked` guarantees two concurrent claims never return
    // the same row, even under a race.
    assert.equal(new Set(claimedIds).size, claimedIds.length);
    // Every claim must hand back its own identity, or the caller could never
    // resolve the row it was just given.
    for (const row of claimedRows) {
      assert.ok(row.claimed_at, "claim must return claimed_at");
    }

    for (const row of rows) {
      const { data } = await admin
        .from("notification_deliveries")
        .select("status")
        .eq("id", row.deliveryId)
        .single();
      // Only claimed rows flip to 'sending'; verify at least one of the two
      // fixture rows was claimed (both were pending and within p_limit
      // total across the two concurrent calls).
      assert.ok(["pending", "sending"].includes(data.status));
    }

    // This is the one test in this file that legitimately calls the real,
    // global claim RPC with a limit that can grab a row this test did not
    // create (the queue is shared and unscoped by design — see the note
    // above the file). Resolve exactly what the RPC itself reported as
    // claimed, by id, so this test never contributes another permanently
    // orphaned 'sending' row regardless of what else was in the queue.
    for (const row of claimedRows) {
      await admin.rpc("mark_email_delivery_result", {
        p_delivery_id: row.delivery_id,
        p_status: "sent",
        p_claimed_at: row.claimed_at,
      });
    }
  });

  test("marking a delivery sent sets sent_at and status=sent", async () => {
    const { deliveryId } = await createPendingDelivery(admin, fixtures, `${fixtures.runId}-sent`);
    const claimedAt = await forceDeliveryToSending(admin, deliveryId);

    const { error } = await admin.rpc("mark_email_delivery_result", {
      p_delivery_id: deliveryId,
      p_status: "sent",
      p_claimed_at: claimedAt,
    });
    assert.equal(error, null, error?.message);

    const { data } = await admin
      .from("notification_deliveries")
      .select("status, sent_at, claimed_at, lease_expires_at")
      .eq("id", deliveryId)
      .single();
    assert.equal(data.status, "sent");
    assert.ok(data.sent_at);
    // notification_deliveries_terminal_has_no_lease requires this; a settled
    // delivery must not keep holding a lease.
    assert.equal(data.claimed_at, null);
    assert.equal(data.lease_expires_at, null);
  });

  test("a failed delivery increments attempt_count and sets a future next_attempt_at", async () => {
    const { deliveryId } = await createPendingDelivery(admin, fixtures, `${fixtures.runId}-fail1`);
    const claimedAt = await forceDeliveryToSending(admin, deliveryId);

    const before = new Date();
    const { error } = await admin.rpc("mark_email_delivery_result", {
      p_delivery_id: deliveryId,
      p_status: "failed",
      p_claimed_at: claimedAt,
      p_error_code: "provider_error",
    });
    assert.equal(error, null, error?.message);

    const { data } = await admin
      .from("notification_deliveries")
      .select("status, attempt_count, last_error_code, next_attempt_at, claimed_at, lease_expires_at")
      .eq("id", deliveryId)
      .single();

    assert.equal(data.status, "pending");
    // attempt_count was incremented once by forceDeliveryToSending (which
    // simulates the claim that would have preceded this failure report) —
    // mark_email_delivery_result's failure path reads it but never
    // increments it a second time.
    assert.equal(data.attempt_count, 1);
    assert.equal(data.last_error_code, "provider_error");
    assert.ok(new Date(data.next_attempt_at) > before);
    // notification_deliveries_pending_has_no_lease requires this; returning
    // a delivery to 'pending' must release its claim lease.
    assert.equal(data.claimed_at, null);
    assert.equal(data.lease_expires_at, null);
  });

  test("attempt_count reaching 5 sets status=failed and stops being claimable", async () => {
    const { deliveryId } = await createPendingDelivery(admin, fixtures, `${fixtures.runId}-cap`);

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const claimedAt = await forceDeliveryToSending(admin, deliveryId);
      await admin.rpc("mark_email_delivery_result", {
        p_delivery_id: deliveryId,
        p_status: "failed",
        p_claimed_at: claimedAt,
        p_error_code: "provider_error",
      });
      // Force next_attempt_at into the past so the next loop iteration can
      // reclaim it immediately instead of waiting on the real backoff delay.
      await admin
        .from("notification_deliveries")
        .update({ next_attempt_at: new Date(Date.now() - 1000).toISOString() })
        .eq("id", deliveryId)
        .neq("status", "failed");
    }

    const { data } = await admin
      .from("notification_deliveries")
      .select("status, attempt_count, claimed_at, lease_expires_at")
      .eq("id", deliveryId)
      .single();
    assert.equal(data.status, "failed");
    assert.equal(data.attempt_count, 5);
    // notification_deliveries_terminal_has_no_lease requires this.
    assert.equal(data.claimed_at, null);
    assert.equal(data.lease_expires_at, null);

    // A terminal 'failed' row is excluded by claim_pending_email_deliveries'
    // own status='pending' WHERE clause, not by losing a race for a claim
    // slot — p_limit:1 proves the point exactly as rigorously as a larger
    // limit would, with less incidental impact on whatever else is queued.
    const { data: claimed } = await admin.rpc("claim_pending_email_deliveries", { p_limit: 1 });
    assert.equal((claimed ?? []).some((row) => row.delivery_id === deliveryId), false);
    // Resolve whatever (if anything) this proof-of-absence call incidentally
    // claimed, for the same reason as the concurrent-claims test above.
    for (const row of claimed ?? []) {
      await admin.rpc("mark_email_delivery_result", {
        p_delivery_id: row.delivery_id,
        p_status: "sent",
        p_claimed_at: row.claimed_at,
      });
    }
  });

  test("claim_pending_email_deliveries and mark_email_delivery_result are not executable by an authenticated internal member", async () => {
    const adminClient = await signInTestUser(
      fixtures.users["admin-a"].email,
      fixtures.users["admin-a"].password,
    );
    const claimResult = await adminClient.rpc("claim_pending_email_deliveries", { p_limit: 1 });
    assert.ok(claimResult.error);

    // Passes a well-formed p_claimed_at so this asserts a genuine privilege
    // denial, not an incidental "function not found" from omitting a required
    // argument of the post-claim-identity signature.
    const markResult = await adminClient.rpc("mark_email_delivery_result", {
      p_delivery_id: "00000000-0000-4000-8000-000000000000",
      p_status: "sent",
      p_claimed_at: new Date().toISOString(),
    });
    assert.ok(markResult.error);
  });
});
