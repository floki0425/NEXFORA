// Static analysis of the Phase 9 migration's official-numbering logic,
// verified against the migration's SQL text directly — mirrors
// tests/phase8/unit/revision-transitions.test.mjs's technique for verifying
// business rules that live entirely in SQL, without a live database.
// See tests/phase9/integration/ for the equivalent live coverage.

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

test("private.invoice_number_counters is a dedicated table, independent from proposal numbering", async () => {
  const migration = await readMigration();
  assert.match(migration, /create table private\.invoice_number_counters/);
  // The migration's own comments may reference proposal_number_counters for
  // documentation purposes (explaining the mirrored pattern) — what matters
  // is that it never creates, alters, or writes to that table.
  assert.doesNotMatch(migration, /(create table|alter table|insert into|update) private\.proposal_number_counters/);
});

test("next_invoice_number performs an atomic upsert-and-increment, not a read-then-write", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "create or replace function private.next_invoice_number",
    "revoke all on function private.next_invoice_number",
  );

  assert.match(section, /on conflict \(organization_id, number_year\)/);
  assert.match(
    section,
    /do update set last_value = private\.invoice_number_counters\.last_value \+ 1/,
  );
  assert.match(section, /returning last_value into assigned_value/);
});

test("next_invoice_number produces the documented NXF-INV-YYYY-NNNN format", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "create or replace function private.next_invoice_number",
    "revoke all on function private.next_invoice_number",
  );

  assert.match(section, /'NXF-INV-' \|\| current_year \|\| '-'/);
  assert.match(section, /lpad\(assigned_value::text, 4, '0'\)/);
});

test("next_invoice_number is never granted directly to authenticated/anon", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "revoke all on function private.next_invoice_number(uuid)",
    "-- ---",
  );

  assert.match(section, /from public, anon, authenticated;/);
  assert.doesNotMatch(section, /grant execute on function private\.next_invoice_number/);
});

test("invoices.invoice_number is null exactly when status is draft (presence check)", async () => {
  const migration = await readMigration();
  assert.match(
    migration,
    /constraint invoices_invoice_number_presence_check\s*\n\s*check \(\(status = 'draft'\) = \(invoice_number is null\)\)/,
  );
});

test("invoices.invoice_number, once assigned, matches the documented format", async () => {
  const migration = await readMigration();
  assert.match(
    migration,
    /invoice_number ~ '\^NXF-INV-\[0-9\]\{4\}-\[0-9\]\{4,\}\$'/,
  );
});

test("send_invoice only ever assigns a number when the invoice does not already have one", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "create or replace function public.send_invoice",
    "revoke all on function public.send_invoice",
  );

  // send_invoice only reaches this point after requiring status = 'draft'
  // (which the presence check guarantees means invoice_number is null), so
  // a number is unconditionally assigned exactly once per successful send —
  // never reusing or skipping a value.
  assert.match(section, /if target_invoice\.status <> 'draft' then/);
  assert.match(
    section,
    /assigned_number := private\.next_invoice_number\(actor_organization_id\);/,
  );
});

test("send_invoice requires organization_id, unique(organization_id, invoice_number) scopes numbers per tenant", async () => {
  const migration = await readMigration();
  assert.match(
    migration,
    /constraint invoices_organization_number_key\s*\n\s*unique \(organization_id, invoice_number\)/,
  );
});
