import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { createTestAdminClient, signInTestUser } from "../../phase8/helpers/supabase-clients.mjs";
import { cleanupPhase12Fixtures, createPhase12Fixtures } from "../helpers/factory.mjs";
import { reportArgs } from "../helpers/sessions.mjs";
import {
  assertTestProjectRef,
  getPhase12IntegrationSkipReason,
  hasPhase12IntegrationEnv,
} from "../helpers/test-env.mjs";

const byCurrency = (rows, currency) => rows.find((r) => r.currency === currency);

describe("F-102 revenue report", () => {
  if (!hasPhase12IntegrationEnv()) {
    test("Phase 12 revenue integration", (t) => {
      t.skip(getPhase12IntegrationSkipReason());
    });
    return;
  }

  let admin;
  let fixtures;
  let superAdmin;

  before(async () => {
    assertTestProjectRef();
    admin = createTestAdminClient();
    fixtures = await createPhase12Fixtures(admin);
    superAdmin = await signInTestUser(
      fixtures.users["super-admin-a"].email,
      fixtures.users["super-admin-a"].password,
    );
  });

  after(async () => {
    await cleanupPhase12Fixtures(admin, fixtures);
  });

  async function report(extra = {}) {
    const { data, error } = await superAdmin.rpc("get_revenue_report", reportArgs(extra));
    assert.equal(error, null, `report failed: ${JSON.stringify(error)}`);
    return data;
  }

  test("collected_in_period counts only paid payments whose paid_at is in range", async () => {
    const data = await report();
    // 5000 (i4) + 30000 (i5) + 50000 (i7, an invoice issued in February).
    // The May payment for i6 is excluded despite its invoice being in cohort.
    assert.equal(Number(byCurrency(data.collected_in_period, "PHP").total), 85000);
    assert.equal(Number(byCurrency(data.collected_in_period, "USD").total), 500);
  });

  test("cohort_billed uses only eligible invoices issued in range", async () => {
    const data = await report();
    // i3 + i4 + i5 + i6. The draft, the void and the February invoice are out.
    assert.equal(Number(byCurrency(data.invoice_cohort, "PHP").cohort_billed), 100000);
  });

  test("cohort_collected follows cohort invoices regardless of payment date", async () => {
    const data = await report();
    // 5000 + 30000 + 40000 -- including i6, settled in May, two months after
    // the window closed.
    assert.equal(Number(byCurrency(data.invoice_cohort, "PHP").cohort_collected), 75000);
  });

  test("cohort_collection_rate is exact and is NOT cash-over-accrual", async () => {
    const data = await report();
    const php = byCurrency(data.invoice_cohort, "PHP");
    assert.equal(Number(php.cohort_collection_rate), 0.75);
    assert.equal(Number(php.cohort_outstanding), 25000);

    // The discredited definition (collected_in_period / cohort_billed) would
    // be 0.85. It must appear nowhere.
    assert.notEqual(Number(php.cohort_collection_rate), 0.85);
  });

  test("a payment inside the range for an older invoice affects only collected_in_period", async () => {
    const data = await report();
    const collected = Number(byCurrency(data.collected_in_period, "PHP").total);
    const cohortCollected = Number(byCurrency(data.invoice_cohort, "PHP").cohort_collected);

    // i7's 50000 is in the cash figure but not the cohort figure.
    assert.equal(collected - cohortCollected, 10000); // 50000 in, 40000 out
  });

  test("the report declares its as-of-today basis", async () => {
    const data = await report();
    assert.equal(data.cohort_collection_rate_basis, "as_of_today");
  });

  test("draft and void invoices are excluded from every figure", async () => {
    const data = await report();
    const php = byCurrency(data.invoice_cohort, "PHP");
    // Including the 5000 draft or the 9000 void would move this off 100000.
    assert.equal(Number(php.cohort_billed), 100000);
    assert.equal(Number(byCurrency(data.ledger_open, "PHP").outstanding), 25000);
  });

  test("overdue derives from due_date and balance_due, not from invoices.status", async () => {
    const data = await report();
    const php = byCurrency(data.ledger_open, "PHP");

    // i3 is still stamped 'sent' but its due date has passed with a balance
    // outstanding; i4 has a balance but a future due date.
    assert.equal(Number(php.overdue), 10000);
    assert.equal(Number(php.outstanding), 25000);
    assert.notEqual(Number(php.overdue), Number(php.outstanding));

    const { data: rawStatus } = await admin
      .from("invoices")
      .select("status")
      .eq("id", fixtures.invoices.i3.id)
      .single();
    assert.equal(rawStatus.status, "sent", "fixture must keep the stale status for this test");
  });

  test("a refunded payment is counted separately and never netted into collected", async () => {
    const data = await report();
    assert.equal(data.refunded_count, 1);
    // 85000 already excludes the 1000 refund and the 2000 failed payment.
    assert.equal(Number(byCurrency(data.collected_in_period, "PHP").total), 85000);
  });

  test("provider split is exact", async () => {
    const data = await report();
    const manualPhp = data.provider_split.find((r) => r.provider === "manual" && r.currency === "PHP");
    const paymongoPhp = data.provider_split.find((r) => r.provider === "paymongo" && r.currency === "PHP");

    assert.equal(Number(manualPhp.collected), 55000); // 5000 + 50000
    assert.equal(Number(paymongoPhp.collected), 30000);
  });

  test("top clients and monthly series are exact", async () => {
    const data = await report();
    const php = data.top_clients.find((c) => c.currency === "PHP");
    assert.equal(Number(php.collected), 85000);
    assert.equal(php.client_id, fixtures.clientA1.id);

    const march = data.monthly_series.find((m) => m.month === "2026-03" && m.currency === "PHP");
    assert.equal(Number(march.collected), 85000);
  });

  test("MRR normalizes cycles and excludes the custom cycle", async () => {
    const data = await report();
    // 1000 monthly + 3000/3 quarterly + 12000/12 yearly = 3000.
    assert.equal(Number(byCurrency(data.mrr, "PHP").total), 3000);
    assert.equal(data.mrr_excluded_custom_cycle_count, 1);
    // Including the 5000 custom plan would give 8000.
    assert.notEqual(Number(byCurrency(data.mrr, "PHP").total), 8000);
  });

  test("currencies never merge across any money figure", async () => {
    const data = await report();
    for (const key of ["collected_in_period", "invoice_cohort", "ledger_open"]) {
      const currencies = data[key].map((r) => r.currency);
      assert.equal(new Set(currencies).size, currencies.length, `${key} has duplicate currency rows`);
    }
    assert.equal(Number(byCurrency(data.invoice_cohort, "USD").cohort_billed), 500);
    assert.equal(Number(byCurrency(data.invoice_cohort, "USD").cohort_collection_rate), 1);
  });

  test("the client filter narrows every figure", async () => {
    const data = await report({ p_client_id: fixtures.clientA2.id });
    // All invoices belong to clientA1, so clientA2 has no revenue at all.
    assert.deepEqual(data.collected_in_period, []);
    assert.deepEqual(data.invoice_cohort, []);
  });
});
