// Statically verifies the bounded delivery-lease migration
// (20260806020000_fix_phase_11_delivery_lease.sql), which closes a confirmed
// production gap: claim_pending_email_deliveries() never revisited a row
// once it moved to 'sending', so a runner that crashed or timed out left
// that row stuck forever (confirmed live on TEST as 21 orphaned rows).

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { sliceSql } from "../helpers/migration-test-helpers.mjs";

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

async function readLeaseFix() {
  return readFile(LEASE_FIX_PATH, "utf8");
}

test("does not modify the base Phase 11 migration or the event-atomicity follow-up", async () => {
  const base = await readFile(BASE_PATH, "utf8");
  const atomicityFix = await readFile(ATOMICITY_FIX_PATH, "utf8");
  // Both prior files still contain their original claim/mark definitions —
  // proving the lease fix replaces them via `create or replace` in a new
  // file rather than editing either already-applied migration in place.
  assert.match(base, /set status = 'sending'\s*\n\s*from public\.notifications as notification/);
  assert.doesNotMatch(base, /claimed_at = now\(\)/);
  assert.doesNotMatch(atomicityFix, /create or replace function public\.claim_pending_email_deliveries/);
  assert.doesNotMatch(atomicityFix, /create or replace function public\.mark_email_delivery_result/);
});

test("preflight aborts if the base migration is missing, and aborts if run twice", async () => {
  const migration = await readLeaseFix();
  const preflight = sliceSql(migration, "do $preflight$", "$preflight$;");
  assert.match(preflight, /to_regclass\('public\.notification_deliveries'\) is null/);
  assert.match(
    preflight,
    /to_regprocedure\('public\.claim_pending_email_deliveries\(integer\)'\) is null/,
  );
  assert.match(
    preflight,
    /to_regprocedure\('public\.mark_email_delivery_result\(uuid, text, text, text\)'\) is null/,
  );
  assert.match(
    preflight,
    /column_name in \('claimed_at', 'lease_expires_at'\)/,
  );
});

test("adds claimed_at and lease_expires_at as nullable timestamptz columns", async () => {
  const migration = await readLeaseFix();
  const schemaBlock = sliceSql(
    migration,
    "alter table public.notification_deliveries\n  add column claimed_at",
    "create index notification_deliveries_expired_lease_idx",
  );
  assert.match(schemaBlock, /add column claimed_at timestamptz,\s*\n\s*add column lease_expires_at timestamptz;/);
  // Neither column declares `not null` — both must default to null so a
  // freshly inserted pending row satisfies the pending-has-no-lease
  // constraint without the insert needing to name them explicitly.
  assert.doesNotMatch(schemaBlock, /claimed_at timestamptz not null/);
  assert.doesNotMatch(schemaBlock, /lease_expires_at timestamptz not null/);
});

test("four CHECK constraints fully define lease-field presence for every status value", async () => {
  const migration = await readLeaseFix();

  assert.match(
    migration,
    /add constraint notification_deliveries_pending_has_no_lease\s*\n\s*check \(status <> 'pending' or \(claimed_at is null and lease_expires_at is null\)\);/,
  );
  assert.match(
    migration,
    /add constraint notification_deliveries_sending_requires_lease\s*\n\s*check \(status <> 'sending' or \(claimed_at is not null and lease_expires_at is not null\)\);/,
  );
  assert.match(
    migration,
    /add constraint notification_deliveries_terminal_has_no_lease\s*\n\s*check \(status not in \('sent', 'failed'\) or \(claimed_at is null and lease_expires_at is null\)\);/,
  );
  assert.match(
    migration,
    /add constraint notification_deliveries_lease_expires_after_claimed\s*\n\s*check \(lease_expires_at is null or claimed_at is null or lease_expires_at > claimed_at\);/,
  );
});

test("adds a partial index on lease_expires_at scoped to status='sending'", async () => {
  const migration = await readLeaseFix();
  assert.match(
    migration,
    /create index notification_deliveries_expired_lease_idx\s*\n\s*on public\.notification_deliveries \(lease_expires_at\)\s*\n\s*where status = 'sending';/,
  );
});

function claimFunctionBody(migration) {
  return sliceSql(
    migration,
    "create or replace function public.claim_pending_email_deliveries(",
    "revoke all on function public.claim_pending_email_deliveries(integer)",
  );
}

test("claim_pending_email_deliveries retires expired, attempt-exhausted sending rows before selecting new claims", async () => {
  const migration = await readLeaseFix();
  const body = claimFunctionBody(migration);
  const cleanup = sliceSql(body, "update public.notification_deliveries\n  set\n    status = 'failed'", "return query");

  assert.match(cleanup, /status = 'failed'/);
  assert.match(cleanup, /last_error_code = 'claim_lease_exhausted'/);
  assert.match(cleanup, /claimed_at = null/);
  assert.match(cleanup, /lease_expires_at = null/);
  assert.match(cleanup, /where status = 'sending'\s*\n\s*and lease_expires_at <= now\(\)\s*\n\s*and attempt_count >= 5;/);
  // Runs before the claim SELECT, not after — the cleanup index in the file
  // must precede "return query".
  assert.ok(body.indexOf(cleanup) < body.indexOf("return query"));
});

