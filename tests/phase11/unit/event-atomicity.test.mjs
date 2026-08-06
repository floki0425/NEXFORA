// Statically verifies the fix for the event-atomicity gap found in review:
// private.emit_event's original `exception when others then null;` silently
// discarded recipient-resolution/notification-fan-out failures. These
// assertions target the follow-up migration
// (20260806010000_fix_phase_11_event_atomicity.sql), not the base one.

import assert from "node:assert/strict";
import test from "node:test";

import { readMigrationFile, sliceSql } from "../helpers/migration-test-helpers.mjs";

const FOLLOW_UP_PATH = new URL(
  "../../../supabase/migrations/20260806010000_fix_phase_11_event_atomicity.sql",
  import.meta.url,
);

async function readFollowUp() {
  return readMigrationFile(FOLLOW_UP_PATH);
}

test("does not modify the base Phase 11 migration file", async () => {
  const base = await readMigrationFile(
    new URL(
      "../../../supabase/migrations/20260806000000_phase_11_notifications_audit.sql",
      import.meta.url,
    ),
  );
  // The base file's emit_event still contains the OLD swallow-everything
  // handler — proving the follow-up replaces it via `create or replace`
  // rather than editing the original file in place.
  assert.match(base, /exception\s*\n\s*when others then\s*\n\s*null;\s*\n\s*end;\s*\nend;\s*\n\$function\$;/);
});

test("private.notification_dispatch_failures is revoked from every role, including service_role", async () => {
  const migration = await readFollowUp();
  assert.match(
    migration,
    /revoke all on table private\.notification_dispatch_failures\s*\n\s*from public, anon, authenticated, service_role;/,
  );
});

test("dedupe_key is nullable on the failure table (the original failure may itself be a bad dedupe_key)", async () => {
  const migration = await readFollowUp();
  const tableBlock = sliceSql(
    migration,
    "create table private.notification_dispatch_failures",
    "create index notification_dispatch_failures_unresolved_idx",
  );
  assert.doesNotMatch(tableBlock, /dedupe_key text not null/);
  assert.match(tableBlock, /dedupe_key text,/);
});

test("emit_event captures the audit_logs row id via RETURNING before entering the protected fan-out block", async () => {
  const migration = await readFollowUp();
  const body = sliceSql(
    migration,
    "create or replace function private.emit_event(",
    "revoke all on function private.emit_event(",
  );

  const returningIndex = body.indexOf("returning id into v_audit_log_id;");
  const innerBeginIndex = body.indexOf("begin\n    for recipient in");
  assert.ok(returningIndex > -1, "expected `returning id into v_audit_log_id`");
  assert.ok(innerBeginIndex > -1, "expected the nested fan-out begin block");
  assert.ok(
    returningIndex < innerBeginIndex,
    "audit_log_id must be captured before the fan-out block starts",
  );
});

test("a fan-out failure is persisted with the captured audit_log_id, not silently discarded", async () => {
  const migration = await readFollowUp();
  const body = sliceSql(
    migration,
    "create or replace function private.emit_event(",
    "revoke all on function private.emit_event(",
  );
  const exceptionBlock = sliceSql(body, "exception\n    when others then", "end;\nend;\n$function$;");

  assert.match(exceptionBlock, /insert into private\.notification_dispatch_failures/);
  assert.match(exceptionBlock, /v_audit_log_id, p_organization_id, p_actor_user_id, p_actor_type, p_action/);
  assert.match(exceptionBlock, /sqlstate, left\(sqlerrm, 500\)/);
  // The old unconditional "when others then null;" swallow must be gone
  // from this (the replaced) definition.
  assert.doesNotMatch(exceptionBlock, /when others then\s*\n\s*null;\s*\n\s*end;\s*\nend;/);
});

test("the failure-recording insert has its own last-resort exception handler, so a pathological failure there still cannot roll back the business mutation", async () => {
  const migration = await readFollowUp();
  const body = sliceSql(
    migration,
    "create or replace function private.emit_event(",
    "revoke all on function private.emit_event(",
  );
  const exceptionBlock = sliceSql(body, "exception\n    when others then", "end;\nend;\n$function$;");

  // A second, nested begin/exception specifically around the
  // notification_dispatch_failures insert.
  const innerHandlerIndex = exceptionBlock.indexOf(
    "insert into private.notification_dispatch_failures",
  );
  const innerExceptionIndex = exceptionBlock.indexOf("exception\n        when others then\n          null;");
  assert.ok(innerHandlerIndex > -1);
  assert.ok(innerExceptionIndex > -1);
  assert.ok(innerHandlerIndex < innerExceptionIndex);
});

test("list_notification_dispatch_failures is service_role-only, clamped to 100, never granted to authenticated/anon", async () => {
  const migration = await readFollowUp();
  const body = sliceSql(
    migration,
    "create or replace function public.list_notification_dispatch_failures(",
    "revoke all on function public.list_notification_dispatch_failures(integer)\n  from public, anon, authenticated;",
  );
  assert.match(body, /limit greatest\(1, least\(coalesce\(p_limit, 20\), 100\)\)/);

  assert.match(
    migration,
    /grant execute on function public\.list_notification_dispatch_failures\(integer\)\s*\n\s*to service_role;/,
  );
  assert.doesNotMatch(
    migration,
    /grant execute on function public\.list_notification_dispatch_failures\(integer\)\s*\n\s*to authenticated;/,
  );
});

test("preflight aborts if the base migration is missing, and aborts if run twice", async () => {
  const migration = await readFollowUp();
  const preflight = sliceSql(migration, "do $preflight$", "$preflight$;");
  assert.match(preflight, /to_regclass\('public\.audit_logs'\) is null/);
  assert.match(
    preflight,
    /to_regclass\('private\.notification_dispatch_failures'\) is not null/,
  );
});
