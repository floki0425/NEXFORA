// Section: overdue derivation — refresh_overdue_invoices (the persisted,
// admin-facing transition) and the effective_invoice_status computation
// used by the client-facing read functions (accurate even before a refresh
// has run). Skips when TEST_SUPABASE_* is not configured.

import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import {
  cleanupPhase9Fixtures,
  createPhase9Fixtures,
  createSentInvoice,
} from "../helpers/factory.mjs";
import {
  createTestAdminClient,
  signInTestUser,
} from "../../phase8/helpers/supabase-clients.mjs";
import {
  getPhase8IntegrationSkipReason,
  hasPhase8IntegrationEnv,
} from "../../phase8/helpers/test-env.mjs";

describe("Phase 9 overdue status derivation", () => {
  if (!hasPhase8IntegrationEnv()) {
    test("Phase 9 overdue status integration tests", (t) => {
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

  // due_date must be in the future to pass send_invoice's own validation,
  // so the fixture is sent with a near-future date and then backdated
  // directly via the admin client — simulating time having passed, without
  // actually waiting.
  async function createOverdueInvoice() {
    const invoiceId = await createSentInvoice(internalAdminClient, fixtures, 1000);
    await admin
      .from("invoices")
      .update({ due_date: "2020-01-01" })
      .eq("id", invoiceId);
    return invoiceId;
  }

  test("refresh_overdue_invoices flips a past-due sent invoice to 'overdue', scoped to the caller's organization", async () => {
    const invoiceId = await createOverdueInvoice();

    const { data: before } = await admin
      .from("invoices")
      .select("status")
      .eq("id", invoiceId)
      .single();
    assert.equal(before.status, "sent");

    const { error } = await internalAdminClient.rpc("refresh_overdue_invoices");
    assert.equal(error, null);

    const { data: after } = await admin
      .from("invoices")
      .select("status")
      .eq("id", invoiceId)
      .single();
    assert.equal(after.status, "overdue");
  });

  test("a paid invoice is never flipped to overdue even if its due date has passed", async () => {
    const invoiceId = await createOverdueInvoice();
    await internalAdminClient.rpc("record_manual_payment", {
      target_invoice_id: invoiceId,
      p_amount: 1000,
      p_payment_method: "cash",
      p_paid_date: "2026-01-01",
      p_provider_reference: "",
      p_notes: "",
      p_idempotency_key: crypto.randomUUID(),
    });

    await internalAdminClient.rpc("refresh_overdue_invoices");

    const { data: row } = await admin
      .from("invoices")
      .select("status")
      .eq("id", invoiceId)
      .single();
    assert.equal(row.status, "paid");
  });

  test("get_client_invoices reports 'overdue' for a past-due sent invoice even before refresh_overdue_invoices has run", async () => {
    const invoiceId = await createOverdueInvoice();
    // Deliberately not calling refresh_overdue_invoices here — the stored
    // column may still say 'sent'; the client-facing function must compute
    // the same answer live via private.effective_invoice_status.
    const { data } = await clientAOwnerClient.rpc("get_client_invoices");
    const invoice = (data ?? []).find((row) => row.id === invoiceId);
    assert.ok(invoice, "expected the invoice to be present in the client's list");
    assert.equal(invoice.status, "overdue");
  });

  test("get_client_invoice_detail reports 'overdue' for a past-due sent invoice even before refresh_overdue_invoices has run", async () => {
    const invoiceId = await createOverdueInvoice();
    const { data } = await clientAOwnerClient.rpc("get_client_invoice_detail", {
      target_invoice_id: invoiceId,
    });
    assert.equal(data.status, "overdue");
  });

  test("an invoice not yet due is reported as 'sent', not 'overdue'", async () => {
    const invoiceId = await createSentInvoice(internalAdminClient, fixtures, 1000);

    const { data } = await clientAOwnerClient.rpc("get_client_invoices");
    const row = (data ?? []).find((item) => item.id === invoiceId);
    assert.equal(row.status, "sent");
  });
});