test("claim_pending_email_deliveries selects both fresh-pending and expired-sending rows, excludes attempt_count>=5, and preserves FOR UPDATE SKIP LOCKED", async () => {
  const migration = await readLeaseFix();
  const body = claimFunctionBody(migration);
  const selection = sliceSql(body, "select claimable.id", "for update skip locked");

  assert.match(selection, /where claimable\.attempt_count < 5/);
  assert.match(
    selection,
    /\(claimable\.status = 'pending' and claimable\.next_attempt_at <= now\(\)\)/,
  );
  assert.match(
    selection,
    /\(claimable\.status = 'sending' and claimable\.lease_expires_at <= now\(\)\)/,
  );
  assert.match(body, /for update skip locked/);
  // p_limit is still clamped the same way as before this migration.
  assert.match(body, /limit greatest\(1, least\(coalesce\(p_limit, 20\), 50\)\)/);
});

test("claim_pending_email_deliveries stamps a 10-minute lease and increments attempt_count exactly once per claim", async () => {
  const migration = await readLeaseFix();
  const body = claimFunctionBody(migration);
  const setClause = sliceSql(body, "update public.notification_deliveries as delivery\n    set", "from public.notifications");

  assert.match(setClause, /status = 'sending',/);
  assert.match(setClause, /claimed_at = now\(\),/);
  assert.match(setClause, /lease_expires_at = now\(\) \+ interval '10 minutes',/);
  assert.match(setClause, /attempt_count = delivery\.attempt_count \+ 1/);
});

test("claim_pending_email_deliveries stays SECURITY DEFINER, search_path='', and service_role-only", async () => {
  const migration = await readLeaseFix();
  const body = claimFunctionBody(migration);
  assert.match(body, /language plpgsql\s*\nsecurity definer\s*\nset search_path = ''\s*\nas \$function\$/);

  assert.match(
    migration,
    /revoke all on function public\.claim_pending_email_deliveries\(integer\)\s*\n\s*from public, anon, authenticated;/,
  );
  assert.match(
    migration,
    /grant execute on function public\.claim_pending_email_deliveries\(integer\) to service_role;/,
  );
  assert.doesNotMatch(
    migration,
    /grant execute on function public\.claim_pending_email_deliveries\(integer\) to authenticated;/,
  );
});

function markFunctionBody(migration) {
  return sliceSql(
    migration,
    "create or replace function public.mark_email_delivery_result(",
    "revoke all on function public.mark_email_delivery_result(uuid, text, text, text)",
  );
}

test("mark_email_delivery_result's sent path clears the claim lease", async () => {
  const migration = await readLeaseFix();
  const body = markFunctionBody(migration);
  const sentBranch = sliceSql(body, "if p_status = 'sent' then", "return;\n  end if;");

  assert.match(sentBranch, /status = 'sent',/);
  assert.match(sentBranch, /sent_at = now\(\),/);
  assert.match(sentBranch, /claimed_at = null,/);
  assert.match(sentBranch, /lease_expires_at = null/);
  assert.match(sentBranch, /where id = p_delivery_id\s*\n\s*and status = 'sending';/);
});

test("mark_email_delivery_result's failure path reads attempt_count but never increments it", async () => {
  const migration = await readLeaseFix();
  const body = markFunctionBody(migration);

  assert.match(
    body,
    /select attempt_count\s*\n\s*into current_attempt_count\s*\n\s*from public\.notification_deliveries\s*\n\s*where id = p_delivery_id\s*\n\s*and status = 'sending';/,
  );
  // The old base definition read `attempt_count + 1` here; the lease fix
  // must not carry that increment forward, since claim now owns it.
  assert.doesNotMatch(body, /select attempt_count \+ 1/);

  const failureUpdate = sliceSql(body, "update public.notification_deliveries\n  set\n    last_error_code", "where id = p_delivery_id;");
  assert.doesNotMatch(failureUpdate, /attempt_count = attempt_count \+ 1/);
  assert.doesNotMatch(failureUpdate, /attempt_count,/);
});

test("mark_email_delivery_result's failure path preserves the existing 5-step backoff schedule and clears the lease on every branch", async () => {
  const migration = await readLeaseFix();
  const body = markFunctionBody(migration);
  const failureUpdate = sliceSql(body, "update public.notification_deliveries\n  set\n    last_error_code", "where id = p_delivery_id;");

  assert.match(failureUpdate, /status = case when current_attempt_count >= 5 then 'failed' else 'pending' end,/);
  assert.match(failureUpdate, /claimed_at = null,/);
  assert.match(failureUpdate, /lease_expires_at = null,/);
  assert.match(failureUpdate, /when current_attempt_count >= 5 then next_attempt_at/);
  assert.match(failureUpdate, /when current_attempt_count = 1 then now\(\) \+ interval '1 minute'/);
  assert.match(failureUpdate, /when current_attempt_count = 2 then now\(\) \+ interval '5 minutes'/);
  assert.match(failureUpdate, /when current_attempt_count = 3 then now\(\) \+ interval '30 minutes'/);
  assert.match(failureUpdate, /when current_attempt_count = 4 then now\(\) \+ interval '2 hours'/);
  assert.match(failureUpdate, /else now\(\) \+ interval '6 hours'/);
});

test("mark_email_delivery_result stays SECURITY DEFINER, search_path='', and service_role-only", async () => {
  const migration = await readLeaseFix();
  const body = markFunctionBody(migration);
  assert.match(body, /language plpgsql\s*\nsecurity definer\s*\nset search_path = ''\s*\nas \$function\$/);

  assert.match(
    migration,
    /revoke all on function public\.mark_email_delivery_result\(uuid, text, text, text\)\s*\n\s*from public, anon, authenticated;/,
  );
  assert.match(
    migration,
    /grant execute on function public\.mark_email_delivery_result\(uuid, text, text, text\)\s*\n\s*to service_role;/,
  );
  assert.doesNotMatch(
    migration,
    /grant execute on function public\.mark_email_delivery_result\(uuid, text, text, text\)\s*\n\s*to authenticated;/,
  );
});
