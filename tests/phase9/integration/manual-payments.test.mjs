// Section: record_manual_payment — balance/status derivation, overpayment
// rejection, and idempotency. Skips when TEST_SUPABASE_* is not configured.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";

import {
  cleanupPhase9Fixtures,
  createPhase9Fixtures,
  createSentInvoice as createSentInvoiceFixture,
} from "../helpers/factory.mjs";
import {
  createTestAdminClient,
  signInTestUser,
} from "../../phase8/helpers/supabase-clients.mjs";
import {
  getPhase8IntegrationSkipReason,
  hasPhase8IntegrationEnv,
} from "../../phase8/helpers/test-env.mjs";

describe("Phase 9 manual payment recording", () => {
  if (!hasPhase8IntegrationEnv()) {
    test("Phase 9 manual payment integration tests", (t) => {
      t.skip(getPhase8IntegrationSkipReason());
    });
    return;
  }

  let admin;
  let fixtures;
  let internalAdminClient;
  let clientAOwnerClient;

  before(async () => {
    admin = createTestAdminClient();
    fixtures = await createPhase9Fixtures(admin);
    internalAdminClient = await signInTestUser(
      fixtures.internalAdmin.email,
      fixtures.internalAdmin.password,
    );
    clientAOwnerClient = await signInTestUser(
      fixtures.clientAOwner.email,
      fixtures.clientAOwner.password,
    );
  });

  after(async () => {
    await cleanupPhase9Fixtures(admin, fixtures);
  });

  async function createSentInvoice(totalAmount) {
    return createSentInvoiceFixture(internalAdminClient, fixtures, totalAmount);
  }

  test("a partial payment moves the invoice to 'partial' with the correct balance", async () => {
    const invoiceId = await createSentInvoice(1000);
    const { data, error } = await internalAdminClient.rpc(
      "record_manual_payment",
      {
        target_invoice_id: invoiceId,
        p_amount: 400,
        p_payment_method: "gcash",
        p_paid_date: "2026-08-01",
        p_provider_reference: "GC-001",
        p_notes: "",
        p_idempotency_key: randomUUID(),
      },
    );
    assert.equal(error, null);
    assert.equal(data[0].invoice_status, "partial");
    assert.equal(data[0].balance_due, 600);
  });

  test("paying the remaining balance moves the invoice to 'paid' and sets paid_at", async () => {
    const invoiceId = await createSentInvoice(1000);
    await internalAdminClient.rpc("record_manual_payment", {
      target_invoice_id: invoiceId,
      p_amount: 1000,
      p_payment_method: "bank_transfer",
      p_paid_date: "2026-08-01",
      p_provider_reference: "",
      p_notes: "",
      p_idempotency_key: randomUUID(),
    });

    const { data: row } = await admin
      .from("invoices")
      .select("status, balance_due, paid_at")
      .eq("id", invoiceId)
      .single();
    assert.equal(row.status, "paid");
    assert.equal(row.balance_due, 0);
    assert.ok(row.paid_at);
  });

  test("a payment exceeding the remaining balance is rejected outright — no overpayment", async () => {
    const invoiceId = await createSentInvoice(1000);
    const { error } = await internalAdminClient.rpc("record_manual_payment", {
      target_invoice_id: invoiceId,
      p_amount: 1000.01,
      p_payment_method: "cash",
      p_paid_date: "2026-08-01",
      p_provider_reference: "",
      p_notes: "",
      p_idempotency_key: randomUUID(),
    });
    assert.ok(error);

    const { data: row } = await admin
      .from("invoices")
      .select("amount_paid, status")
      .eq("id", invoiceId)
      .single();
    assert.equal(row.amount_paid, 0);
    assert.equal(row.status, "sent");
  });

  test("resubmitting the same idempotency key returns the original payment instead of creating a duplicate", async () => {
    const invoiceId = await createSentInvoice(1000);
    const key = randomUUID();
    const params = {
      target_invoice_id: invoiceId,
      p_amount: 300,
      p_payment_method: "cash",
      p_paid_date: "2026-08-01",
      p_provider_reference: "",
      p_notes: "",
      p_idempotency_key: key,
    };

    const first = await internalAdminClient.rpc("record_manual_payment", params);
    const second = await internalAdminClient.rpc("record_manual_payment", params);

    assert.equal(first.error, null);
    assert.equal(second.error, null);
    assert.equal(first.data[0].payment_id, second.data[0].payment_id);

    const { data: payments } = await admin
      .from("payments")
      .select("id")
      .eq("invoice_id", invoiceId);
    assert.equal(payments.length, 1);

    const { data: row } = await admin
      .from("invoices")
      .select("amount_paid")
      .eq("id", invoiceId)
      .single();
    assert.equal(row.amount_paid, 300);
  });

  test("payments cannot be recorded on a draft invoice", async () => {
    const { data: draft } = await internalAdminClient
      .from("invoices")
      .insert({
        organization_id: fixtures.orgA.id,
        client_id: fixtures.clientA.id,
        due_date: "2026-12-31",
        created_by: fixtures.internalAdmin.profileId,
      })
      .select("id")
      .single();

    const { error } = await internalAdminClient.rpc("record_manual_payment", {
      target_invoice_id: draft.id,
      p_amount: 100,
      p_payment_method: "cash",
      p_paid_date: "2026-08-01",
      p_provider_reference: "",
      p_notes: "",
      p_idempotency_key: randomUUID(),
    });
    assert.ok(error);

    await admin.from("invoices").delete().eq("id", draft.id);
  });

  test("a client (portal user) cannot call record_manual_payment at all", async () => {
    const invoiceId = await createSentInvoice(1000);
    const { error } = await clientAOwnerClient.rpc("record_manual_payment", {
      target_invoice_id: invoiceId,
      p_amount: 100,
      p_payment_method: "cash",
      p_paid_date: "2026-08-01",
      p_provider_reference: "",
      p_notes: "",
      p_idempotency_key: randomUUID(),
    });
    assert.ok(error);
  });

  test("payment history accumulates across multiple partial payments and totals correctly", async () => {
    const invoiceId = await createSentInvoice(1000);
    await internalAdminClient.rpc("record_manual_payment", {
      target_invoice_id: invoiceId,
      p_amount: 300,
      p_payment_method: "cash",
      p_paid_date: "2026-08-01",
      p_provider_reference: "",
      p_notes: "",
      p_idempotency_key: randomUUID(),
    });
    await internalAdminClient.rpc("record_manual_payment", {
      target_invoice_id: invoiceId,
      p_amount: 700,
      p_payment_method: "gcash",
      p_paid_date: "2026-08-02",
      p_provider_reference: "",
      p_notes: "",
      p_idempotency_key: randomUUID(),
    });

    const { data: row } = await admin
      .from("invoices")
      .select("status, amount_paid, balance_due")
      .eq("id", invoiceId)
      .single();
    assert.equal(row.status, "paid");
    assert.equal(row.amount_paid, 1000);
    assert.equal(row.balance_due, 0);

    const { data: payments } = await admin
      .from("payments")
      .select("id")
      .eq("invoice_id", invoiceId)
      .eq("status", "paid");
    assert.equal(payments.length, 2);
  });
});
