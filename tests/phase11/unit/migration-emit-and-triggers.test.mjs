import assert from "node:assert/strict";
import test from "node:test";

import { readMigration, sliceSql } from "../helpers/migration-test-helpers.mjs";

const EXPECTED_TRIGGERS = [
  { name: "leads_emit_events", table: "leads", timing: /after insert or update of status, converted_client_id on public\.leads/ },
  { name: "clients_emit_events", table: "clients", timing: /after insert or update of status on public\.clients/ },
  { name: "client_invitations_emit_events", table: "client_invitations", timing: /after insert or update of status on public\.client_invitations/ },
  { name: "projects_emit_events", table: "projects", timing: /after insert or update of status on public\.projects/ },
  { name: "milestones_emit_events", table: "milestones", timing: /after update of status on public\.milestones/ },
  { name: "project_members_emit_events", table: "project_members", timing: /after insert or delete on public\.project_members/ },
  { name: "proposals_emit_events", table: "proposals", timing: /after update of status on public\.proposals/ },
  { name: "invoices_emit_events", table: "invoices", timing: /after update of status on public\.invoices/ },
  { name: "payments_emit_events", table: "payments", timing: /after insert or update of status on public\.payments/ },
  { name: "revisions_emit_events", table: "revisions", timing: /after insert or update of status, assigned_to on public\.revisions/ },
  { name: "support_tickets_emit_events", table: "support_tickets", timing: /after insert or update of status, assigned_to on public\.support_tickets/ },
  { name: "subscriptions_emit_events", table: "subscriptions", timing: /after insert or update of status on public\.subscriptions/ },
  { name: "subscription_usage_emit_events", table: "subscription_usage", timing: /after insert on public\.subscription_usage/ },
  { name: "project_files_emit_events", table: "project_files", timing: /after insert on public\.project_files/ },
];

test("all 14 emit_events triggers exist", async () => {
  const migration = await readMigration();
  for (const trigger of EXPECTED_TRIGGERS) {
    assert.match(
      migration,
      new RegExp(`create trigger ${trigger.name}\\s*\\n${trigger.timing.source}`),
      `trigger ${trigger.name} missing or has wrong timing`,
    );
  }
});

test("every trigger function calls private.emit_event at least once", async () => {
  const migration = await readMigration();
  for (const trigger of EXPECTED_TRIGGERS) {
    const functionName = `private.emit_${trigger.table}_events`;
    const start = migration.indexOf(`create or replace function ${functionName}()`);
    assert.ok(start > -1, `function ${functionName} not found`);
    const end = migration.indexOf("$function$;", migration.indexOf("$function$", start + 1) + 1);
    const body = migration.slice(start, end);
    assert.match(
      body,
      /private\.emit_event\(/,
      `${functionName} never calls private.emit_event`,
    );
  }
});

test("every emit_events trigger function is revoked from public, anon, authenticated", async () => {
  const migration = await readMigration();
  for (const trigger of EXPECTED_TRIGGERS) {
    const functionName = `private.emit_${trigger.table}_events`;
    assert.match(
      migration,
      new RegExp(`revoke all on function ${functionName.replace(".", "\\.")}\\(\\)\\s+from public, anon, authenticated;`),
    );
  }
});

test("raise_due_invoice_reminders inserts into private.reminder_runs before emitting", async () => {
  const migration = await readMigration();
  const body = sliceSql(
    migration,
    "create or replace function public.raise_due_invoice_reminders()",
    "revoke all on function public.raise_due_invoice_reminders()",
  );
  assert.match(body, /insert into private\.reminder_runs \(reminder_type, entity_id, window_key\)/);
  assert.match(body, /'invoice_reminder'/);
  assert.match(body, /on conflict \(reminder_type, entity_id, window_key\) do nothing/);
  assert.match(body, /private\.emit_event\(/);
});

test("raise_due_renewal_reminders inserts into private.reminder_runs before emitting", async () => {
  const migration = await readMigration();
  const body = sliceSql(
    migration,
    "create or replace function public.raise_due_renewal_reminders()",
    "revoke all on function public.raise_due_renewal_reminders()",
  );
  assert.match(body, /insert into private\.reminder_runs \(reminder_type, entity_id, window_key\)/);
  assert.match(body, /'renewal_reminder'/);
  assert.match(body, /private\.emit_event\(/);
});

test("raise_due_lead_follow_ups inserts into private.reminder_runs before emitting", async () => {
  const migration = await readMigration();
  const body = sliceSql(
    migration,
    "create or replace function public.raise_due_lead_follow_ups()",
    "revoke all on function public.raise_due_lead_follow_ups()",
  );
  assert.match(body, /insert into private\.reminder_runs \(reminder_type, entity_id, window_key\)/);
  assert.match(body, /'lead_follow_up'/);
  assert.match(body, /private\.emit_event\(/);
});

test("private.emit_event inserts audit_logs unconditionally and isolates notification fan-out in its own exception block", async () => {
  const migration = await readMigration();
  const body = sliceSql(
    migration,
    "create or replace function private.emit_event(",
    "revoke all on function private.emit_event(",
  );

  const auditInsertIndex = body.indexOf("insert into public.audit_logs");
  const innerBeginIndex = body.indexOf("begin\n    for recipient in");
  const exceptionIndex = body.indexOf("exception\n    when others then");

  assert.ok(auditInsertIndex > -1, "audit_logs insert not found");
  assert.ok(innerBeginIndex > -1, "nested begin block for recipient fan-out not found");
  assert.ok(exceptionIndex > -1, "exception handler not found");
  // The audit insert must happen BEFORE the nested exception-handling block
  // starts, so a failure inside that block can never roll back the audit
  // row (see SS21 risk: "emit_event must never raise on recipient-resolution
  // failure").
  assert.ok(auditInsertIndex < innerBeginIndex);
  assert.ok(innerBeginIndex < exceptionIndex);
});

test("private.emit_event excludes the actor from their own notification", async () => {
  const migration = await readMigration();
  const body = sliceSql(
    migration,
    "create or replace function private.emit_event(",
    "revoke all on function private.emit_event(",
  );
  assert.match(body, /where resolved\.profile_id is distinct from p_actor_user_id/);
});
