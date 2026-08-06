import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  compactSql,
  extractFunctionDefinition,
  readReportingMigration,
  stripSqlComments,
} from "../helpers/migration-test-helpers.mjs";

// Reference implementations of every rate the reports compute. These encode
// the agreed definition independently of the SQL, so a change to either side
// has to be a deliberate change to both.

function rate(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator;
}

const conversionRate = (converted, created) => rate(converted, created);
const winRate = (won, lost) => rate(won, won + lost);
const winRateDecided = (accepted, declined) => rate(accepted, accepted + declined);
const winRateSent = (accepted, sent) => rate(accepted, sent);
const cohortCollectionRate = (collected, billed) => rate(collected, billed);
const scheduleOnTimeRate = (onSchedule, rated) => rate(onSchedule, rated);

describe("Phase 12A metric definitions", () => {
  test("every rate returns null, not zero, on a zero denominator", () => {
    assert.equal(conversionRate(0, 0), null);
    assert.equal(winRate(0, 0), null);
    assert.equal(winRateDecided(0, 0), null);
    assert.equal(winRateSent(0, 0), null);
    assert.equal(cohortCollectionRate(0, 0), null);
    assert.equal(scheduleOnTimeRate(0, 0), null);

    // A genuine zero is still zero -- "no data" and "zero percent" differ.
    assert.equal(conversionRate(0, 10), 0);
    assert.equal(scheduleOnTimeRate(0, 4), 0);
  });

  test("conversion and win rates compute as agreed", () => {
    assert.equal(conversionRate(3, 12), 0.25);
    assert.equal(winRate(6, 2), 0.75);
  });

  test("expired proposals are excluded from win_rate_decided but dilute win_rate_sent", () => {
    // 10 sent: 4 accepted, 2 declined, 3 expired, 1 still open.
    const accepted = 4;
    const declined = 2;
    const sent = 10;

    assert.equal(winRateDecided(accepted, declined), 4 / 6);
    assert.equal(winRateSent(accepted, sent), 0.4);

    // Adding an expired proposal must not move the headline rate.
    const withMoreExpired = winRateDecided(accepted, declined);
    assert.equal(withMoreExpired, 4 / 6);
  });

  test("schedule on-time rate excludes projects with no target date from its denominator", () => {
    // 5 completed: 3 on schedule, 1 late, 1 with no target date.
    const onSchedule = 3;
    const rated = 4;

    assert.equal(scheduleOnTimeRate(onSchedule, rated), 0.75);
    assert.notEqual(
      scheduleOnTimeRate(onSchedule, 5),
      scheduleOnTimeRate(onSchedule, rated),
      "including untargeted projects would understate the rate",
    );
  });

  test("cohort collection rate counts payments against cohort invoices whenever they landed", () => {
    // Billed 100 in the window; 60 settled during it, 25 settled afterwards.
    const cohortBilled = 100;
    const cohortCollected = 85;
    const collectedInPeriod = 60;

    assert.equal(cohortCollectionRate(cohortCollected, cohortBilled), 0.85);
    assert.notEqual(
      rate(collectedInPeriod, cohortBilled),
      cohortCollectionRate(cohortCollected, cohortBilled),
      "cash-in-period over accrual-billed is a different, wrong number",
    );
  });

  test("SQL divides through nullif everywhere -- no bare division by a count", async () => {
    const migration = await readReportingMigration();
    const compacted = compactSql(migration);

    const divisions = [...compacted.matchAll(/::numeric\s*\//g)].length;
    const guarded = [...compacted.matchAll(/::numeric\s*\/\s*nullif\(/g)].length;

    assert.ok(divisions > 0, "expected the reports to compute rates");
    assert.equal(
      divisions,
      guarded,
      "every rate division must be guarded by nullif(denominator, 0)",
    );
  });

  test("SQL never divides cash-in-period by cohort-billed", async () => {
    const migration = await readReportingMigration();
    const revenue = compactSql(
      extractFunctionDefinition(migration, "public.get_revenue_report"),
    );

    // The rate must be built from cohort_collected, never from the
    // window's cash total. Mixing bases across cohorts was the original bug.
    assert.ok(
      revenue.includes(
        "cohort_settlement.cohort_collected / nullif(cohort_settlement.cohort_billed, 0)",
      ),
      "cohort rate must use cohort_collected over cohort_billed",
    );
    assert.ok(
      !/collected_in_period[^,]*\/\s*nullif\([^)]*cohort_billed/.test(revenue),
      "collected_in_period must never be divided by cohort_billed",
    );
  });

  test("revenue collection is sourced from payments, and void/draft invoices are excluded", async () => {
    const migration = await readReportingMigration();
    const revenue = compactSql(
      extractFunctionDefinition(migration, "public.get_revenue_report"),
    );

    assert.ok(
      revenue.includes("from public.payments as payment") &&
        revenue.includes("payment.status = 'paid'"),
      "collected must come from settled payment rows",
    );
    assert.ok(
      revenue.includes("invoice.status not in ('draft', 'void')"),
      "draft and void invoices must be excluded from the cohort",
    );
    assert.ok(
      revenue.includes("private.effective_invoice_status("),
      "overdue must be derived, not read from invoices.status",
    );
    assert.ok(
      revenue.includes("payment.status = 'refunded'"),
      "refunds must be counted separately",
    );
    assert.ok(
      revenue.includes("subscription.billing_cycle <> 'custom'"),
      "custom billing cycles must be excluded from MRR",
    );
    assert.ok(
      revenue.includes("'cohort_collection_rate_basis', 'as_of_today'"),
      "the payload must declare the cohort rate's as-of-today basis",
    );
  });

  test("lead conversion keys on converted_at and surfaces the won-but-not-converted gap", async () => {
    const migration = await readReportingMigration();
    const leads = compactSql(
      extractFunctionDefinition(migration, "public.get_lead_conversion_report"),
    );

    assert.ok(
      leads.includes("cohort.converted_at is not null"),
      "conversion must key on converted_at",
    );
    assert.ok(
      leads.includes("cohort.status = 'won' and cohort.converted_at is null"),
      "won-without-a-client-record must be reported, not hidden",
    );
  });

  test("all report windows are bucketed in Asia/Manila", async () => {
    // Executable SQL only -- the header comment names profiles.timezone in
    // order to explain why it is deliberately not used.
    const migration = stripSqlComments(await readReportingMigration());

    assert.ok(
      migration.includes("at time zone 'Asia/Manila'"),
      "report windows must be Manila-based",
    );
    assert.ok(
      !migration.includes("profiles.timezone"),
      "reports must not bucket on a per-viewer timezone",
    );
  });

  test("the delivery report carries its schedule-adherence caveat in the payload", async () => {
    const migration = await readReportingMigration();
    const delivery = extractFunctionDefinition(
      migration,
      "public.get_project_delivery_report",
    );

    assert.ok(delivery.includes("'metric_label', 'Schedule On-Time Rate'"));
    assert.ok(
      delivery.includes("Do not use for performance review."),
      "the caveat must travel with the data, not only live in docs",
    );
    assert.ok(
      delivery.includes("'schedule_on_time_rate'"),
      "the metric key must be schedule_on_time_rate",
    );
  });
});
