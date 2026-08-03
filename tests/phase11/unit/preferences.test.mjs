import assert from "node:assert/strict";
import test from "node:test";

import { NOTIFICATION_EVENT_TYPES } from "../../../src/features/notifications/constants.ts";
import { readMigration, sliceSql } from "../helpers/migration-test-helpers.mjs";

test("private.emit_event defaults an absent preference row to both channels enabled", async () => {
  const migration = await readMigration();
  const body = sliceSql(
    migration,
    "create or replace function private.emit_event(",
    "revoke all on function private.emit_event(",
  );

  assert.match(body, /if not found then\s*\n\s*pref_in_app := true;\s*\n\s*pref_email := true;/);
});

test("private.emit_event looks up preferences scoped by (profile_id, event_type), matching the unique constraint", async () => {
  const migration = await readMigration();
  const body = sliceSql(
    migration,
    "create or replace function private.emit_event(",
    "revoke all on function private.emit_event(",
  );

  assert.match(body, /where pref\.profile_id = recipient\.profile_id\s*\n\s*and pref\.event_type = p_action;/);
});

test("set_notification_preference upserts on (profile_id, event_type), so an explicit false persists as a real row rather than being silently dropped", async () => {
  const migration = await readMigration();
  const body = sliceSql(
    migration,
    "create or replace function public.set_notification_preference(",
    "revoke all on function public.set_notification_preference(",
  );

  assert.match(body, /on conflict \(profile_id, event_type\)/);
  assert.match(body, /do update set\s*\n\s*in_app = excluded\.in_app,\s*\n\s*email = excluded\.email,/);
});

// Reimplements the exact "existing?.inApp ?? true" fill applied by
// getMyNotificationPreferences() (src/features/notifications/queries.ts) —
// that function itself requires a live Supabase request context and is
// exercised for real by tests/phase11/integration/event-emission.test.mjs.
function fillPreferences(savedRows) {
  const saved = new Map(savedRows.map((row) => [row.eventType, row]));
  return NOTIFICATION_EVENT_TYPES.map((eventType) => {
    const existing = saved.get(eventType);
    return {
      eventType,
      inApp: existing?.inApp ?? true,
      email: existing?.email ?? true,
    };
  });
}

test("absent row fills in as both channels enabled", () => {
  const filled = fillPreferences([]);
  assert.equal(filled.length, NOTIFICATION_EVENT_TYPES.length);
  for (const preference of filled) {
    assert.equal(preference.inApp, true);
    assert.equal(preference.email, true);
  }
});

test("an explicit false for one channel is preserved, the other channel still defaults true for untouched event types", () => {
  const eventType = NOTIFICATION_EVENT_TYPES[0];
  const filled = fillPreferences([{ eventType, inApp: false, email: true }]);
  const touched = filled.find((preference) => preference.eventType === eventType);
  const untouched = filled.find(
    (preference) => preference.eventType !== eventType,
  );

  assert.equal(touched.inApp, false);
  assert.equal(touched.email, true);
  assert.equal(untouched.inApp, true);
  assert.equal(untouched.email, true);
});
