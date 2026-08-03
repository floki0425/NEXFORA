import assert from "node:assert/strict";
import test from "node:test";

import { NOTIFICATION_EVENT_TYPES } from "../../../src/features/notifications/constants.ts";
import { NOTIFICATION_EVENT_LABELS } from "../../../src/features/notifications/constants.ts";
import { readMigration, sliceSql } from "../helpers/migration-test-helpers.mjs";

function extractCheckConstraintValues(migration, constraintMarker) {
  const section = sliceSql(migration, constraintMarker, ")\n    ),");
  const matches = [...section.matchAll(/'([a-z_]+\.[a-z_]+)'/g)];
  return matches.map((match) => match[1]);
}

test("TS NOTIFICATION_EVENT_TYPES exactly matches audit_logs.action's check constraint (both directions)", async () => {
  const migration = await readMigration();
  const sqlValues = extractCheckConstraintValues(
    migration,
    "constraint audit_logs_action_check",
  );

  const tsSet = new Set(NOTIFICATION_EVENT_TYPES);
  const sqlSet = new Set(sqlValues);

  for (const value of sqlValues) {
    assert.ok(tsSet.has(value), `SQL action "${value}" missing from TS NOTIFICATION_EVENT_TYPES`);
  }
  for (const value of NOTIFICATION_EVENT_TYPES) {
    assert.ok(sqlSet.has(value), `TS event type "${value}" missing from SQL audit_logs_action_check`);
  }
  assert.equal(sqlValues.length, NOTIFICATION_EVENT_TYPES.length);
});

test("TS NOTIFICATION_EVENT_TYPES exactly matches notifications.event_type's check constraint (both directions)", async () => {
  const migration = await readMigration();
  const sqlValues = extractCheckConstraintValues(
    migration,
    "constraint notifications_event_type_check",
  );

  const tsSet = new Set(NOTIFICATION_EVENT_TYPES);
  const sqlSet = new Set(sqlValues);

  for (const value of sqlValues) {
    assert.ok(tsSet.has(value), `SQL event_type "${value}" missing from TS NOTIFICATION_EVENT_TYPES`);
  }
  for (const value of NOTIFICATION_EVENT_TYPES) {
    assert.ok(sqlSet.has(value), `TS event type "${value}" missing from SQL notifications_event_type_check`);
  }
  assert.equal(sqlValues.length, NOTIFICATION_EVENT_TYPES.length);
});

test("TS NOTIFICATION_EVENT_TYPES exactly matches notification_preferences.event_type's check constraint", async () => {
  const migration = await readMigration();
  const sqlValues = extractCheckConstraintValues(
    migration,
    "constraint notification_preferences_event_type_check",
  );

  assert.equal(sqlValues.length, NOTIFICATION_EVENT_TYPES.length);
  assert.deepEqual(new Set(sqlValues), new Set(NOTIFICATION_EVENT_TYPES));
});

test("every event type has a non-empty human label", () => {
  for (const eventType of NOTIFICATION_EVENT_TYPES) {
    const label = NOTIFICATION_EVENT_LABELS[eventType];
    assert.ok(
      typeof label === "string" && label.trim().length > 0,
      `missing label for "${eventType}"`,
    );
  }
});

test("event type list has no duplicates", () => {
  assert.equal(
    new Set(NOTIFICATION_EVENT_TYPES).size,
    NOTIFICATION_EVENT_TYPES.length,
  );
});
