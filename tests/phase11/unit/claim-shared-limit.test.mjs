// Statically verifies the shared-limit migration
// (20260907010000_fix_phase_11_claim_shared_limit.sql), which closes a
// confirmed over-claiming bug: claim_pending_email_deliveries() returned one
// row per branch instead of one row TOTAL when more claimable rows existed
// than p_limit.
//
// The behavioral proof lives in
// tests/phase11/integration/delivery-lease.test.mjs ("p_limit is one shared
// budget..."). These assertions guard the specific SQL construct that fixes
// it, so a future edit cannot silently reintroduce the re-evaluated SubPlan.

import assert from "node:assert/strict";
import test from "node:test";

import { readMigrationFile, sliceSql } from "../helpers/migration-test-helpers.mjs";

const CLAIM_IDENTITY_PATH = new URL(
  "../../../supabase/migrations/20260806030000_fix_phase_11_claim_identity.sql",
  import.meta.url,
);
const SHARED_LIMIT_PATH = new URL(
  "../../../supabase/migrations/20260907010000_fix_phase_11_claim_shared_limit.sql",
  import.meta.url,
);

async function readSharedLimitFix() {
  return readMigrationFile(SHARED_LIMIT_PATH);
}

// The migration header quotes the OLD, buggy form verbatim to document the
// root cause, so "must no longer contain X" assertions have to run against
// the executable body only — otherwise they match the explanatory comment.
async function readSharedLimitFunctionBody() {
  return sliceSql(await readSharedLimitFix(), "as $function$", "$function$;");
}

test("does not edit the already-applied claim-identity migration in place", async () => {
  const identityFix = await readMigrationFile(CLAIM_IDENTITY_PATH);
  // The prior file still carries the original `in (select ...)` form, proving
  // the fix ships as a new forward-only file rather than a retro-edit.
  assert.match(identityFix, /and delivery\.id in \(/);
  assert.doesNotMatch(identityFix, /as materialized/i);
});

test("the claimable selection is a CTE evaluated once, not an IN (select ...) SubPlan", async () => {
  const body = await readSharedLimitFunctionBody();

  // The whole fix: the row-locking selection must be hoisted into a CTE.
  assert.match(body, /with claimable as materialized \(/);
  // `as materialized` is load-bearing — an inlined CTE (the PG12+ default for
  // a single reference) would reproduce the per-outer-row re-evaluation.
  assert.match(body, /as materialized/);
  // The re-evaluated form must be gone entirely.
  assert.doesNotMatch(body, /delivery\.id in \(/);
  // The UPDATE joins the CTE by id rather than re-selecting.
  assert.match(body, /where delivery\.id = claimable\.id/);
});

test("exactly one shared limit governs both claim branches", async () => {
  const body = await readSharedLimitFix();
  const selection = sliceSql(body, "with claimable as materialized", "for update skip locked");

  // Both branches live in one WHERE, feeding one ORDER BY and one LIMIT.
  assert.match(selection, /candidate\.status = 'pending' and candidate\.next_attempt_at <= now\(\)/);
  assert.match(selection, /candidate\.status = 'sending' and candidate\.lease_expires_at <= now\(\)/);

  const limitClauses = body.match(/limit greatest\(1, least\(coalesce\(p_limit, 20\), 50\)\)/g);
  assert.equal(limitClauses?.length, 1, "expected exactly one shared limit clause");
});

test("concurrency, lease, and stale-worker semantics are preserved verbatim", async () => {
  const body = await readSharedLimitFix();

  // Concurrency: the row lock stays inside the (now single-evaluation) CTE.
  assert.match(body, /for update skip locked/);
  // Lease semantics.
  assert.match(body, /lease_expires_at = now\(\) \+ interval '10 minutes'/);
  assert.match(body, /claimed_at = now\(\)/);
  // Attempt cap and single increment.
  assert.match(body, /candidate\.attempt_count < 5/);
  const increments = body.match(/attempt_count = delivery\.attempt_count \+ 1/g);
  assert.equal(increments?.length, 1, "attempt_count must be incremented exactly once");
  // Stale-worker self-heal retained, still ahead of the selection.
  assert.match(body, /last_error_code = 'claim_lease_exhausted'/);
  assert.ok(
    body.indexOf("claim_lease_exhausted") < body.indexOf("with claimable as materialized"),
    "the exhaustion self-heal must still run before new claims are selected",
  );
  // Claim identity still returned for mark_email_delivery_result.
  assert.match(body, /delivery\.id, delivery\.claimed_at, delivery\.recipient_email/);
});

test("the function keeps its signature, hardening, and service_role-only grant", async () => {
  const body = await readSharedLimitFix();

  // Same signature and RETURNS TABLE shape, so a plain CREATE OR REPLACE is
  // correct here — no DROP, no second overload.
  assert.match(body, /create or replace function public\.claim_pending_email_deliveries\(/);
  assert.doesNotMatch(body, /drop function public\.claim_pending_email_deliveries/);
  assert.match(body, /security definer/);
  assert.match(body, /set search_path = ''/);
  assert.match(
    body,
    /revoke all on function public\.claim_pending_email_deliveries\(integer\)\s*\n\s*from public, anon, authenticated;/,
  );
  assert.match(
    body,
    /grant execute on function public\.claim_pending_email_deliveries\(integer\) to service_role;/,
  );
  assert.doesNotMatch(
    body,
    /grant execute on function public\.claim_pending_email_deliveries\(integer\) to authenticated;/,
  );
});

test("the migration refuses to run against an unprepared database", async () => {
  const body = await readSharedLimitFix();

  assert.match(body, /do \$preflight\$/);
  assert.match(body, /to_regprocedure\('public\.claim_pending_email_deliveries\(integer\)'\) is null/);
  assert.match(body, /column_name = 'claimed_at'/);
  assert.match(
    body,
    /to_regprocedure\('public\.mark_email_delivery_result\(uuid, text, timestamptz, text, text\)'\) is null/,
  );
});
