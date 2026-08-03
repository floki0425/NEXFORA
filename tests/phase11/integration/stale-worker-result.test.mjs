// Regression suite for the claim-identity fix
// (20260806030000_fix_phase_11_claim_identity.sql).
//
// Before that migration, mark_email_delivery_result identified its target by
// (id, status = 'sending') alone. That predicate can tell *that* a claim is in
// flight but not *which*, so a worker that stalled past its 10-minute lease
// could return long after its row had been reclaimed, re-failed, and claimed
// again — and its stale result would match the newest claim and overwrite it.
// Every test below fails against the pre-migration definition and passes
// against the post-migration one.
//
// Ordering determinism (same convention as delivery-lease.test.mjs): the
// outbox queue is global and unscoped by design, so every row this suite
// needs a claim to return is given a next_attempt_at far older than anything
// this application would ever legitimately produce. That makes it provably
// first in claim's `order by ... limit ...`, so a p_limit:1 call is
// deterministic with no sleeps, no retries, and no raised batch limit. This
// file runs under --test-concurrency=1 (package.json), so no other Phase 11
// integration file's claims interleave with it.

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

const MORE_ANCIENT_NEXT_ATTEMPT_AT = new Date("1999-01-01T00:00:00Z");
// Reclaim candidates are ordered by lease_expires_at, not next_attempt_at, so
// a superseded claim needs its own ordering sentinel — and it must be older
// than the pending sentinel above so a reclaim provably beats every pending
// row in the shared global queue too.
const ANCIENT_SUPERSEDED_CLAIMED_AT = new Date("1998-01-01T00:00:00Z");
const ANCIENT_SUPERSEDED_LEASE_EXPIRES_AT = new Date("1998-01-01T00:10:00Z");

const SETTLED_COLUMNS =
  "status, claimed_at, lease_expires_at, attempt_count, sent_at, provider_reference, last_error_code, next_attempt_at";

// Every delivery id this suite creates, so `after` can guarantee none is left
// claimable. This matters more here than in the other outbox suites: the
// sentinels above are the oldest in the repo, so a row this suite abandoned in
// 'sending' with an expired 1998 lease would be the globally-oldest reclaim
// candidate and would win the p_limit:1 slot that delivery-lease.test.mjs's
// own 1999/2000 sentinels expect to win — starving that suite rather than
// failing this one. Verified by deliberately injecting such a row: it fails
// delivery-lease's first test while every other suite still passes.
const createdDeliveryIds = [];

async function createDueDelivery(admin, fixtures, suffix) {
  const { data: notification, error: notificationError } = await admin
    .from("notifications")
    .insert({
      organization_id: fixtures.orgA.id,
      user_id: fixtures.users["admin-a"].profileId,
      event_type: "lead.created",
      title: `Stale worker test ${suffix}`,
      dedupe_key: `stale-${suffix}`,
    })
    .select("id")
    .single();
  if (notificationError || !notification) {
    throw new Error(`Failed to create notification fixture: ${notificationError?.message}`);
  }

  const { data: delivery, error } = await admin
    .from("notification_deliveries")
    .insert({
      notification_id: notification.id,
      recipient_email: `stale-${suffix}@example.com`,
      status: "pending",
      next_attempt_at: MORE_ANCIENT_NEXT_ATTEMPT_AT.toISOString(),
    })
    .select("id")
    .single();
  if (error || !delivery) {
    throw new Error(`Failed to create pending delivery fixture: ${error?.message}`);
  }

  createdDeliveryIds.push(delivery.id);
  return delivery.id;
}

