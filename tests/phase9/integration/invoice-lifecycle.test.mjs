// Section: invoice creation, numbering, and draft/sent editability, against
// a real, dedicated non-production Supabase project. Skips (not passes, not
// fails) when TEST_SUPABASE_* is not configured; see
// docs/PHASE_9_INVOICES_PAYMENTS_SETUP.md.

import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { cleanupPhase9Fixtures, createPhase9Fixtures } from "../helpers/factory.mjs";
import {
  createTestAdminClient,
  signInTestUser,
} from "../../phase8/helpers/supabase-clients.mjs";
import {
  getPhase8IntegrationSkipReason,
  hasPhase8IntegrationEnv,
} from "../../phase8/helpers/test-env.mjs";

describe("Phase 9 invoice lifecycle", () => {
  if (!hasPhase8IntegrationEnv()) {
    test("Phase 9 invoice lifecycle integration tests", (t) => {
      t.skip(getPhase8IntegrationSkipReason());
    });
    return;
  }

  let admin;
  let fixtures;
  let internalAdminClient;
  let projectManagerClient;

  before(async () => {
    admin = createTestAdminClient();
    fixtures = await createPhase9Fixtures(admin);
    internalAdminClient = await signInTestUser(
      fixtures.internalAdmin.email,
      fixtures.internalAdmin.password,
    );
    projectManagerClient = await signInTestUser(
      fixtures.projectManager.email,
      fixtures.projectManager.password,
    );
  });

  after(async () => {
    await cleanupPhase9Fixtures(admin, fixtures);
  });

  async function createDraftInvoice(client, overrides = {}) {
    return client
      .from("invoices")
      .insert({
        organization_id: fixtures.orgA.id,
        client_id: fixtures.clientA.id,
        due_date: "2026-12-31",
        discount: 0,
        tax: 0,
        created_by: fixtures.internalAdmin.profileId,
        ...overrides,
      })
      .select("id, status, invoice_number")
      .single();
  }

  test("admin can create a draft invoice with no invoice_number yet", async () => {
    const { data, error } = await createDraftInvoice(internalAdminClient);
    assert.equal(error, null);
    assert.equal(data.status, "draft");
    assert.equal(data.invoice_number, null);
  });

  test("project_manager cannot create an invoice directly (RLS restricts insert to super_admin/admin)", async () => {
    const { error } = await createDraftInvoice(projectManagerClient);
    assert.ok(error);
  });

  test("project_manager can still read invoices in their organization", async () => {
    const { data: created } = await createDraftInvoice(internalAdminClient);
    const { data, error } = await projectManagerClient
      .from("invoices")
      .select("id")
      .eq("id", created.id)
      .maybeSingle();
    assert.equal(error, null);
    assert.ok(data);
  });

  test("sending assigns a sequential official number in the documented format", async () => {
    const { data: invoice } = await createDraftInvoice(internalAdminClient);
    await internalAdminClient.from("invoice_items").insert({
      invoice_id: invoice.id,
      description: "Website design",
      quantity: 1,
      unit_price: 50000,
    });

    const { data: sendResult, error } = await internalAdminClient.rpc(
      "send_invoice",
      { target_invoice_id: invoice.id },
    );
    assert.equal(error, null);
    assert.match(sendResult[0].invoice_number, /^NXF-INV-\d{4}-\d{4,}$/);

    const { data: row } = await admin
      .from("invoices")
      .select("status, invoice_number, issue_date")
      .eq("id", invoice.id)
      .single();
    assert.equal(row.status, "sent");
    assert.equal(row.invoice_number, sendResult[0].invoice_number);
    assert.ok(row.issue_date);
  });

  test("two invoices sent back-to-back in the same organization get distinct, increasing numbers", async () => {
    async function createAndSend() {
      const { data: invoice } = await createDraftInvoice(internalAdminClient);
      await internalAdminClient.from("invoice_items").insert({
        invoice_id: invoice.id,
        description: "Line item",
        quantity: 1,
        unit_price: 1000,
      });
      const { data } = await internalAdminClient.rpc("send_invoice", {
        target_invoice_id: invoice.id,
      });
      return data[0].invoice_number;
    }

    const first = await createAndSend();
    const second = await createAndSend();
    assert.notEqual(first, second);

    const firstSeq = Number(first.split("-").pop());
    const secondSeq = Number(second.split("-").pop());
    assert.ok(secondSeq > firstSeq);
  });

  test("sending without any line items fails", async () => {
    const { data: invoice } = await createDraftInvoice(internalAdminClient);
    const { error } = await internalAdminClient.rpc("send_invoice", {
      target_invoice_id: invoice.id,
    });
    assert.ok(error);
  });

  test("sending without a due date fails", async () => {
    const { data: invoice } = await createDraftInvoice(internalAdminClient, {
      due_date: null,
    });
    await internalAdminClient.from("invoice_items").insert({
      invoice_id: invoice.id,
      description: "Line item",
      quantity: 1,
      unit_price: 1000,
    });
    const { error } = await internalAdminClient.rpc("send_invoice", {
      target_invoice_id: invoice.id,
    });
    assert.ok(error);
  });

  test("sending with a past due date fails", async () => {
    const { data: invoice } = await createDraftInvoice(internalAdminClient, {
      due_date: "2020-01-01",
    });
    await internalAdminClient.from("invoice_items").insert({
      invoice_id: invoice.id,
      description: "Line item",
      quantity: 1,
      unit_price: 1000,
    });
    const { error } = await internalAdminClient.rpc("send_invoice", {
      target_invoice_id: invoice.id,
    });
    assert.ok(error);
  });

  test("a sent invoice can no longer be edited directly (RLS blocks the update)", async () => {
    const { data: invoice } = await createDraftInvoice(internalAdminClient);
    await internalAdminClient.from("invoice_items").insert({
      invoice_id: invoice.id,
      description: "Line item",
      quantity: 1,
      unit_price: 1000,
    });
    await internalAdminClient.rpc("send_invoice", {
      target_invoice_id: invoice.id,
    });

    const { data, error } = await internalAdminClient
      .from("invoices")
      .update({ discount: 500 })
      .eq("id", invoice.id)
      .select("id")
      .maybeSingle();
    assert.equal(error, null);
    assert.equal(data, null);

    const { data: unchanged } = await admin
      .from("invoices")
      .select("discount")
      .eq("id", invoice.id)
      .single();
    assert.equal(unchanged.discount, 0);
  });

  test("line items cannot be added once the invoice has been sent (RLS blocks the insert)", async () => {
    const { data: invoice } = await createDraftInvoice(internalAdminClient);
    await internalAdminClient.from("invoice_items").insert({
      invoice_id: invoice.id,
      description: "Line item",
      quantity: 1,
      unit_price: 1000,
    });
    await internalAdminClient.rpc("send_invoice", {
      target_invoice_id: invoice.id,
    });

    const { error } = await internalAdminClient.from("invoice_items").insert({
      invoice_id: invoice.id,
      description: "Sneaky extra item",
      quantity: 1,
      unit_price: 999999,
    });
    assert.ok(error);
  });

  test("subtotal and total are recomputed server-side from line items, never trusted from an insert", async () => {
    const { data: invoice, error: createError } = await createDraftInvoice(
      internalAdminClient,
      { discount: 100, tax: 50 },
    );
    assert.equal(createError, null, createError?.message);
    const { error: itemsError } = await internalAdminClient
      .from("invoice_items")
      .insert([
        { invoice_id: invoice.id, description: "Item A", quantity: 2, unit_price: 500 },
        { invoice_id: invoice.id, description: "Item B", quantity: 1, unit_price: 250 },
      ]);
    assert.equal(itemsError, null, itemsError?.message);

    const { data: row } = await admin
      .from("invoices")
      .select("subtotal, discount, tax, total, balance_due")
      .eq("id", invoice.id)
      .single();
    assert.equal(row.subtotal, 1250);
    assert.equal(row.total, 1200);
    assert.equal(row.balance_due, 1200);
  });

  test("void_invoice can void a draft invoice, and it can never be sent afterward", async () => {
    const { data: invoice } = await createDraftInvoice(internalAdminClient);
    const { error: voidError } = await internalAdminClient.rpc("void_invoice", {
      target_invoice_id: invoice.id,
    });
    assert.equal(voidError, null);

    await internalAdminClient.from("invoice_items").insert({
      invoice_id: invoice.id,
      description: "Line item",
      quantity: 1,
      unit_price: 1000,
    });
    const { error: sendError } = await internalAdminClient.rpc("send_invoice", {
      target_invoice_id: invoice.id,
    });
    assert.ok(sendError);
  });

  test("project_manager cannot send or void an invoice", async () => {
    const { data: invoice } = await createDraftInvoice(internalAdminClient);
    await internalAdminClient.from("invoice_items").insert({
      invoice_id: invoice.id,
      description: "Line item",
      quantity: 1,
      unit_price: 1000,
    });

    const { error: sendError } = await projectManagerClient.rpc("send_invoice", {
      target_invoice_id: invoice.id,
    });
    assert.ok(sendError);

    const { error: voidError } = await projectManagerClient.rpc("void_invoice", {
      target_invoice_id: invoice.id,
    });
    assert.ok(voidError);
  });
});
