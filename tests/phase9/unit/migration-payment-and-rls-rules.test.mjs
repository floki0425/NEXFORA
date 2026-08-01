// Static analysis of the Phase 9 migration's payment-recording,
// PayMongo-reconciliation, and RLS/grant rules.

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

test("record_manual_payment rejects a payment that would exceed the remaining balance", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "create or replace function public.record_manual_payment",
    "revoke all on function public.record_manual_payment",
  );

  assert.match(section, /if p_amount > target_invoice\.balance_due then/);
  assert.doesNotMatch(section, /overpay/i);
});

test("record_manual_payment's idempotency short-circuit re-validates the invoice_id match and organization ownership, not just the key", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "create or replace function public.record_manual_payment",
    "revoke all on function public.record_manual_payment",
  );

  assert.match(section, /if existing_payment_invoice_id <> target_invoice_id then/);
  assert.match(
    section,
    /where invoice\.id = target_invoice_id\s*\n\s*and invoice\.organization_id = actor_organization_id;/,
  );
});

test("record_manual_payment is restricted to super_admin/admin", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "create or replace function public.record_manual_payment",
    "revoke all on function public.record_manual_payment",
  );

  assert.match(section, /actor_role not in \('super_admin', 'admin'\)/);
});

test("payments has no INSERT/UPDATE/DELETE grant to authenticated or anon — every write goes through a function", async () => {
  const migration = await readMigration();
  const grantsSection = slice(migration, "-- Grants", null);

  assert.match(grantsSection, /grant select on table public\.payments to authenticated;/);
  assert.doesNotMatch(
    grantsSection,
    /grant insert[\s\S]{0,40}on public\.payments to authenticated/,
  );
  assert.doesNotMatch(
    grantsSection,
    /grant update[\s\S]{0,40}on public\.payments to authenticated/,
  );
});

test("start_paymongo_checkout rejects a mismatched amount or currency rather than trusting or silently overwriting it", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "create or replace function public.start_paymongo_checkout",
    "revoke all on function public.start_paymongo_checkout",
  );

  assert.match(
    section,
    /if p_amount is distinct from target_invoice\.balance_due\s*\n\s*or p_currency is distinct from target_invoice\.currency/,
  );
});

test("start_paymongo_checkout auto-expires stale (24h+) pending sessions instead of blocking forever", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "create or replace function public.start_paymongo_checkout",
    "revoke all on function public.start_paymongo_checkout",
  );

  assert.match(section, /created_at < pg_catalog\.now\(\) - interval '24 hours'/);
  assert.match(section, /set status = 'cancelled'/);
});

test("start_paymongo_checkout is restricted to owner/manager client roles", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "create or replace function public.start_paymongo_checkout",
    "revoke all on function public.start_paymongo_checkout",
  );

  assert.match(section, /resolved_role not in \('owner', 'manager'\)/);
});

test("payments_invoice_active_paymongo_session_unique allows at most one in-flight PayMongo attempt per invoice", async () => {
  const migration = await readMigration();
  assert.match(
    migration,
    /create unique index payments_invoice_active_paymongo_session_unique\s*\n\s*on public\.payments \(invoice_id\)\s*\n\s*where provider = 'paymongo' and status in \('pending', 'processing'\);/,
  );
});

test("reconcile_paymongo_webhook_event is granted only to service_role, never authenticated or anon", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "revoke all on function public.reconcile_paymongo_webhook_event",
    "-- ---",
  );

  assert.match(section, /from public, anon, authenticated;/);
  assert.match(section, /grant execute on function public\.reconcile_paymongo_webhook_event[\s\S]*to service_role;/);
  assert.doesNotMatch(section, /to authenticated/);
});

test("reconcile_paymongo_webhook_event is idempotent on provider_event_id before doing anything else", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "create or replace function public.reconcile_paymongo_webhook_event",
    "revoke all on function public.reconcile_paymongo_webhook_event",
  );

  const idempotencyCheckIndex = section.indexOf("already_processed");
  const settleIndex = section.indexOf("status = 'paid',");
  assert.ok(idempotencyCheckIndex > -1);
  assert.ok(settleIndex > -1);
  assert.ok(
    idempotencyCheckIndex < settleIndex,
    "expected the idempotency check to run before any settlement logic",
  );
});

test("reconcile_paymongo_webhook_event never settles on an amount/currency mismatch", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "create or replace function public.reconcile_paymongo_webhook_event",
    "revoke all on function public.reconcile_paymongo_webhook_event",
  );

  assert.match(
    section,
    /if p_amount is distinct from target_payment\.amount\s*\n\s*or p_currency is distinct from target_payment\.currency/,
  );
  assert.match(section, /status = 'failed',/);
});

test("invoices can only be directly updated by authenticated while still a draft — send/void/payment status changes bypass this via SECURITY DEFINER functions", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "create policy invoices_update_invoice_managers",
    "create policy invoice_items_select_internal_members",
  );

  assert.match(section, /and invoices\.status = 'draft'/);
});

test("invoices UPDATE grant never includes client_id or project_id — ownership is set once at creation, matching proposals' precedent", async () => {
  const migration = await readMigration();
  const grantsSection = slice(migration, "-- Grants", null);
  const updateGrant = slice(grantsSection, "grant update (\n  currency,", ") on public.invoices to authenticated;");

  assert.doesNotMatch(updateGrant, /client_id/);
  assert.doesNotMatch(updateGrant, /project_id/);
});