// Force every row this suite created into a terminal state, whatever state a
// test left it in. Runs before the fixture teardown that would delete them
// anyway — belt and braces, so an assertion failure mid-test can never leave a
// globally-oldest claimable row behind for the next suite in the run.
async function retireCreatedDeliveries(admin) {
  if (createdDeliveryIds.length === 0) {
    return;
  }
  await admin
    .from("notification_deliveries")
    .update({
      status: "failed",
      last_error_code: "test_teardown",
      claimed_at: null,
      lease_expires_at: null,
    })
    .in("id", createdDeliveryIds)
    .neq("status", "sent");
  createdDeliveryIds.length = 0;
}

async function readDelivery(admin, deliveryId, columns = SETTLED_COLUMNS) {
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

// Claims exactly the target row and returns its claim identity. Asserts the
// claim actually returned the intended row rather than tolerating a miss:
// a miss means the ordering assumption above broke, which is a real failure
// to investigate, not something to retry around.
async function claimTargetRow(admin, deliveryId) {
  const { data, error } = await admin.rpc("claim_pending_email_deliveries", { p_limit: 1 });
  assert.equal(error, null, error?.message);
  assert.equal(data?.length, 1, "expected exactly one claimed row");
  assert.equal(
    data[0].delivery_id,
    deliveryId,
    "claim returned a different row than the ancient-next_attempt_at fixture this test created",
  );
  assert.ok(data[0].claimed_at, "claim must return the claim identity (claimed_at)");
  return data[0].claimed_at;
}

// Simulates a runner that claimed the row and then stalled past its lease.
//
// Backdates the WHOLE lease window, not just lease_expires_at. Expiring only
// lease_expires_at (to claimed_at + 1ms) leaves the reclaim ordering key at
// roughly "now", which is the newest possible value — so any older pending
// row anywhere in the shared, global, unscoped outbox wins claim's single
// p_limit:1 slot and the reclaim becomes non-deterministic. Backdating both
// columns keeps notification_deliveries_lease_expires_after_claimed satisfied
// and makes this row provably first in the reclaim branch's ordering.
//
// Returns the row's claimed_at afterwards: that is the identity the stalled
// worker is holding when it eventually reports back. Backdating changes the
// literal timestamp but not what the test proves — the assertion under test is
// that an identity which is no longer current cannot resolve the row, and an
// ancient one is simply a maximally distinguishable instance of that.
async function supersedeClaim(admin, deliveryId) {
  const { error } = await admin
    .from("notification_deliveries")
    .update({
      claimed_at: ANCIENT_SUPERSEDED_CLAIMED_AT.toISOString(),
      lease_expires_at: ANCIENT_SUPERSEDED_LEASE_EXPIRES_AT.toISOString(),
    })
    .eq("id", deliveryId)
    .eq("status", "sending");
  if (error) {
    throw new Error(`Failed to expire lease for delivery ${deliveryId}: ${error.message}`);
  }
  const { claimed_at: claimedAt } = await readDelivery(admin, deliveryId, "claimed_at");
  return claimedAt;
}

async function makeDueAgain(admin, deliveryId) {
  const { error } = await admin
    .from("notification_deliveries")
    .update({ next_attempt_at: MORE_ANCIENT_NEXT_ATTEMPT_AT.toISOString() })
    .eq("id", deliveryId)
    .eq("status", "pending");
  if (error) {
    throw new Error(`Failed to make delivery ${deliveryId} due again: ${error.message}`);
  }
}

// Drives a row to the exact state of the reported race: attempt 1 claimed and
// abandoned, attempt 2 reclaimed and failed, attempt 3 currently in flight.
// Returns both the superseded claim-1 identity and the live claim-3 identity.
async function driveToThirdClaim(admin, fixtures, suffix) {
  const deliveryId = await createDueDelivery(admin, fixtures, suffix);

  // 1. Worker A claims attempt 1 and then stalls.
  const realClaim1ClaimedAt = await claimTargetRow(admin, deliveryId);
  assert.equal((await readDelivery(admin, deliveryId)).attempt_count, 1);

  // 2. Worker A's lease expires while it is still stalled. This is the
  //    identity Worker A carries into step 7.
  const claim1ClaimedAt = await supersedeClaim(admin, deliveryId);
  assert.notEqual(claim1ClaimedAt, realClaim1ClaimedAt);

  // 3. Worker B reclaims the same row as attempt 2.
  const claim2ClaimedAt = await claimTargetRow(admin, deliveryId);
  assert.notEqual(claim2ClaimedAt, claim1ClaimedAt, "a reclaim must mint a new claim identity");
  assert.equal((await readDelivery(admin, deliveryId)).attempt_count, 2);

  // 4. Worker B reports failure, returning the row to 'pending'.
  const { error: markBError } = await admin.rpc("mark_email_delivery_result", {
    p_delivery_id: deliveryId,
    p_status: "failed",
    p_claimed_at: claim2ClaimedAt,
    p_error_code: "provider_error",
  });
  assert.equal(markBError, null, markBError?.message);
  assert.equal((await readDelivery(admin, deliveryId)).status, "pending");

  // 5. The backoff elapses.
  await makeDueAgain(admin, deliveryId);

  // 6. Worker C claims attempt 3. This is the claim a stale result must not
  //    be able to touch.
  const claim3ClaimedAt = await claimTargetRow(admin, deliveryId);
  assert.notEqual(claim3ClaimedAt, claim1ClaimedAt);
  const afterClaim3 = await readDelivery(admin, deliveryId);
  assert.equal(afterClaim3.status, "sending");
  assert.equal(afterClaim3.attempt_count, 3);

  return { deliveryId, claim1ClaimedAt, claim3ClaimedAt, afterClaim3 };
}

describe("Phase 11 claim identity: a stale worker can never resolve a newer claim", () => {
  if (!hasPhase8IntegrationEnv()) {
    test("Phase 11 stale-worker-result integration tests", (t) => {
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
    await retireCreatedDeliveries(admin);
    await cleanupPhase11Fixtures(admin, fixtures);
  });

  test("the full reported sequence: a stale attempt-1 result leaves attempt 3 completely untouched, and attempt 3 still settles normally", async () => {
    const { deliveryId, claim1ClaimedAt, claim3ClaimedAt, afterClaim3 } =
      await driveToThirdClaim(admin, fixtures, `${fixtures.runId}-full`);

    // 7. Worker A finally returns and submits its stale attempt-1 result.
    //    Pre-migration this matched (status was 'sending' again) and clobbered
    //    Worker C's live claim.
    const { error: staleError } = await admin.rpc("mark_email_delivery_result", {
      p_delivery_id: deliveryId,
      p_status: "failed",
      p_claimed_at: claim1ClaimedAt,
      p_error_code: "stale_worker_a",
    });
    // A stale result is a silent no-op, not an error: it is a legitimate
    // late arrival, not a caller bug.
    assert.equal(staleError, null, staleError?.message);

    // 8. The row is byte-for-byte what claim 3 left behind.
    const afterStale = await readDelivery(admin, deliveryId);
    assert.equal(afterStale.status, "sending");
    assert.equal(afterStale.claimed_at, claim3ClaimedAt);
    assert.equal(afterStale.claimed_at, afterClaim3.claimed_at);
    assert.equal(afterStale.lease_expires_at, afterClaim3.lease_expires_at);
    assert.equal(afterStale.attempt_count, 3);
    assert.equal(afterStale.attempt_count, afterClaim3.attempt_count);
    assert.equal(afterStale.sent_at, afterClaim3.sent_at);
    assert.equal(afterStale.provider_reference, afterClaim3.provider_reference);
    assert.equal(afterStale.last_error_code, afterClaim3.last_error_code);
    assert.notEqual(afterStale.last_error_code, "stale_worker_a");
    assert.equal(afterStale.next_attempt_at, afterClaim3.next_attempt_at);

    // 9. Worker C's own result still settles the row normally.
    const { error: liveError } = await admin.rpc("mark_email_delivery_result", {
      p_delivery_id: deliveryId,
      p_status: "sent",
      p_claimed_at: claim3ClaimedAt,
    });
    assert.equal(liveError, null, liveError?.message);

    const settled = await readDelivery(admin, deliveryId);
    assert.equal(settled.status, "sent");
    assert.ok(settled.sent_at);
    assert.equal(settled.claimed_at, null);
    assert.equal(settled.lease_expires_at, null);
    assert.equal(settled.attempt_count, 3);
  });

  test("a stale SUCCESS result is a no-op: it cannot mark a newer claim sent", async () => {
    const { deliveryId, claim1ClaimedAt, claim3ClaimedAt, afterClaim3 } =
      await driveToThirdClaim(admin, fixtures, `${fixtures.runId}-stale-sent`);

    const { error } = await admin.rpc("mark_email_delivery_result", {
      p_delivery_id: deliveryId,
      p_status: "sent",
      p_claimed_at: claim1ClaimedAt,
      p_provider_reference: "stale-worker-a-provider-ref",
    });
    assert.equal(error, null, error?.message);

    const row = await readDelivery(admin, deliveryId);
    // The worst pre-migration outcome: the row goes terminal 'sent' from a
    // stale attempt while the live attempt may still fail, permanently and
    // silently losing the notification.
    assert.equal(row.status, "sending");
    assert.equal(row.sent_at, null);
    assert.equal(row.provider_reference, null);
    assert.notEqual(row.provider_reference, "stale-worker-a-provider-ref");
    assert.equal(row.claimed_at, claim3ClaimedAt);
    assert.equal(row.lease_expires_at, afterClaim3.lease_expires_at);
    assert.equal(row.attempt_count, 3);

    await admin.rpc("mark_email_delivery_result", {
      p_delivery_id: deliveryId,
      p_status: "sent",
      p_claimed_at: claim3ClaimedAt,
    });
  });

  test("a stale FAILURE result is a no-op: it cannot clear a newer lease, revert it to pending, or reschedule a retry", async () => {
    const { deliveryId, claim1ClaimedAt, claim3ClaimedAt, afterClaim3 } =
      await driveToThirdClaim(admin, fixtures, `${fixtures.runId}-stale-failed`);

    const { error } = await admin.rpc("mark_email_delivery_result", {
      p_delivery_id: deliveryId,
      p_status: "failed",
      p_claimed_at: claim1ClaimedAt,
      p_error_code: "stale_worker_a",
    });
    assert.equal(error, null, error?.message);

    const row = await readDelivery(admin, deliveryId);
    // Pre-migration this reverted a live 'sending' row to 'pending', cleared
    // the live lease, and scheduled another retry — so an email the live
    // worker was in the middle of sending would be sent a second time.
    assert.equal(row.status, "sending");
    assert.equal(row.claimed_at, claim3ClaimedAt);
    assert.equal(row.lease_expires_at, afterClaim3.lease_expires_at);
    assert.equal(row.next_attempt_at, afterClaim3.next_attempt_at);
    assert.equal(row.last_error_code, afterClaim3.last_error_code);
    assert.notEqual(row.last_error_code, "stale_worker_a");
    assert.equal(row.attempt_count, 3);

    await admin.rpc("mark_email_delivery_result", {
      p_delivery_id: deliveryId,
      p_status: "sent",
      p_claimed_at: claim3ClaimedAt,
    });
  });

  test("only the exact current claim identity can resolve the row — a near-miss timestamp cannot", async () => {
    const deliveryId = await createDueDelivery(admin, fixtures, `${fixtures.runId}-near-miss`);
    const claimedAt = await claimTargetRow(admin, deliveryId);

    // One millisecond either side of the real claim identity, and the exact
    // value: only the exact value may settle the row.
    const oneMsLater = new Date(new Date(claimedAt).getTime() + 1).toISOString();
    const oneMsEarlier = new Date(new Date(claimedAt).getTime() - 1).toISOString();

    for (const wrongIdentity of [oneMsLater, oneMsEarlier]) {
      const { error } = await admin.rpc("mark_email_delivery_result", {
        p_delivery_id: deliveryId,
        p_status: "sent",
        p_claimed_at: wrongIdentity,
      });
      assert.equal(error, null, error?.message);
      const row = await readDelivery(admin, deliveryId);
      assert.equal(row.status, "sending", `identity ${wrongIdentity} must not settle the row`);
      assert.equal(row.sent_at, null);
    }

    const { error: exactError } = await admin.rpc("mark_email_delivery_result", {
      p_delivery_id: deliveryId,
      p_status: "sent",
      p_claimed_at: claimedAt,
    });
    assert.equal(exactError, null, exactError?.message);
    const settled = await readDelivery(admin, deliveryId);
    assert.equal(settled.status, "sent");
    assert.ok(settled.sent_at);
  });

  test("a null claim identity is rejected outright rather than silently resolving nothing", async () => {
    const deliveryId = await createDueDelivery(admin, fixtures, `${fixtures.runId}-null-identity`);
    const claimedAt = await claimTargetRow(admin, deliveryId);

    const { error } = await admin.rpc("mark_email_delivery_result", {
      p_delivery_id: deliveryId,
      p_status: "sent",
      p_claimed_at: null,
    });
    // Distinguishes a caller bug (forgot to thread claimed_at through) from a
    // legitimate stale result, which no-ops silently.
    assert.ok(error, "a null p_claimed_at must raise, not silently no-op");

    const row = await readDelivery(admin, deliveryId);
    assert.equal(row.status, "sending");

    await admin.rpc("mark_email_delivery_result", {
      p_delivery_id: deliveryId,
      p_status: "sent",
      p_claimed_at: claimedAt,
    });
  });

  test("the legacy 4-argument mark_email_delivery_result signature no longer exists", async () => {
    // The pre-migration identity took (uuid, text, text, text). If DROP had
    // been skipped, adding p_claimed_at would have created a second overload
    // and left this one callable — and still able to accept a stale result.
    const legacyCalls = [
      { p_delivery_id: "00000000-0000-4000-8000-000000000000", p_status: "sent" },
      {
        p_delivery_id: "00000000-0000-4000-8000-000000000000",
        p_status: "failed",
        p_error_code: "legacy",
      },
      {
        p_delivery_id: "00000000-0000-4000-8000-000000000000",
        p_status: "sent",
        p_error_code: "legacy",
        p_provider_reference: "legacy",
      },
    ];

    for (const args of legacyCalls) {
      const { error } = await admin.rpc("mark_email_delivery_result", args);
      assert.ok(
        error,
        `legacy signature ${JSON.stringify(Object.keys(args))} must not be resolvable`,
      );
      // PGRST202 == no function matches the requested name/arguments.
      assert.equal(error.code, "PGRST202", `expected function-not-found, got ${error.code}`);
    }
  });

  test("neither delivery RPC is executable by anon or by an authenticated internal member", async () => {
    const anon = createTestAnonClient();
    const member = await signInTestUser(
      fixtures.users["admin-a"].email,
      fixtures.users["admin-a"].password,
    );

    for (const [label, client] of [
      ["anon", anon],
      ["authenticated", member],
    ]) {
      const claimResult = await client.rpc("claim_pending_email_deliveries", { p_limit: 1 });
      assert.ok(claimResult.error, `${label} must not execute claim_pending_email_deliveries`);

      const markResult = await client.rpc("mark_email_delivery_result", {
        p_delivery_id: "00000000-0000-4000-8000-000000000000",
        p_status: "sent",
        p_claimed_at: new Date().toISOString(),
      });
      assert.ok(markResult.error, `${label} must not execute mark_email_delivery_result`);
    }
  });
});
