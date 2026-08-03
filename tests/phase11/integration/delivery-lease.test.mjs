import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { cleanupPhase11Fixtures, createPhase11Fixtures } from "../helpers/factory.mjs";
import { createTestAdminClient } from "../../phase8/helpers/supabase-clients.mjs";
import {
  getPhase8IntegrationSkipReason,
  hasPhase8IntegrationEnv,
} from "../../phase8/helpers/test-env.mjs";

// claim_pending_email_deliveries() is a GLOBAL, unscoped queue by design (see
// delivery-outbox.test.mjs's own note and docs/PHASE_11_NOTIFICATIONS_SETUP.md).
// Every test below that needs to know FOR CERTAIN which row a real claim call
// touched gives that row an ordering key (next_attempt_at, or claimed_at/
// lease_expires_at for a pre-'sending' row) far older than anything else any
// part of this app would ever legitimately produce, so it is provably first
// in claim's `order by ... limit ...`. That makes a p_limit:1 call
// deterministic without ever raising the batch limit (which would risk
// sweeping up unrelated rows from other suites) and without retries/sleeps.
// This suite runs under --test-concurrency=1 (package.json), so no other
// Phase 11 integration file's claim calls interleave with these.
const ANCIENT_CLAIMED_AT = new Date("2000-01-01T00:00:00Z");
const ANCIENT_LEASE_EXPIRES_AT = new Date("2000-01-01T00:10:00Z");
const MORE_ANCIENT_NEXT_ATTEMPT_AT = new Date("1999-01-01T00:00:00Z");
const LEASE_DURATION_MS = 10 * 60 * 1000;

async function createPendingDelivery(admin, fixtures, suffix, overrides = {}) {
  const { data: notification } = await admin
    .from("notifications")
    .insert({
      organization_id: fixtures.orgA.id,
      user_id: fixtures.users["admin-a"].profileId,
      event_type: "lead.created",
      title: `Lease test ${suffix}`,
      dedupe_key: `lease-${suffix}`,
    })
    .select("id")
    .single();

  const { data: delivery, error } = await admin
    .from("notification_deliveries")
    .insert({
      notification_id: notification.id,
      recipient_email: `lease-${suffix}@example.com`,
      status: "pending",
      ...overrides,
    })
    .select("id")
    .single();
  if (error || !delivery) {
    throw new Error(`Failed to create pending delivery fixture: ${error?.message}`);
  }

  return { notificationId: notification.id, deliveryId: delivery.id };
}

// Simulates exactly what claim_pending_email_deliveries() itself would have
// set, for tests whose purpose is not to exercise the claim path but to
// exercise reclaim/exhaustion logic starting from an already-'sending' row.
// Returns the stored claimed_at alongside the id: since
// 20260806030000_fix_phase_11_claim_identity.sql that value is the claim's
// identity and mark_email_delivery_result compare-and-sets on it. Read back
// from PostgREST rather than reusing the string sent up, so the test always
// holds the value PostgreSQL actually stored.
async function createSendingDelivery(admin, fixtures, suffix, { claimedAt, leaseExpiresAt, attemptCount }) {
  const { deliveryId } = await createPendingDelivery(admin, fixtures, suffix);
  const { data, error } = await admin
    .from("notification_deliveries")
    .update({
      status: "sending",
      claimed_at: claimedAt.toISOString(),
      lease_expires_at: leaseExpiresAt.toISOString(),
      attempt_count: attemptCount,
    })
    .eq("id", deliveryId)
    .eq("status", "pending")
    .select("id, claimed_at")
    .single();
  if (error || !data) {
    throw new Error(`Failed to force delivery ${deliveryId} into sending: ${error?.message}`);
  }
  return { deliveryId, claimedAt: data.claimed_at };
}

// Simulates a lease expiring after a real claim (whose claimed_at is "now",
// not an ancient fixture value).
//
// Backdates the WHOLE lease window, not just lease_expires_at. Expiring only
// lease_expires_at (to claimed_at + 1ms) does make the lease expired, but it
// leaves the row's reclaim ordering key at roughly "now" — the NEWEST possible
// value. claim_pending_email_deliveries orders its reclaim branch by
// lease_expires_at, so any older claimable row anywhere in the shared, global,
// unscoped outbox then wins the single p_limit:1 slot and the reclaim returns
// somebody else's row. Earlier suites in the same `test:phase11:integration`
// run (event-emission, reminders) create exactly such rows, which made the two
// reclaim tests below fail intermittently depending on queue timing.
//
// Backdating claimed_at too keeps notification_deliveries_lease_expires_after_claimed
// satisfied and puts the ordering key back in this suite's ancient sentinel
// range, so the reclaim is deterministic. Neither caller asserts on the
// pre-reclaim claimed_at value — they settle the row with the identity the
// SECOND claim returned — so replacing it changes nothing they verify.
async function expireLease(admin, deliveryId) {
  const { error } = await admin
    .from("notification_deliveries")
    .update({
      claimed_at: ANCIENT_CLAIMED_AT.toISOString(),
      lease_expires_at: ANCIENT_LEASE_EXPIRES_AT.toISOString(),
    })
    .eq("id", deliveryId)
    .eq("status", "sending");
  if (error) {
    throw new Error(`Failed to expire lease for delivery ${deliveryId}: ${error.message}`);
  }
}

