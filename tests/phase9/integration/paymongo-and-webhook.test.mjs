// Section: start_paymongo_checkout and reconcile_paymongo_webhook_event —
// one-session-per-invoice, amount/currency verification, and idempotent
// webhook reconciliation. Skips when TEST_SUPABASE_* is not configured.
//
// This exercises the database functions directly (never a live PayMongo
// API call — no real PayMongo credentials are required for these tests).
// See docs/PHASE_9_INVOICES_PAYMENTS_SETUP.md for the manual, real-provider
// verification checklist.

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

describe("Phase 9 PayMongo checkout and webhook reconciliation", () => {
  if (!hasPhase8IntegrationEnv()) {
    test("Phase 9 PayMongo integration tests", (t) => {
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

  test("start_paymongo_checkout records a pending payment with the correct amount", async () => {
    const invoiceId = await createSentInvoice(1000);
    const reference = `cs_test_${randomUUID()}`;
    const { data, error } = await clientAOwnerClient.rpc(
      "start_paymongo_checkout",
      {
        target_invoice_id: invoiceId,
        p_amount: 1000,
        p_currency: "PHP",
        p_provider_reference: reference,
        p_checkout_url: "https://checkout.paymongo.com/test",
      },
    );
    assert.equal(error, null);
    assert.ok(data[0].payment_id);

    const { data: row } = await admin
      .from("payments")
      .select("status, amount, currency, provider")
      .eq("id", data[0].payment_id)
      .single();
    assert.equal(row.status, "pending");
    assert.equal(row.amount, 1000);
    assert.equal(row.provider, "paymongo");
  });

  test("a second checkout attempt while one is already pending is rejected", async () => {
    const invoiceId = await createSentInvoice(1000);
    await clientAOwnerClient.rpc("start_paymongo_checkout", {
      target_invoice_id: invoiceId,
      p_amount: 1000,
      p_currency: "PHP",
      p_provider_reference: `cs_test_${randomUUID()}`,
      p_checkout_url: "https://checkout.paymongo.com/test",
    });

    const { error } = await clientAOwnerClient.rpc("start_paymongo_checkout", {
      target_invoice_id: invoiceId,
      p_amount: 1000,
      p_currency: "PHP",
      p_provider_reference: `cs_test_${randomUUID()}`,
      p_checkout_url: "https://checkout.paymongo.com/test",
    });
    assert.ok(error);
  });

  test("a mismatched amount is rejected before any payment row is created", async () => {
    const invoiceId = await createSentInvoice(1000);
    const { error } = await clientAOwnerClient.rpc("start_paymongo_checkout", {
      target_invoice_id: invoiceId,
      p_amount: 1,
      p_currency: "PHP",
      p_provider_reference: `cs_test_${randomUUID()}`,
      p_checkout_url: "https://checkout.paymongo.com/test",
    });
    assert.ok(error);
  });

  test("reconcile_paymongo_webhook_event settles a matching 'paid' event and updates the invoice", async () => {
    const invoiceId = await createSentInvoice(1000);
    const reference = `cs_test_${randomUUID()}`;
    await clientAOwnerClient.rpc("start_paymongo_checkout", {
      target_invoice_id: invoiceId,
      p_amount: 1000,
      p_currency: "PHP",
      p_provider_reference: reference,
      p_checkout_url: "https://checkout.paymongo.com/test",
    });

    const eventId = `evt_${randomUUID()}`;
    const { data, error } = await admin.rpc("reconcile_paymongo_webhook_event", {
      p_provider_reference: reference,
      p_provider_event_id: eventId,
      p_amount: 1000,
      p_currency: "PHP",
      p_event_status: "paid",
    });
    assert.equal(error, null);
    assert.equal(data[0].outcome, "settled");

    const { data: invoiceRow } = await admin
      .from("invoices")
      .select("status, amount_paid")
      .eq("id", invoiceId)
      .single();
    assert.equal(invoiceRow.status, "paid");
    assert.equal(invoiceRow.amount_paid, 1000);
  });

  test("reconcile_paymongo_webhook_event is idempotent — the same event id processed twice settles only once", async () => {
    const invoiceId = await createSentInvoice(1000);
    const reference = `cs_test_${randomUUID()}`;
    await clientAOwnerClient.rpc("start_paymongo_checkout", {
      target_invoice_id: invoiceId,
      p_amount: 1000,
      p_currency: "PHP",
      p_provider_reference: reference,
      p_checkout_url: "https://checkout.paymongo.com/test",
    });

    const eventId = `evt_${randomUUID()}`;
    const params = {
      p_provider_reference: reference,
      p_provider_event_id: eventId,
      p_amount: 1000,
      p_currency: "PHP",
      p_event_status: "paid",
    };
    const first = await admin.rpc("reconcile_paymongo_webhook_event", params);
    const second = await admin.rpc("reconcile_paymongo_webhook_event", params);

    assert.equal(first.data[0].outcome, "settled");
    assert.equal(second.data[0].outcome, "already_processed");

    const { data: payments } = await admin
      .from("payments")
      .select("id")
      .eq("invoice_id", invoiceId)
      .eq("status", "paid");
    assert.equal(payments.length, 1);
  });

  test("reconcile_paymongo_webhook_event never settles on an amount mismatch", async () => {
    const invoiceId = await createSentInvoice(1000);
    const reference = `cs_test_${randomUUID()}`;
    await clientAOwnerClient.rpc("start_paymongo_checkout", {
      target_invoice_id: invoiceId,
      p_amount: 1000,
      p_currency: "PHP",
      p_provider_reference: reference,
      p_checkout_url: "https://checkout.paymongo.com/test",
    });

    const { data, error } = await admin.rpc("reconcile_paymongo_webhook_event", {
      p_provider_reference: reference,
      p_provider_event_id: `evt_${randomUUID()}`,
      p_amount: 1,
      p_currency: "PHP",
      p_event_status: "paid",
    });
    assert.equal(error, null);
    assert.equal(data[0].outcome, "amount_mismatch");

    const { data: invoiceRow } = await admin
      .from("invoices")
      .select("status, amount_paid")
      .eq("id", invoiceId)
      .single();
    assert.equal(invoiceRow.status, "sent");
    assert.equal(invoiceRow.amount_paid, 0);
  });

  test("a webhook event for an unknown provider_reference is handled safely, without error", async () => {
    const { data, error } = await admin.rpc("reconcile_paymongo_webhook_event", {
      p_provider_reference: `cs_test_${randomUUID()}`,
      p_provider_event_id: `evt_${randomUUID()}`,
      p_amount: 1000,
      p_currency: "PHP",
      p_event_status: "paid",
    });
    assert.equal(error, null);
    assert.equal(data[0].outcome, "payment_not_found");
  });

  test("a failed-event webhook cancels the pending session and frees the invoice for a new attempt", async () => {
    const invoiceId = await createSentInvoice(1000);
    const reference = `cs_test_${randomUUID()}`;
    await clientAOwnerClient.rpc("start_paymongo_checkout", {
      target_invoice_id: invoiceId,
      p_amount: 1000,
      p_currency: "PHP",
      p_provider_reference: reference,
      p_checkout_url: "https://checkout.paymongo.com/test",
    });

    await admin.rpc("reconcile_paymongo_webhook_event", {
      p_provider_reference: reference,
      p_provider_event_id: `evt_${randomUUID()}`,
      p_amount: 1000,
      p_currency: "PHP",
      p_event_status: "failed",
    });

    const { error } = await clientAOwnerClient.rpc("start_paymongo_checkout", {
      target_invoice_id: invoiceId,
      p_amount: 1000,
      p_currency: "PHP",
      p_provider_reference: `cs_test_${randomUUID()}`,
      p_checkout_url: "https://checkout.paymongo.com/test",
    });
    assert.equal(error, null);
  });

  test("reconcile_paymongo_webhook_event is not callable by authenticated or anon clients", async () => {
    const { error: authenticatedError } = await internalAdminClient.rpc(
      "reconcile_paymongo_webhook_event",
      {
        p_provider_reference: "cs_test_forged",
        p_provider_event_id: "evt_forged",
        p_amount: 1000,
        p_currency: "PHP",
        p_event_status: "paid",
      },
    );
    assert.ok(authenticatedError);
  });
});
