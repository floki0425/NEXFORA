// Statically verifies the claim-identity migration
// (20260806030000_fix_phase_11_claim_identity.sql), which closes the H1
// finding: mark_email_delivery_result identified its target by
// (id, status = 'sending') alone, which cannot distinguish WHICH claim is in
// flight, so a stalled worker's result could overwrite a newer claim.

import assert from "node:assert/strict";
import test from "node:test";

import { readMigrationFile, sliceSql } from "../helpers/migration-test-helpers.mjs";

const BASE_PATH = new URL(
  "../../../supabase/migrations/20260806000000_phase_11_notifications_audit.sql",
  import.meta.url,
);
const ATOMICITY_FIX_PATH = new URL(
  "../../../supabase/migrations/20260806010000_fix_phase_11_event_atomicity.sql",
  import.meta.url,
);
const LEASE_FIX_PATH = new URL(
  "../../../supabase/migrations/20260806020000_fix_phase_11_delivery_lease.sql",
  import.meta.url,
);
const CLAIM_IDENTITY_PATH = new URL(
  "../../../supabase/migrations/20260806030000_fix_phase_11_claim_identity.sql",
  import.meta.url,
);

async function readClaimIdentityFix() {
  return readMigrationFile(CLAIM_IDENTITY_PATH);
}

test("does not modify any of the three already-applied Phase 11 migrations", async () => {
  const base = await readMigrationFile(BASE_PATH);
  const atomicityFix = await readMigrationFile(ATOMICITY_FIX_PATH);
  const leaseFix = await readMigrationFile(LEASE_FIX_PATH);

  // All three are applied to TEST and are forward-only from here. Each must
  // still contain its own original definitions, proving this migration adds a
  // new file rather than editing an applied one in place.
  assert.match(base, /set status = 'sending'\s*\n\s*from public\.notifications as notification/);
  assert.doesNotMatch(base, /p_claimed_at/);
  assert.doesNotMatch(atomicityFix, /p_claimed_at/);

  // The lease fix keeps its own `create or replace` pair and never learned
  // about the claim identity.
  assert.match(leaseFix, /create or replace function public\.claim_pending_email_deliveries/);
  assert.match(leaseFix, /create or replace function public\.mark_email_delivery_result/);
  assert.doesNotMatch(leaseFix, /p_claimed_at/);
  assert.doesNotMatch(leaseFix, /drop function/);
});

test("preflight requires the base and lease migrations and refuses to run twice", async () => {
  const preflight = sliceSql(await readClaimIdentityFix(), "do $preflight$", "$preflight$;");

  assert.match(preflight, /to_regclass\('public\.notification_deliveries'\) is null/);
  assert.match(
    preflight,
    /to_regprocedure\('public\.claim_pending_email_deliveries\(integer\)'\) is null/,
  );
  assert.match(
    preflight,
    /to_regprocedure\('public\.mark_email_delivery_result\(uuid, text, text, text\)'\) is null/,
  );
  // The claim identity is stored in the lease migration's claimed_at column,
  // so that migration is a hard prerequisite.
  assert.match(preflight, /column_name = 'claimed_at'/);
  // Re-running must abort rather than double-drop.
  assert.match(
    preflight,
    /to_regprocedure\('public\.mark_email_delivery_result\(uuid, text, timestamptz, text, text\)'\) is not null/,
  );
});

