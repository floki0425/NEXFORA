// Section: cross-organization and cross-client isolation for invoices,
// invoice_items, and payments, plus the client-facing read boundary
// (get_client_invoices / get_client_invoice_detail never leak drafts or
// internal-only fields). Skips when TEST_SUPABASE_* is not configured.

import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import {
  cleanupPhase9Fixtures,
  createPhase9Fixtures,
  createSentInvoice,
} from "../helpers/factory.mjs";
import {
  createTestAdminClient,
  createTestAnonClient,
  signInTestUser,
} from "../../phase8/helpers/supabase-clients.mjs";
import {
  getPhase8IntegrationSkipReason,
  hasPhase8IntegrationEnv,
} from "../../phase8/helpers/test-env.mjs";

describe("Phase 9 RLS — invoices, invoice_items, payments", () => {
  if (!hasPhase8IntegrationEnv()) {
    test("Phase 9 RLS integration tests", (t) => {
      t.skip(getPhase8IntegrationSkipReason());
    });
    return;
  }

  let admin;
  let fixtures;
  let anonClient;
  let internalAdminClient;
  let clientAOwnerClient;
  let clientAViewerClient;
  let clientBOwnerClient;
  let sentInvoiceId;

  before(async () => {
    admin = createTestAdminClient();
    fixtures = await createPhase9Fixtures(admin);
    anonClient = createTestAnonClient();
    internalAdminClient = await signInTestUser(
      fixtures.internalAdmin.email,
      fixtures.internalAdmin.password,
    );
    clientAOwnerClient = await signInTestUser(
      fixtures.clientAOwner.email,
      fixtures.clientAOwner.password,
    );
    clientAViewerClient = await signInTestUser(
      fixtures.clientAViewer.email,
      fixtures.clientAViewer.password,
    );
    clientBOwnerClient = await signInTestUser(
      fixtures.clientBOwner.email,
      fixtures.clientBOwner.password,
    );

    sentInvoiceId = await createSentInvoice(internalAdminClient, fixtures, 5000, {
      notes: "Internal-only note, never shown to the client.",
    });
  });

  after(async () => {
    await cleanupPhase9Fixtures(admin, fixtures);
  });

  test("anonymous user cannot select invoices", async () => {
    const { data, error } = await anonClient
      .from("invoices")
      .select("id")
      .eq("id", sentInvoiceId);
    assert.ok(error || (data ?? []).length === 0);
  });

  test("Organization B cannot see Organization A's invoices", async () => {
    const { data, error } = await internalAdminClient
      .from("invoices")
      .select("id, organization_id");
    assert.equal(error, null);
    for (const row of data ?? []) {
      assert.equal(row.organization_id, fixtures.orgA.id);
    }
  });

  test("Client A can read their own sent invoice through get_client_invoice_detail", async () => {
    const { data, error } = await clientAOwnerClient.rpc(
      "get_client_invoice_detail",
      { target_invoice_id: sentInvoiceId },
    );
    assert.equal(error, null);
    assert.ok(data);
    assert.equal(data.id, sentInvoiceId);
  });

  test("Client B cannot read Client A's invoice through get_client_invoice_detail", async () => {
    const { data, error } = await clientBOwnerClient.rpc(
      "get_client_invoice_detail",
      { target_invoice_id: sentInvoiceId },
    );
    assert.equal(error, null);
    assert.equal(data, null);
  });

  test("get_client_invoices for Client B never includes Client A's invoice", async () => {
    const { data } = await clientBOwnerClient.rpc("get_client_invoices");
    const ids = (data ?? []).map((invoice) => invoice.id);
    assert.ok(!ids.includes(sentInvoiceId));
  });

  test("get_client_invoice_detail never exposes internal-only fields like notes or organization_id", async () => {
    const { data } = await clientAOwnerClient.rpc("get_client_invoice_detail", {
      target_invoice_id: sentInvoiceId,
    });
    assert.equal("notes" in data, false);
    assert.equal("organization_id" in data, false);
    assert.equal("created_by" in data, false);
  });

  test("a draft invoice is never visible through get_client_invoices or get_client_invoice_detail", async () => {
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

    const { data: detail } = await clientAOwnerClient.rpc(
      "get_client_invoice_detail",
      { target_invoice_id: draft.id },
    );
    assert.equal(detail, null);

    const { data: list } = await clientAOwnerClient.rpc("get_client_invoices");
    const ids = (list ?? []).map((invoice) => invoice.id);
    assert.ok(!ids.includes(draft.id));

    await admin.from("invoices").delete().eq("id", draft.id);
  });

  test("a client viewer can read invoices but cannot start a PayMongo checkout (owner/manager only)", async () => {
    const { data: viewData, error: viewError } = await clientAViewerClient.rpc(
      "get_client_invoice_detail",
      { target_invoice_id: sentInvoiceId },
    );
    assert.equal(viewError, null);
    assert.ok(viewData);

    const { error: payError } = await clientAViewerClient.rpc(
      "start_paymongo_checkout",
      {
        target_invoice_id: sentInvoiceId,
        p_amount: 5000,
        p_currency: "PHP",
        p_provider_reference: "cs_test_viewer_attempt",
        p_checkout_url: "https://checkout.paymongo.com/test",
      },
    );
    assert.ok(payError);
  });

  test("payments has no direct INSERT grant for authenticated users — a forged 'paid' row is rejected", async () => {
    const { error } = await internalAdminClient.from("payments").insert({
      organization_id: fixtures.orgA.id,
      client_id: fixtures.clientA.id,
      invoice_id: sentInvoiceId,
      amount: 999999,
      status: "paid",
      paid_at: new Date().toISOString(),
      provider: "manual",
    });
    assert.ok(error);
  });

  test("direct Supabase requests remain blocked by RLS even for a signed-in client attempting another client's invoice by id", async () => {
    const { data, error } = await clientBOwnerClient
      .from("invoices")
      .select("id")
      .eq("id", sentInvoiceId);
    assert.ok(error || (data ?? []).length === 0);
  });
});
