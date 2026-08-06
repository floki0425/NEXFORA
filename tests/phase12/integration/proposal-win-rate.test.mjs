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

describe("F-101 proposal win rate report", () => {
  if (!hasPhase12IntegrationEnv()) {
    test("Phase 12 proposal win rate integration", (t) => {
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
    const { data, error } = await superAdmin.rpc("get_proposal_win_rate_report", reportArgs(extra));
    assert.equal(error, null, `report failed: ${JSON.stringify(error)}`);
    return data;
  }

  test("the cohort is keyed on sent_at, excluding drafts and out-of-window sends", async () => {
    const data = await report();
    // 7 sent inside the window. The draft (never sent) and the February send
    // are both excluded.
    assert.equal(data.sent, 7);
  });

  test("outcome counts are exact", async () => {
    const data = await report();
    assert.equal(data.accepted, 2);
    assert.equal(data.declined, 1);
    assert.equal(data.expired, 1);
    assert.equal(data.changes_requested, 1);
    assert.equal(data.viewed, 1);
  });

  test("win_rate_decided is accepted / (accepted + declined) and EXCLUDES expired", async () => {
    const data = await report();
    // 2 / (2 + 1) -- the single expired proposal is not in this denominator.
    assert.equal(Number(data.win_rate_decided), 0.6667);
  });

  test("win_rate_sent is accepted / all sent, so expired DOES dilute it", async () => {
    const data = await report();
    assert.equal(Number(data.win_rate_sent), 0.2857); // 2 / 7

    // The two rates must genuinely differ; if expired were treated as a
    // decline they would converge.
    assert.notEqual(Number(data.win_rate_sent), Number(data.win_rate_decided));
    assert.ok(Number(data.win_rate_sent) < Number(data.win_rate_decided));
  });

  test("view rate is exact", async () => {
    const data = await report();
    assert.equal(Number(data.view_rate), 0.1429); // 1 / 7
  });

  test("accepted_in_period is bucketed by accepted_at", async () => {
    const data = await report();
    // pr4 (18 Mar) and pr9 (22 Mar). pr8 accepted in February is excluded.
    assert.equal(data.accepted_in_period, 2);
  });

  test("average decision duration is exact", async () => {
    const data = await report();
    // 10, 5 and 10 days -> 25/3.
    assert.equal(Number(data.avg_days_to_decision), 8.33);
  });

  test("pipeline, won and average-won totals are exact per currency", async () => {
    const data = await report();
    const php = data.value_by_currency.find((v) => v.currency === "PHP");

    assert.equal(Number(php.pipeline_total), 210000);
    assert.equal(Number(php.won_total), 30000);
    assert.equal(Number(php.avg_won_total), 30000);
  });

  test("currencies remain separated and are never summed", async () => {
    const data = await report();
    const currencies = data.value_by_currency.map((v) => v.currency).sort();
    assert.deepEqual(currencies, ["PHP", "USD"]);

    const usd = data.value_by_currency.find((v) => v.currency === "USD");
    assert.equal(Number(usd.pipeline_total), 1000);
    assert.equal(Number(usd.won_total), 1000);

    // A merged pipeline would be 211000.
    assert.ok(!data.value_by_currency.some((v) => Number(v.pipeline_total) === 211000));
  });

  test("the created_by filter narrows the cohort", async () => {
    const data = await report({ p_created_by: fixtures.users["pm-a"].profileId });
    // Only the USD proposal was created by the project manager.
    assert.equal(data.sent, 1);
    assert.equal(data.accepted, 1);
    assert.equal(Number(data.win_rate_sent), 1);
    assert.deepEqual(
      data.value_by_currency.map((v) => v.currency),
      ["USD"],
    );
  });

  test("an empty window yields null rates, not zero", async () => {
    const { data } = await superAdmin.rpc("get_proposal_win_rate_report", {
      p_from: "2025-01-01",
      p_to: "2025-01-31",
    });
    assert.equal(data.sent, 0);
    assert.equal(data.win_rate_decided, null);
    assert.equal(data.win_rate_sent, null);
    assert.deepEqual(data.value_by_currency, []);
  });
});