async function readDelivery(admin, deliveryId, columns) {
  const { data, error } = await admin
    .from("notification_deliveries")
    .select(columns)
    .eq("id", deliveryId)
    .single();
  if (error || !data) {
    throw new Error(`Failed to read delivery ${deliveryId}: ${error?.message}`);
  }
  return data;
}

// Every real claim call in this file resolves whatever it actually returned,
// by id, exactly like delivery-outbox.test.mjs's concurrency test — so this
// suite never contributes an orphaned 'sending' row regardless of what else
// was in the shared queue at the moment it ran.
async function resolveClaimed(admin, claimedRows) {
  for (const row of claimedRows ?? []) {
    await admin.rpc("mark_email_delivery_result", {
      p_delivery_id: row.delivery_id,
      p_status: "sent",
      p_claimed_at: row.claimed_at,
    });
  }
}

describe("Phase 11 delivery lease: bounded claims, reclaim, exhaustion", () => {
  if (!hasPhase8IntegrationEnv()) {
    test("Phase 11 delivery lease integration tests", (t) => {
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

  test("claiming a fresh pending row sets claimed_at, a 10-minute lease, and attempt_count=1", async () => {
    const { deliveryId } = await createPendingDelivery(admin, fixtures, `${fixtures.runId}-fresh`, {
      next_attempt_at: MORE_ANCIENT_NEXT_ATTEMPT_AT.toISOString(),
    });

    const { data: claimed, error } = await admin.rpc("claim_pending_email_deliveries", { p_limit: 1 });
    assert.equal(error, null, error?.message);
    assert.equal(claimed?.length, 1);
    assert.equal(claimed[0].delivery_id, deliveryId);

    const row = await readDelivery(admin, deliveryId, "status, claimed_at, lease_expires_at, attempt_count");
    assert.equal(row.status, "sending");
    assert.ok(row.claimed_at);
    assert.ok(row.lease_expires_at);
    assert.equal(row.attempt_count, 1);
    assert.equal(
      new Date(row.lease_expires_at).getTime() - new Date(row.claimed_at).getTime(),
      LEASE_DURATION_MS,
    );

    await resolveClaimed(admin, claimed);
  });

  test("a pending row with a future next_attempt_at is not claimed", async () => {
    const farFuture = new Date(Date.now() + 60 * 60 * 1000);
    const { deliveryId } = await createPendingDelivery(admin, fixtures, `${fixtures.runId}-future`, {
      next_attempt_at: farFuture.toISOString(),
    });

    const { data: claimed, error } = await admin.rpc("claim_pending_email_deliveries", { p_limit: 1 });
    assert.equal(error, null, error?.message);
    assert.equal((claimed ?? []).some((row) => row.delivery_id === deliveryId), false);

    const row = await readDelivery(admin, deliveryId, "status");
    assert.equal(row.status, "pending");

    await resolveClaimed(admin, claimed);
  });

  test("a sending row whose lease has not yet expired is not reclaimed", async () => {
    const claimedAt = new Date();
    const leaseExpiresAt = new Date(Date.now() + LEASE_DURATION_MS);
    const { deliveryId, claimedAt: storedClaimedAt } = await createSendingDelivery(
      admin,
      fixtures,
      `${fixtures.runId}-inflight`,
      { claimedAt, leaseExpiresAt, attemptCount: 1 },
    );

    const { data: claimed, error } = await admin.rpc("claim_pending_email_deliveries", { p_limit: 1 });
    assert.equal(error, null, error?.message);
    assert.equal((claimed ?? []).some((row) => row.delivery_id === deliveryId), false);

    const row = await readDelivery(admin, deliveryId, "status, claimed_at, lease_expires_at, attempt_count");
    assert.equal(row.status, "sending");
    assert.equal(new Date(row.claimed_at).getTime(), claimedAt.getTime());
    assert.equal(new Date(row.lease_expires_at).getTime(), leaseExpiresAt.getTime());
    assert.equal(row.attempt_count, 1);

    await resolveClaimed(admin, claimed);
    await admin.rpc("mark_email_delivery_result", {
      p_delivery_id: deliveryId,
      p_status: "sent",
      p_claimed_at: storedClaimedAt,
    });
  });

  test("a sending row whose lease has expired is reclaimed: same id, refreshed lease, attempt_count incremented again", async () => {
    const { deliveryId } = await createSendingDelivery(admin, fixtures, `${fixtures.runId}-reclaim`, {
      claimedAt: ANCIENT_CLAIMED_AT,
      leaseExpiresAt: ANCIENT_LEASE_EXPIRES_AT,
      attemptCount: 1,
    });

    const { data: claimed, error } = await admin.rpc("claim_pending_email_deliveries", { p_limit: 1 });
    assert.equal(error, null, error?.message);
    assert.equal(claimed?.length, 1);
    assert.equal(claimed[0].delivery_id, deliveryId);

    const row = await readDelivery(admin, deliveryId, "status, claimed_at, lease_expires_at, attempt_count");
    assert.equal(row.status, "sending");
    assert.ok(new Date(row.claimed_at).getTime() > ANCIENT_CLAIMED_AT.getTime());
    assert.ok(new Date(row.lease_expires_at).getTime() > ANCIENT_LEASE_EXPIRES_AT.getTime());
    assert.equal(row.attempt_count, 2);

    await resolveClaimed(admin, claimed);
  });

  test("two concurrent claims racing on the same single expired-lease row never both return it", async () => {
    const { deliveryId } = await createSendingDelivery(admin, fixtures, `${fixtures.runId}-race`, {
      claimedAt: ANCIENT_CLAIMED_AT,
      leaseExpiresAt: ANCIENT_LEASE_EXPIRES_AT,
      attemptCount: 1,
    });

    const [claim1, claim2] = await Promise.all([
      admin.rpc("claim_pending_email_deliveries", { p_limit: 1 }),
      admin.rpc("claim_pending_email_deliveries", { p_limit: 1 }),
    ]);
    const combined = [...(claim1.data ?? []), ...(claim2.data ?? [])];
    const matches = combined.filter((row) => row.delivery_id === deliveryId);
    // `for update skip locked` must cover the reclaim branch exactly as it
    // covers fresh pending claims: the oldest-eligible row across the whole
    // queue can only ever be handed to one of two racing callers.
    assert.equal(matches.length, 1);

    await resolveClaimed(admin, combined);
  });

  test("a row already at attempt_count=5 is never claimed even while otherwise eligible", async () => {
    const { deliveryId } = await createPendingDelivery(admin, fixtures, `${fixtures.runId}-cap`, {
      next_attempt_at: MORE_ANCIENT_NEXT_ATTEMPT_AT.toISOString(),
      attempt_count: 5,
    });

    const { data: claimed, error } = await admin.rpc("claim_pending_email_deliveries", { p_limit: 1 });
    assert.equal(error, null, error?.message);
    assert.equal((claimed ?? []).some((row) => row.delivery_id === deliveryId), false);

    const row = await readDelivery(admin, deliveryId, "status, attempt_count");
    assert.equal(row.status, "pending");
    assert.equal(row.attempt_count, 5);

    await resolveClaimed(admin, claimed);
  });

  test("an expired-lease sending row at attempt_count=5 self-heals to failed/claim_lease_exhausted, even though it is never itself claimed", async () => {
    const { deliveryId } = await createSendingDelivery(admin, fixtures, `${fixtures.runId}-exhausted`, {
      claimedAt: ANCIENT_CLAIMED_AT,
      leaseExpiresAt: ANCIENT_LEASE_EXPIRES_AT,
      attemptCount: 5,
    });

    const { data: claimed, error } = await admin.rpc("claim_pending_email_deliveries", { p_limit: 1 });
    assert.equal(error, null, error?.message);
    // Excluded from the claimable set (attempt_count >= 5), so it can never
    // appear in what the RPC reports as claimed...
    assert.equal((claimed ?? []).some((row) => row.delivery_id === deliveryId), false);

    // ...yet the same call's unconditional self-heal step must still retire
    // it, or it would be stuck in 'sending' forever — exactly the production
    // gap this migration closes.
    const row = await readDelivery(
      admin,
      deliveryId,
      "status, last_error_code, claimed_at, lease_expires_at, attempt_count",
    );
    assert.equal(row.status, "failed");
    assert.equal(row.last_error_code, "claim_lease_exhausted");
    assert.equal(row.claimed_at, null);
    assert.equal(row.lease_expires_at, null);
    assert.equal(row.attempt_count, 5);

    await resolveClaimed(admin, claimed);
  });

  test("the exhaustion self-heal does not touch an attempt_count=5 sending row whose lease has not yet expired", async () => {
    const claimedAt = new Date();
    const leaseExpiresAt = new Date(Date.now() + LEASE_DURATION_MS);
    const { deliveryId, claimedAt: storedClaimedAt } = await createSendingDelivery(
      admin,
      fixtures,
      `${fixtures.runId}-exhausted-inflight`,
      { claimedAt, leaseExpiresAt, attemptCount: 5 },
    );

    const { data: claimed, error } = await admin.rpc("claim_pending_email_deliveries", { p_limit: 1 });
    assert.equal(error, null, error?.message);

    const row = await readDelivery(
      admin,
      deliveryId,
      "status, claimed_at, lease_expires_at, attempt_count",
    );
    // The self-heal must wait for the lease to actually expire — it must
    // never terminate an attempt that is still genuinely in flight just
    // because it happens to be the final one allowed.
    assert.equal(row.status, "sending");
    assert.equal(new Date(row.claimed_at).getTime(), claimedAt.getTime());
    assert.equal(new Date(row.lease_expires_at).getTime(), leaseExpiresAt.getTime());
    assert.equal(row.attempt_count, 5);

    await resolveClaimed(admin, claimed);
    await admin.rpc("mark_email_delivery_result", {
      p_delivery_id: deliveryId,
      p_status: "failed",
      p_claimed_at: storedClaimedAt,
      p_error_code: "test_cleanup",
    });
  });

  test("p_limit is one shared budget across fresh-pending and expired-sending-reclaim combined, not a separate allowance per branch", async () => {
    const older = await createPendingDelivery(admin, fixtures, `${fixtures.runId}-shared-a`, {
      next_attempt_at: MORE_ANCIENT_NEXT_ATTEMPT_AT.toISOString(),
    });
    const { deliveryId: newerDeliveryId, claimedAt: newerClaimedAt } = await createSendingDelivery(
      admin,
      fixtures,
      `${fixtures.runId}-shared-b`,
      {
        claimedAt: ANCIENT_CLAIMED_AT,
        leaseExpiresAt: ANCIENT_LEASE_EXPIRES_AT,
        attemptCount: 1,
      },
    );

    const { data: claimed, error } = await admin.rpc("claim_pending_email_deliveries", { p_limit: 1 });
    assert.equal(error, null, error?.message);
    assert.equal(claimed?.length, 1);
    // 1999-01-01 sorts before 2000-01-01T00:10:00Z, so the pending branch's
    // row is strictly older and must win the single combined slot.
    assert.equal(claimed[0].delivery_id, older.deliveryId);

    const untouched = await readDelivery(
      admin,
      newerDeliveryId,
      "status, claimed_at, lease_expires_at, attempt_count",
    );
    assert.equal(untouched.status, "sending");
    assert.equal(new Date(untouched.claimed_at).getTime(), ANCIENT_CLAIMED_AT.getTime());
    assert.equal(new Date(untouched.lease_expires_at).getTime(), ANCIENT_LEASE_EXPIRES_AT.getTime());
    assert.equal(untouched.attempt_count, 1);

    await resolveClaimed(admin, claimed);
    await admin.rpc("mark_email_delivery_result", {
      p_delivery_id: newerDeliveryId,
      p_status: "sent",
      p_claimed_at: newerClaimedAt,
    });
  });

  test("end-to-end crash recovery: claim, simulate a crash by expiring the lease, reclaim, then settle", async () => {
    const { deliveryId } = await createPendingDelivery(admin, fixtures, `${fixtures.runId}-recovery`, {
      next_attempt_at: MORE_ANCIENT_NEXT_ATTEMPT_AT.toISOString(),
    });

    const first = await admin.rpc("claim_pending_email_deliveries", { p_limit: 1 });
    assert.equal(first.error, null, first.error?.message);
    assert.equal(first.data[0].delivery_id, deliveryId);
    const afterFirstClaim = await readDelivery(admin, deliveryId, "attempt_count");
    assert.equal(afterFirstClaim.attempt_count, 1);

    // Simulate the runner crashing before it ever calls
    // mark_email_delivery_result: the lease simply expires with time.
    await expireLease(admin, deliveryId);

    const second = await admin.rpc("claim_pending_email_deliveries", { p_limit: 1 });
    assert.equal(second.error, null, second.error?.message);
    assert.equal(second.data[0].delivery_id, deliveryId);
    const afterReclaim = await readDelivery(admin, deliveryId, "status, attempt_count");
    assert.equal(afterReclaim.status, "sending");
    assert.equal(afterReclaim.attempt_count, 2);

    const { error: markError } = await admin.rpc("mark_email_delivery_result", {
      p_delivery_id: deliveryId,
      p_status: "sent",
      // The identity of the claim being settled is the SECOND (reclaiming)
      // claim's, not the first's — the first claim was superseded.
      p_claimed_at: second.data[0].claimed_at,
    });
    assert.equal(markError, null, markError?.message);

    const final = await readDelivery(
      admin,
      deliveryId,
      "status, sent_at, claimed_at, lease_expires_at, attempt_count",
    );
    assert.equal(final.status, "sent");
    assert.ok(final.sent_at);
    assert.equal(final.claimed_at, null);
    assert.equal(final.lease_expires_at, null);
    assert.equal(final.attempt_count, 2);
  });

  test("the delivery row's id is stable across a reclaim — no new row is ever created", async () => {
    const { notificationId, deliveryId } = await createPendingDelivery(
      admin,
      fixtures,
      `${fixtures.runId}-stable-id`,
      { next_attempt_at: MORE_ANCIENT_NEXT_ATTEMPT_AT.toISOString() },
    );

    const first = await admin.rpc("claim_pending_email_deliveries", { p_limit: 1 });
    assert.equal(first.data[0].delivery_id, deliveryId);

    await expireLease(admin, deliveryId);

    const second = await admin.rpc("claim_pending_email_deliveries", { p_limit: 1 });
    assert.equal(second.data[0].delivery_id, deliveryId);

    const { data: rows, error } = await admin
      .from("notification_deliveries")
      .select("id")
      .eq("notification_id", notificationId);
    assert.equal(error, null, error?.message);
    // send-notification-email.ts uses this row's own id as the Resend
    // idempotency key; that guarantee only holds if a reclaim reuses the
    // same row instead of ever minting a second one for the same notification.
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, deliveryId);

    await admin.rpc("mark_email_delivery_result", {
      p_delivery_id: deliveryId,
      p_status: "sent",
      p_claimed_at: second.data[0].claimed_at,
    });
  });

  test("a direct update into status=sending without lease fields violates notification_deliveries_sending_requires_lease", async () => {
    const { deliveryId } = await createPendingDelivery(admin, fixtures, `${fixtures.runId}-ck-sending`);

    const { error } = await admin
      .from("notification_deliveries")
      .update({ status: "sending" })
      .eq("id", deliveryId);
    assert.ok(error);

    const row = await readDelivery(admin, deliveryId, "status, claimed_at, lease_expires_at");
    assert.equal(row.status, "pending");
    assert.equal(row.claimed_at, null);
    assert.equal(row.lease_expires_at, null);
  });

  test("a direct update with lease_expires_at <= claimed_at violates notification_deliveries_lease_expires_after_claimed", async () => {
    const { deliveryId } = await createPendingDelivery(admin, fixtures, `${fixtures.runId}-ck-order`);
    const now = new Date();
    const beforeNow = new Date(now.getTime() - 60 * 1000);

    const { error } = await admin
      .from("notification_deliveries")
      .update({ status: "sending", claimed_at: now.toISOString(), lease_expires_at: beforeNow.toISOString() })
      .eq("id", deliveryId);
    assert.ok(error);

    const row = await readDelivery(admin, deliveryId, "status");
    assert.equal(row.status, "pending");
  });

  test("a direct update to a terminal status that leaves lease fields set violates notification_deliveries_terminal_has_no_lease", async () => {
    const claimedAt = new Date();
    const leaseExpiresAt = new Date(Date.now() + LEASE_DURATION_MS);
    const { deliveryId, claimedAt: storedClaimedAt } = await createSendingDelivery(
      admin,
      fixtures,
      `${fixtures.runId}-ck-terminal`,
      { claimedAt, leaseExpiresAt, attemptCount: 1 },
    );

    const { error } = await admin
      .from("notification_deliveries")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", deliveryId);
    assert.ok(error);

    const row = await readDelivery(admin, deliveryId, "status, claimed_at, lease_expires_at");
    assert.equal(row.status, "sending");
    assert.equal(new Date(row.claimed_at).getTime(), claimedAt.getTime());
    assert.equal(new Date(row.lease_expires_at).getTime(), leaseExpiresAt.getTime());

    await admin.rpc("mark_email_delivery_result", {
      p_delivery_id: deliveryId,
      p_status: "sent",
      p_claimed_at: storedClaimedAt,
    });
  });
});
