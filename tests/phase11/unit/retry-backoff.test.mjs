import assert from "node:assert/strict";
import test from "node:test";

import { readMigration, sliceSql } from "../helpers/migration-test-helpers.mjs";

test("mark_email_delivery_result backs off 1m, 5m, 30m, 2h, 6h for attempts 1-5", async () => {
  const migration = await readMigration();
  const body = sliceSql(
    migration,
    "create or replace function public.mark_email_delivery_result(",
    "revoke all on function public.mark_email_delivery_result(",
  );

  assert.match(body, /when 1 then now\(\) \+ interval '1 minute'/);
  assert.match(body, /when 2 then now\(\) \+ interval '5 minutes'/);
  assert.match(body, /when 3 then now\(\) \+ interval '30 minutes'/);
  assert.match(body, /when 4 then now\(\) \+ interval '2 hours'/);
  assert.match(body, /else now\(\) \+ interval '6 hours'/);
});

test("attempt_count 5 (or more) sets status to failed instead of retrying", async () => {
  const migration = await readMigration();
  const body = sliceSql(
    migration,
    "create or replace function public.mark_email_delivery_result(",
    "revoke all on function public.mark_email_delivery_result(",
  );

  assert.match(
    body,
    /status = case when current_attempt_count >= 5 then 'failed' else 'pending' end/,
  );
});

test("notification_deliveries.attempt_count is capped at 5 by a check constraint (defense in depth beyond the function logic)", async () => {
  const migration = await readMigration();
  assert.match(
    migration,
    /constraint notification_deliveries_attempt_count_range\s*\n\s*check \(attempt_count >= 0 and attempt_count <= 5\)/,
  );
});

test("only 'sent' and 'failed' are settleable outcomes; any other p_status is rejected", async () => {
  const migration = await readMigration();
  const body = sliceSql(
    migration,
    "create or replace function public.mark_email_delivery_result(",
    "revoke all on function public.mark_email_delivery_result(",
  );

  assert.match(body, /if p_status not in \('sent', 'failed'\) then/);
  assert.match(body, /raise exception/);
});

test("a delivery marked sent always has sent_at set (schema-level invariant)", async () => {
  const migration = await readMigration();
  assert.match(
    migration,
    /constraint deliveries_sent_at_required\s*\n\s*check \(\(status = 'sent'\) = \(sent_at is not null\)\)/,
  );
});

test("failed is terminal: once status='failed', mark_email_delivery_result's own WHERE clauses never select it again", async () => {
  const migration = await readMigration();
  const body = sliceSql(
    migration,
    "create or replace function public.mark_email_delivery_result(",
    "revoke all on function public.mark_email_delivery_result(",
  );

  // Both the "sent" branch and the failure-counting SELECT only ever
  // operate on rows with status = 'sending' (i.e. rows a claim already
  // picked up) — a row already at status='failed' can never be reached by
  // either path, so it can never be retried again.
  const sentBranch = sliceSql(body, "if p_status = 'sent' then", "return;\n  end if;");
  assert.match(sentBranch, /and status = 'sending';/);

  const countSelect = sliceSql(body, "select attempt_count + 1", "if not found then");
  assert.match(countSelect, /and status = 'sending';/);
});

// claim_pending_email_deliveries only ever selects status = 'pending' rows,
// which independently confirms 'failed' rows can never be re-claimed either.
test("claim_pending_email_deliveries only claims status = 'pending' rows", async () => {
  const migration = await readMigration();
  const body = sliceSql(
    migration,
    "create or replace function public.claim_pending_email_deliveries(",
    "revoke all on function public.claim_pending_email_deliveries(",
  );
  assert.match(body, /where claimable\.status = 'pending'/);
  assert.match(body, /for update skip locked/);
});