test("both old function identities are explicitly dropped, not replaced", async () => {
  const migration = await readClaimIdentityFix();

  // claim: RETURNS TABLE gains claimed_at, and CREATE OR REPLACE cannot
  // change a function's return type.
  assert.match(migration, /drop function public\.claim_pending_email_deliveries\(integer\);/);
  // mark: adding a parameter creates a SECOND overload rather than replacing
  // the first, so the old identity must be dropped or it stays callable and
  // still accepts stale results.
  assert.match(
    migration,
    /drop function public\.mark_email_delivery_result\(uuid, text, text, text\);/,
  );
  // Neither may be written as `create or replace` — that is exactly the
  // mistake this migration exists to avoid.
  assert.doesNotMatch(
    migration,
    /create or replace function public\.claim_pending_email_deliveries/,
  );
  assert.doesNotMatch(migration, /create or replace function public\.mark_email_delivery_result/);
  assert.match(migration, /create function public\.claim_pending_email_deliveries\(/);
  assert.match(migration, /create function public\.mark_email_delivery_result\(/);
});

test("the drop of the legacy mark identity precedes the create of the new one", async () => {
  const migration = await readClaimIdentityFix();
  const dropIndex = migration.indexOf(
    "drop function public.mark_email_delivery_result(uuid, text, text, text);",
  );
  const createIndex = migration.indexOf("create function public.mark_email_delivery_result(");
  assert.ok(dropIndex > -1 && createIndex > -1);
  assert.ok(
    dropIndex < createIndex,
    "the legacy identity must be gone before the new one is created",
  );
});

function claimFunctionBody(migration) {
  return sliceSql(
    migration,
    "create function public.claim_pending_email_deliveries(",
    "revoke all on function public.claim_pending_email_deliveries(integer)",
  );
}

test("claim_pending_email_deliveries returns claimed_at as the claim identity", async () => {
  const body = claimFunctionBody(await readClaimIdentityFix());

  assert.match(body, /returns table \(\s*\n\s*delivery_id uuid,\s*\n\s*claimed_at timestamptz,/);
  assert.match(body, /delivery\.id, delivery\.claimed_at, delivery\.recipient_email/);
});

test("claim_pending_email_deliveries preserves every guarantee established by the lease migration", async () => {
  const body = claimFunctionBody(await readClaimIdentityFix());

  // Self-healing retirement of expired, attempt-exhausted rows, still ahead
  // of the claim itself.
  assert.match(body, /last_error_code = 'claim_lease_exhausted'/);
  assert.match(
    body,
    /where status = 'sending'\s*\n\s*and lease_expires_at <= now\(\)\s*\n\s*and attempt_count >= 5;/,
  );
  assert.ok(body.indexOf("claim_lease_exhausted") < body.indexOf("return query"));

  // 10-minute lease, single increment per claim, five-attempt cap, both
  // claim branches, and SKIP LOCKED.
  assert.match(body, /lease_expires_at = now\(\) \+ interval '10 minutes',/);
  assert.match(body, /attempt_count = delivery\.attempt_count \+ 1/);
  assert.match(body, /where claimable\.attempt_count < 5/);
  assert.match(body, /\(claimable\.status = 'pending' and claimable\.next_attempt_at <= now\(\)\)/);
  assert.match(body, /\(claimable\.status = 'sending' and claimable\.lease_expires_at <= now\(\)\)/);
  assert.match(body, /for update skip locked/);
  assert.match(body, /limit greatest\(1, least\(coalesce\(p_limit, 20\), 50\)\)/);
});

function markFunctionBody(migration) {
  return sliceSql(
    migration,
    "create function public.mark_email_delivery_result(",
    "revoke all on function public.mark_email_delivery_result(uuid, text, timestamptz, text, text)",
  );
}

test("mark_email_delivery_result takes p_claimed_at as a REQUIRED parameter", async () => {
  const body = markFunctionBody(await readClaimIdentityFix());

  assert.match(body, /p_claimed_at timestamptz,/);
  // No default: PostgreSQL requires every parameter after a defaulted one to
  // also have a default, which is why it precedes p_error_code.
  assert.doesNotMatch(body, /p_claimed_at timestamptz default/);
  const signature = sliceSql(body, "create function public.mark_email_delivery_result(", ")\nreturns void");
  assert.ok(
    signature.indexOf("p_claimed_at") < signature.indexOf("p_error_code"),
    "p_claimed_at must precede the defaulted parameters",
  );
  // A null identity is a caller bug and must raise rather than no-op.
  assert.match(body, /if p_claimed_at is null then/);
  assert.match(body, /raise exception/);
});

test("every statement in mark_email_delivery_result compare-and-sets on all three predicates", async () => {
  const body = markFunctionBody(await readClaimIdentityFix());

  const guard = /where id = p_delivery_id\s*\n\s*and status = 'sending'\s*\n\s*and claimed_at = p_claimed_at;/g;
  const guards = body.match(guard) ?? [];
  // Exactly two data statements remain: the sent UPDATE and the failure
  // UPDATE. Both must carry the full guard.
  assert.equal(guards.length, 2, `expected 2 fully-guarded statements, found ${guards.length}`);

  // No statement may target the row by id alone — that was the pre-migration
  // failure-path bug, where the final UPDATE used `where id = p_delivery_id`
  // with no status or identity predicate at all.
  assert.doesNotMatch(body, /where id = p_delivery_id;/);
  assert.doesNotMatch(body, /where id = p_delivery_id\s*\n\s*and status = 'sending';/);
});

test("mark_email_delivery_result's sent path clears the lease and records the provider reference", async () => {
  const body = markFunctionBody(await readClaimIdentityFix());
  const sentBranch = sliceSql(body, "if p_status = 'sent' then", "return;\n  end if;");

  assert.match(sentBranch, /status = 'sent',/);
  assert.match(sentBranch, /sent_at = now\(\),/);
  assert.match(sentBranch, /provider_reference = p_provider_reference,/);
  assert.match(sentBranch, /claimed_at = null,/);
  assert.match(sentBranch, /lease_expires_at = null/);
  assert.match(sentBranch, /and claimed_at = p_claimed_at;/);
});

test("mark_email_delivery_result's failure path keeps the 5-step backoff and never increments attempt_count", async () => {
  const body = markFunctionBody(await readClaimIdentityFix());
  const failureUpdate = sliceSql(
    body,
    "update public.notification_deliveries\n  set\n    last_error_code",
    "and claimed_at = p_claimed_at;",
  );

  assert.match(failureUpdate, /status = case when attempt_count >= 5 then 'failed' else 'pending' end,/);
  assert.match(failureUpdate, /claimed_at = null,/);
  assert.match(failureUpdate, /lease_expires_at = null,/);
  assert.match(failureUpdate, /when attempt_count >= 5 then next_attempt_at/);
  assert.match(failureUpdate, /when attempt_count = 1 then now\(\) \+ interval '1 minute'/);
  assert.match(failureUpdate, /when attempt_count = 2 then now\(\) \+ interval '5 minutes'/);
  assert.match(failureUpdate, /when attempt_count = 3 then now\(\) \+ interval '30 minutes'/);
  assert.match(failureUpdate, /when attempt_count = 4 then now\(\) \+ interval '2 hours'/);
  assert.match(failureUpdate, /else now\(\) \+ interval '6 hours'/);

  // attempt_count is owned by claim and only by claim.
  assert.doesNotMatch(failureUpdate, /attempt_count = attempt_count \+ 1/);
  assert.doesNotMatch(body, /select attempt_count \+ 1/);
  // The read-then-write pair is gone entirely: the guard now applies
  // atomically to the write itself.
  assert.doesNotMatch(body, /into current_attempt_count/);
});

test("both new identities stay SECURITY DEFINER, search_path='', and service_role-only", async () => {
  const migration = await readClaimIdentityFix();

  for (const body of [claimFunctionBody(migration), markFunctionBody(migration)]) {
    assert.match(body, /language plpgsql\s*\nsecurity definer\s*\nset search_path = ''\s*\nas \$function\$/);
  }

  assert.match(
    migration,
    /revoke all on function public\.claim_pending_email_deliveries\(integer\)\s*\n\s*from public, anon, authenticated;/,
  );
  assert.match(
    migration,
    /grant execute on function public\.claim_pending_email_deliveries\(integer\) to service_role;/,
  );
  assert.match(
    migration,
    /revoke all on function public\.mark_email_delivery_result\(uuid, text, timestamptz, text, text\)\s*\n\s*from public, anon, authenticated;/,
  );
  assert.match(
    migration,
    /grant execute on function public\.mark_email_delivery_result\(uuid, text, timestamptz, text, text\)\s*\n\s*to service_role;/,
  );
  assert.doesNotMatch(migration, /grant execute on function public\.claim_pending_email_deliveries\(integer\) to authenticated;/);
  assert.doesNotMatch(migration, /to authenticated;/);
});

test("a postcheck asserts exactly one identity per RPC and that the legacy signature is gone", async () => {
  const postcheck = sliceSql(await readClaimIdentityFix(), "do $postcheck$", "$postcheck$;");

  assert.match(postcheck, /p\.proname = 'claim_pending_email_deliveries'/);
  assert.match(postcheck, /p\.proname = 'mark_email_delivery_result'/);
  assert.match(postcheck, /if claim_identities <> 1 then/);
  assert.match(postcheck, /if mark_identities <> 1 then/);
  assert.match(
    postcheck,
    /to_regprocedure\('public\.mark_email_delivery_result\(uuid, text, text, text\)'\) is not null/,
  );
});

test("the PostgREST schema cache is reloaded so the dropped overload stops resolving", async () => {
  assert.match(await readClaimIdentityFix(), /notify pgrst, 'reload schema';/);
});
