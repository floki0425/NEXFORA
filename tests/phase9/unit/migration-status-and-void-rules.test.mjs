// Static analysis of the Phase 9 migration's status-derivation, send, and
// void business rules. See tests/phase9/integration/ for the equivalent
// live coverage against a real Postgres instance.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const MIGRATION_PATH = new URL(
  "../../../supabase/migrations/20260804000000_phase_9_invoices_payments.sql",
  import.meta.url,
);

async function readMigration() {
  return readFile(MIGRATION_PATH, "utf8");
}

function slice(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  assert.ok(start > -1, `expected to find marker "${startMarker}"`);
  const end = endMarker ? text.indexOf(endMarker, start) : text.length;
  return text.slice(start, end === -1 ? text.length : end);
}

test("balance_due is a generated column (total - amount_paid), never a cached/trigger-set value", async () => {
  const migration = await readMigration();
  assert.match(
    migration,
    /balance_due numeric\(14, 2\) generated always as \(total - amount_paid\) stored/,
  );
});

test("invoice_items.line_total is a generated column (quantity * unit_price)", async () => {
  const migration = await readMigration();
  assert.match(
    migration,
    /line_total numeric\(14, 2\) generated always as \(quantity \* unit_price\) stored/,
  );
});

test("derive_invoice_payment_status only reconsiders sent/partial/overdue — never draft or void, and paid is a stable terminal state", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "create or replace function private.derive_invoice_payment_status",
    "create trigger invoices_derive_payment_status",
  );

  assert.match(section, /if new\.status in \('sent', 'partial', 'overdue'\) then/);
  assert.doesNotMatch(section, /'draft'/);
  assert.doesNotMatch(section, /'void'/);
});

test("derive_invoice_payment_status marks paid when the balance reaches zero or below, else partial when anything has been paid", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "create or replace function private.derive_invoice_payment_status",
    "create trigger invoices_derive_payment_status",
  );

  assert.match(section, /if new\.total - new\.amount_paid <= 0 then/);
  assert.match(section, /new\.status := 'paid';/);
  assert.match(section, /elsif new\.amount_paid > 0 then/);
  assert.match(section, /new\.status := 'partial';/);
});

test("refresh_overdue_invoices only flips sent/partial invoices whose due date has passed and still have a positive balance", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "create or replace function public.refresh_overdue_invoices",
    "revoke all on function public.refresh_overdue_invoices",
  );

  assert.match(section, /status in \('sent', 'partial'\)/);
  assert.match(section, /due_date < current_date/);
  assert.match(section, /total - amount_paid > 0/);
  assert.match(section, /set status = 'overdue'/);
});

test("refresh_overdue_invoices never raises for an unauthenticated or non-member caller — it is best-effort, not a security boundary", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "create or replace function public.refresh_overdue_invoices",
    "revoke all on function public.refresh_overdue_invoices",
  );

  assert.doesNotMatch(section, /raise exception/);
});

test("send_invoice validates due date presence and non-past-ness before assigning a number", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "create or replace function public.send_invoice",
    "revoke all on function public.send_invoice",
  );

  const dueDateNullCheckIndex = section.indexOf("target_invoice.due_date is null");
  const dueDatePastCheckIndex = section.indexOf("target_invoice.due_date < resolved_issue_date");
  const numberAssignmentIndex = section.indexOf("private.next_invoice_number(");

  assert.ok(dueDateNullCheckIndex > -1, "expected a due-date-required check");
  assert.ok(dueDatePastCheckIndex > -1, "expected a due-date-not-in-the-past check");
  assert.ok(numberAssignmentIndex > -1, "expected number assignment");
  assert.ok(
    dueDateNullCheckIndex < numberAssignmentIndex &&
      dueDatePastCheckIndex < numberAssignmentIndex,
    "expected both due-date checks to run before a number is assigned",
  );
});

test("send_invoice requires at least one line item and a positive total before sending", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "create or replace function public.send_invoice",
    "revoke all on function public.send_invoice",
  );

  assert.match(section, /if item_count = 0 then/);
  assert.match(section, /if target_invoice\.total <= 0 then/);
});

test("send_invoice is restricted to super_admin/admin", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "create or replace function public.send_invoice",
    "revoke all on function public.send_invoice",
  );

  assert.match(section, /actor_role not in \('super_admin', 'admin'\)/);
});

test("void_invoice rejects a fully paid invoice and an already-void invoice, and does not touch amount_paid", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "create or replace function public.void_invoice",
    "revoke all on function public.void_invoice",
  );

  assert.match(section, /if target_invoice\.status = 'paid' then/);
  assert.match(section, /if target_invoice\.status = 'void' then/);
  assert.match(section, /set status = 'void', voided_at = pg_catalog\.now\(\)/);
  assert.doesNotMatch(section, /amount_paid = /);
});

test("void_invoice is restricted to super_admin/admin", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "create or replace function public.void_invoice",
    "revoke all on function public.void_invoice",
  );

  assert.match(section, /actor_role not in \('super_admin', 'admin'\)/);
});
