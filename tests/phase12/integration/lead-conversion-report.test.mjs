import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { createTestAdminClient, signInTestUser } from "../../phase8/helpers/supabase-clients.mjs";
import {
  cleanupPhase12Fixtures,
  createPhase12Fixtures,
  WINDOW_FROM,
  WINDOW_TO,
} from "../helpers/factory.mjs";
import { reportArgs } from "../helpers/sessions.mjs";
import {
  assertTestProjectRef,
  getPhase12IntegrationSkipReason,
  hasPhase12IntegrationEnv,
} from "../helpers/test-env.mjs";

describe("F-099 lead conversion report", () => {
  if (!hasPhase12IntegrationEnv()) {
    test("Phase 12 lead conversion integration", (t) => {
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
    const { data, error } = await superAdmin.rpc("get_lead_conversion_report", reportArgs(extra));
    assert.equal(error, null, `report failed: ${JSON.stringify(error)}`);
    return data;
  }

  test("created cohort counts only leads created inside the window", async () => {
    const data = await report();
    // 8 in-window leads; l9 (Feb) and l10 (May) excluded; l11 (Jan) excluded
    // from the cohort even though it converted inside the window.
    assert.equal(data.leads_created, 8);
    assert.equal(data.report_from, WINDOW_FROM);
    assert.equal(data.report_to, WINDOW_TO);
    assert.equal(data.timezone, "Asia/Manila");
  });

  test("conversion counts and rate are exact", async () => {
    const data = await report();
    assert.equal(data.leads_converted_from_cohort, 2);
    assert.equal(Number(data.conversion_rate), 0.25);
  });

  test("conversions_in_period is a separate cohort from leads_created", async () => {
    const data = await report();
    // l1 + l7 (created and converted in window) + l11 (created in January,
    // converted in window). Blending the two cohorts would give 2.
    assert.equal(data.conversions_in_period, 3);
    assert.notEqual(data.conversions_in_period, data.leads_converted_from_cohort);
  });

  test("won, lost and win rate are exact", async () => {
    const data = await report();
    assert.equal(data.won, 2);
    assert.equal(data.lost, 1);
    assert.equal(Number(data.win_rate), 0.6667);
  });

  test("won_not_converted surfaces the won-without-a-client gap", async () => {
    const data = await report();
    // l2 is status=won with converted_at still null.
    assert.equal(data.won_not_converted, 1);
  });

  test("average and median conversion durations are exact", async () => {
    const data = await report();
    // l1 converted in 10 days, l7 in 20 days.
    assert.equal(Number(data.avg_days_to_convert), 15);
    assert.equal(Number(data.median_days_to_convert), 15);
  });

  test("all eight funnel statuses are present and zero-filled", async () => {
    const data = await report();
    const byStatus = Object.fromEntries(data.funnel.map((b) => [b.status, b.total]));

    assert.deepEqual(Object.keys(byStatus).sort(), [
      "contacted", "discovery", "lost", "negotiation", "new", "proposal", "qualified", "won",
    ]);
    assert.equal(byStatus.new, 1);
    assert.equal(byStatus.contacted, 1);
    assert.equal(byStatus.discovery, 0, "an empty bucket must be present as 0, not absent");
    assert.equal(byStatus.qualified, 1);
    assert.equal(byStatus.proposal, 1);
    assert.equal(byStatus.negotiation, 1);
    assert.equal(byStatus.won, 2);
    assert.equal(byStatus.lost, 1);

    const total = Object.values(byStatus).reduce((sum, n) => sum + n, 0);
    assert.equal(total, data.leads_created, "funnel must partition the cohort");
  });

  test("the source filter narrows the cohort", async () => {
    const data = await report({ p_source: "website" });
    // l1 and l2 only.
    assert.equal(data.leads_created, 2);
    assert.equal(data.won, 2);
    assert.equal(data.leads_converted_from_cohort, 1);
  });

  test("the assigned-user filter narrows the cohort", async () => {
    const pmProfileId = fixtures.users["pm-a"].profileId;
    const data = await report({ p_assigned_to: pmProfileId });
    // l1 (won, converted) and l4 (qualified).
    assert.equal(data.leads_created, 2);
    assert.equal(data.leads_converted_from_cohort, 1);
    assert.equal(data.won, 1);
  });

  test("a window with no leads yields zero counts and null rates, never zero rates", async () => {
    const { data, error } = await superAdmin.rpc("get_lead_conversion_report", {
      p_from: "2025-01-01",
      p_to: "2025-01-31",
    });
    assert.equal(error, null);
    assert.equal(data.leads_created, 0);
    assert.equal(data.conversion_rate, null, "no data must be null, not 0");
    assert.equal(data.win_rate, null);
    assert.equal(data.avg_days_to_convert, null);
  });
});
