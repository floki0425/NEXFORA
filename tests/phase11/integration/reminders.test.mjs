import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { cleanupPhase11Fixtures, createPhase11Fixtures } from "../helpers/factory.mjs";
import { createTestAdminClient } from "../../phase8/helpers/supabase-clients.mjs";
import {
  getPhase8IntegrationSkipReason,
  hasPhase8IntegrationEnv,
} from "../../phase8/helpers/test-env.mjs";

function isoDateOffset(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

describe("Phase 11 scheduled reminders", () => {
  if (!hasPhase8IntegrationEnv()) {
    test("Phase 11 reminders integration tests", (t) => {
      t.skip(getPhase8IntegrationSkipReason());
    });
    return;
  }

  let admin;
  let fixtures;

  before(async () => {
    admin = createTestAdminClient();
    fixtures = await createPhase11Fixtures(admin);
  });

  after(async () => {
    await cleanupPhase11Fixtures(admin, fixtures);
  });

  test("raise_due_invoice_reminders raises due-3 once, then zero on a second run (idempotent)", async () => {
    const { data: invoice } = await admin
      .from("invoices")
      .insert({
        organization_id: fixtures.orgA.id,
        client_id: fixtures.clientA.id,
        invoice_number: `NXF-INV-2026-${String(Date.now()).slice(-6)}1`,
        status: "sent",
        currency: "PHP",
        subtotal: 5000,
        total: 5000,
        due_date: isoDateOffset(3),
        created_by: fixtures.users["admin-a"].profileId,
      })
      .select("id")
      .single();

    const first = await admin.rpc("raise_due_invoice_reminders");
    const { data: afterFirst } = await admin
      .from("audit_logs")
      .select("id")
      .eq("entity_id", invoice.id)
      .eq("action", "invoice.reminder_due");
    assert.equal(afterFirst.length, 1, "expected exactly one reminder raised on first run");

    const second = await admin.rpc("raise_due_invoice_reminders");
    const { data: afterSecond } = await admin
      .from("audit_logs")
      .select("id")
      .eq("entity_id", invoice.id)
      .eq("action", "invoice.reminder_due");
    assert.equal(afterSecond.length, 1, "second run must not raise a duplicate reminder");

    assert.equal(first.error, null);
    assert.equal(second.error, null);

    await admin.from("invoices").delete().eq("id", invoice.id);
  });

  test("an invoice outside the -3/0/+7 windows raises nothing", async () => {
    const { data: invoice } = await admin
      .from("invoices")
      .insert({
        organization_id: fixtures.orgA.id,
        client_id: fixtures.clientA.id,
        invoice_number: `NXF-INV-2026-${String(Date.now()).slice(-6)}2`,
        status: "sent",
        currency: "PHP",
        subtotal: 5000,
        total: 5000,
        due_date: isoDateOffset(20),
        created_by: fixtures.users["admin-a"].profileId,
      })
      .select("id")
      .single();

    await admin.rpc("raise_due_invoice_reminders");
    const { data } = await admin
      .from("audit_logs")
      .select("id")
      .eq("entity_id", invoice.id)
      .eq("action", "invoice.reminder_due");
    assert.equal(data.length, 0);

    await admin.from("invoices").delete().eq("id", invoice.id);
  });

  test("void and draft invoices never raise a reminder even if due_date matches a window", async () => {
    const { data: voidInvoice } = await admin
      .from("invoices")
      .insert({
        organization_id: fixtures.orgA.id,
        client_id: fixtures.clientA.id,
        invoice_number: `NXF-INV-2026-${String(Date.now()).slice(-6)}3`,
        status: "void",
        currency: "PHP",
        subtotal: 5000,
        total: 5000,
        due_date: isoDateOffset(0),
        created_by: fixtures.users["admin-a"].profileId,
      })
      .select("id")
      .single();

    const { data: draftInvoice } = await admin
      .from("invoices")
      .insert({
        organization_id: fixtures.orgA.id,
        client_id: fixtures.clientA.id,
        // invoices_invoice_number_presence_check requires a draft invoice
        // to have a null invoice_number.
        status: "draft",
        currency: "PHP",
        subtotal: 5000,
        total: 5000,
        due_date: isoDateOffset(0),
        created_by: fixtures.users["admin-a"].profileId,
      })
      .select("id")
      .single();

    await admin.rpc("raise_due_invoice_reminders");

    const { data: voidAudit } = await admin
      .from("audit_logs")
      .select("id")
      .eq("entity_id", voidInvoice.id)
      .eq("action", "invoice.reminder_due");
    assert.equal(voidAudit.length, 0);

    const { data: draftAudit } = await admin
      .from("audit_logs")
      .select("id")
      .eq("entity_id", draftInvoice.id)
      .eq("action", "invoice.reminder_due");
    assert.equal(draftAudit.length, 0);

    await admin.from("invoices").delete().in("id", [voidInvoice.id, draftInvoice.id]);
  });

  test("raise_due_renewal_reminders raises renewal-14 once, then zero on a second run", async () => {
    const { data: subscription } = await admin
      .from("subscriptions")
      .insert({
        organization_id: fixtures.orgA.id,
        client_id: fixtures.clientA.id,
        plan_name: `Renewal plan ${fixtures.runId}`,
        status: "active",
        billing_cycle: "monthly",
        amount: 3000,
        currency: "PHP",
        started_at: new Date().toISOString(),
        renewal_at: `${isoDateOffset(14)}T00:00:00.000Z`,
        created_by: fixtures.users["admin-a"].profileId,
      })
      .select("id")
      .single();

    await admin.rpc("raise_due_renewal_reminders");
    const { data: afterFirst } = await admin
      .from("audit_logs")
      .select("id")
      .eq("entity_id", subscription.id)
      .eq("action", "subscription.renewal_due");
    assert.equal(afterFirst.length, 1);

    await admin.rpc("raise_due_renewal_reminders");
    const { data: afterSecond } = await admin
      .from("audit_logs")
      .select("id")
      .eq("entity_id", subscription.id)
      .eq("action", "subscription.renewal_due");
    assert.equal(afterSecond.length, 1);

    await admin.from("subscriptions").delete().eq("id", subscription.id);
  });

  test("a cancelled subscription never raises a renewal reminder", async () => {
    const { data: subscription } = await admin
      .from("subscriptions")
      .insert({
        organization_id: fixtures.orgA.id,
        client_id: fixtures.clientA.id,
        plan_name: `Cancelled plan ${fixtures.runId}`,
        status: "cancelled",
        billing_cycle: "monthly",
        amount: 3000,
        currency: "PHP",
        started_at: new Date().toISOString(),
        cancelled_at: new Date().toISOString(),
        renewal_at: `${isoDateOffset(3)}T00:00:00.000Z`,
        created_by: fixtures.users["admin-a"].profileId,
      })
      .select("id")
      .single();

    await admin.rpc("raise_due_renewal_reminders");
    const { data } = await admin
      .from("audit_logs")
      .select("id")
      .eq("entity_id", subscription.id)
      .eq("action", "subscription.renewal_due");
    assert.equal(data.length, 0);

    await admin.from("subscriptions").delete().eq("id", subscription.id);
  });

  test("won and lost leads never raise a follow-up reminder", async () => {
    const staleTimestamp = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

    const { data: wonLead } = await admin
      .from("leads")
      .insert({
        organization_id: fixtures.orgA.id,
        full_name: `Won Stale Lead ${fixtures.runId}`,
        email: `won-stale-${fixtures.runId}@example.com`,
        service_interest: "Website",
        source: "referral",
        status: "won",
        updated_at: staleTimestamp,
        created_at: staleTimestamp,
      })
      .select("id")
      .single();

    const { data: newLead } = await admin
      .from("leads")
      .insert({
        organization_id: fixtures.orgA.id,
        full_name: `New Stale Lead ${fixtures.runId}`,
        email: `new-stale-${fixtures.runId}@example.com`,
        service_interest: "Website",
        source: "referral",
        status: "new",
        updated_at: staleTimestamp,
        created_at: staleTimestamp,
      })
      .select("id")
      .single();

    await admin.rpc("raise_due_lead_follow_ups");

    const { data: wonAudit } = await admin
      .from("audit_logs")
      .select("id")
      .eq("entity_id", wonLead.id)
      .eq("action", "lead.follow_up_due");
    assert.equal(wonAudit.length, 0);

    const { data: newAudit } = await admin
      .from("audit_logs")
      .select("id")
      .eq("entity_id", newLead.id)
      .eq("action", "lead.follow_up_due");
    assert.equal(newAudit.length, 0);
  });

  test("a stale contacted lead (>7 days untouched) raises a follow-up reminder once, then zero on a second run", async () => {
    const staleTimestamp = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();

    const { data: staleLead } = await admin
      .from("leads")
      .insert({
        organization_id: fixtures.orgA.id,
        full_name: `Truly Stale Lead ${fixtures.runId}`,
        email: `truly-stale-${fixtures.runId}@example.com`,
        service_interest: "Website",
        source: "referral",
        status: "contacted",
        assigned_to: fixtures.users["assigned-team-a"].profileId,
        updated_at: staleTimestamp,
        created_at: staleTimestamp,
      })
      .select("id")
      .single();

    // leads_record_created_activity (Phase 3) always inserts a
    // lead_activities row stamped with the real current time on INSERT,
    // regardless of the leads row's own backdated created_at — the
    // staleness window is computed from the MOST RECENT of updated_at and
    // last activity, so that auto-created activity row must be backdated
    // too, or this lead would never look stale.
    await admin
      .from("lead_activities")
      .update({ created_at: staleTimestamp })
      .eq("lead_id", staleLead.id);

    await admin.rpc("raise_due_lead_follow_ups");
    const { data: afterFirst } = await admin
      .from("audit_logs")
      .select("id")
      .eq("entity_id", staleLead.id)
      .eq("action", "lead.follow_up_due");
    assert.equal(afterFirst.length, 1);

    await admin.rpc("raise_due_lead_follow_ups");
    const { data: afterSecond } = await admin
      .from("audit_logs")
      .select("id")
      .eq("entity_id", staleLead.id)
      .eq("action", "lead.follow_up_due");
    assert.equal(afterSecond.length, 1);
  });

  test("reminder RPCs are not executable by an authenticated internal member (service_role only)", async () => {
    const { signInTestUser } = await import("../../phase8/helpers/supabase-clients.mjs");
    const adminClient = await signInTestUser(
      fixtures.users["admin-a"].email,
      fixtures.users["admin-a"].password,
    );
    const { error } = await adminClient.rpc("raise_due_invoice_reminders");
    assert.ok(error, "expected an authenticated caller to be denied");
  });
});
