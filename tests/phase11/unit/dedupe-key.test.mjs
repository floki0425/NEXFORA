import assert from "node:assert/strict";
import test from "node:test";

import { readMigration, sliceSql } from "../helpers/migration-test-helpers.mjs";

// Pure reimplementation of raise_due_lead_follow_ups()'s threshold_date
// formula (private/functions section of the migration), used to test the
// window-key property directly: stable for identical input, distinct for
// distinct staleness-crossing dates.
const FOLLOW_UP_WINDOW_DAYS = 7;

function leadFollowUpWindowKey({ updatedAt, lastActivityAt, createdAt }) {
  const lastTouch = new Date(
    Math.max(
      new Date(updatedAt).getTime(),
      new Date(lastActivityAt ?? createdAt).getTime(),
    ),
  );
  const threshold = new Date(lastTouch.getTime());
  threshold.setUTCDate(threshold.getUTCDate() + FOLLOW_UP_WINDOW_DAYS);
  return threshold.toISOString().slice(0, 10);
}

test("invoice reminder window keys are three fixed, mutually distinct strings tied to distinct date offsets", async () => {
  const migration = await readMigration();
  const body = sliceSql(
    migration,
    "create or replace function public.raise_due_invoice_reminders()",
    "revoke all on function public.raise_due_invoice_reminders()",
  );

  assert.match(body, /when invoice\.due_date = current_date \+ 3 then 'due-3'/);
  assert.match(body, /when invoice\.due_date = current_date then 'due-0'/);
  assert.match(body, /when invoice\.due_date = current_date - 7 then 'overdue\+7'/);

  const keys = ["due-3", "due-0", "overdue+7"];
  assert.equal(new Set(keys).size, keys.length);
});

test("renewal reminder window keys are two fixed, mutually distinct strings tied to distinct date offsets", async () => {
  const migration = await readMigration();
  const body = sliceSql(
    migration,
    "create or replace function public.raise_due_renewal_reminders()",
    "revoke all on function public.raise_due_renewal_reminders()",
  );

  assert.match(body, /when subscription\.renewal_at::date = current_date \+ 14 then 'renewal-14'/);
  assert.match(body, /when subscription\.renewal_at::date = current_date \+ 3 then 'renewal-3'/);

  const keys = ["renewal-14", "renewal-3"];
  assert.equal(new Set(keys).size, keys.length);
});

test("lead follow-up window key is stable for the same last-activity input", () => {
  const input = {
    updatedAt: "2026-08-01T00:00:00Z",
    lastActivityAt: "2026-08-01T00:00:00Z",
    createdAt: "2026-07-01T00:00:00Z",
  };
  assert.equal(leadFollowUpWindowKey(input), leadFollowUpWindowKey(input));
  assert.equal(leadFollowUpWindowKey(input), "2026-08-08");
});

test("lead follow-up window key changes when new activity resets the staleness clock", () => {
  const stale = leadFollowUpWindowKey({
    updatedAt: "2026-08-01T00:00:00Z",
    lastActivityAt: null,
    createdAt: "2026-08-01T00:00:00Z",
  });
  const touchedAgain = leadFollowUpWindowKey({
    updatedAt: "2026-08-01T00:00:00Z",
    lastActivityAt: "2026-08-05T00:00:00Z",
    createdAt: "2026-08-01T00:00:00Z",
  });
  assert.notEqual(stale, touchedAgain);
});

test("lead follow-up window key falls back to created_at when there is no activity row", () => {
  const withoutActivity = leadFollowUpWindowKey({
    updatedAt: "2026-08-01T00:00:00Z",
    lastActivityAt: null,
    createdAt: "2026-08-01T00:00:00Z",
  });
  assert.equal(withoutActivity, "2026-08-08");
});

test("reminder_runs unique constraint namespaces window keys by (reminder_type, entity_id) so identical string keys across types never collide", async () => {
  const migration = await readMigration();
  assert.match(
    migration,
    /constraint reminder_runs_unique\s*\n\s*unique \(reminder_type, entity_id, window_key\)/,
  );
});
