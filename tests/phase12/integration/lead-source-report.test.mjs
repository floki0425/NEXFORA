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

const ALL_SOURCES = [
  "website", "facebook", "messenger", "email", "referral",
  "networking", "manual", "existing_client", "other",
];

describe("F-100 lead source report", () => {
  if (!hasPhase12IntegrationEnv()) {
    test("Phase 12 lead source integration", (t) => {
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

  async function sources(extra = {}) {
    const { data, error } = await superAdmin.rpc("get_lead_source_report", reportArgs(extra));
    assert.equal(error, null, `report failed: ${JSON.stringify(error)}`);
    return Object.fromEntries(data.sources.map((row) => [row.source, row]));
  }

  test("every supported source appears, including zero-count ones", async () => {
    const bySource = await sources();
    assert.deepEqual(Object.keys(bySource).sort(), [...ALL_SOURCES].sort());

    // A channel that produced nothing must be visibly dead, not absent.
    for (const dead of ["manual", "existing_client", "other"]) {
      assert.equal(bySource[dead].lead_count, 0);
      assert.equal(bySource[dead].conversion_rate, null, "0/0 must be null, not 0");
      assert.equal(bySource[dead].avg_lead_score, null);
    }
  });

  test("per-source counts are exact", async () => {
    const bySource = await sources();

    assert.equal(bySource.website.lead_count, 2);
    assert.equal(bySource.website.won_count, 2);
    assert.equal(bySource.website.converted_count, 1);
    assert.equal(bySource.website.qualified_count, 2);

    assert.equal(bySource.referral.lead_count, 2);
    assert.equal(bySource.referral.lost_count, 1);
    assert.equal(bySource.referral.qualified_count, 1);

    assert.equal(bySource.email.lead_count, 1);
    assert.equal(bySource.email.converted_count, 1);

    assert.equal(bySource.facebook.lead_count, 1);
    assert.equal(bySource.messenger.lead_count, 1);
    assert.equal(bySource.networking.lead_count, 1);
  });

  test("conversion rates and average lead score are exact", async () => {
    const bySource = await sources();
    assert.equal(Number(bySource.website.conversion_rate), 0.5);
    assert.equal(Number(bySource.email.conversion_rate), 1);
    assert.equal(Number(bySource.facebook.conversion_rate), 0);
    assert.equal(Number(bySource.website.avg_lead_score), 50);
  });

  test("first-touch attribution follows clients.source_lead_id", async () => {
    const bySource = await sources();
    const php = bySource.website.attributed_paid_total.find((t) => t.currency === "PHP");

    // Every settled payment for the client converted from the website lead:
    // 5000 + 30000 + 40000 + 50000. First-touch credits the whole
    // relationship to the originating channel.
    assert.equal(Number(php.total), 125000);

    // The email-sourced lead converted to a client with no invoices.
    assert.deepEqual(bySource.email.attributed_paid_total, []);
    assert.deepEqual(bySource.facebook.attributed_paid_total, []);
  });

  test("attributed currencies never merge", async () => {
    const bySource = await sources();
    const totals = bySource.website.attributed_paid_total;
    const currencies = totals.map((t) => t.currency).sort();

    assert.deepEqual(currencies, ["PHP", "USD"]);
    assert.equal(Number(totals.find((t) => t.currency === "USD").total), 500);
    // A merged sum would be 125500; separation is the whole point.
    assert.ok(!totals.some((t) => Number(t.total) === 125500));
  });

  test("the assigned-user filter narrows the cohort", async () => {
    const bySource = await sources({ p_assigned_to: fixtures.users["pm-a"].profileId });
    assert.equal(bySource.website.lead_count, 1);
    assert.equal(bySource.referral.lead_count, 1);
    assert.equal(bySource.email.lead_count, 0);
  });

  test("the report declares its attribution model", async () => {
    const { data } = await superAdmin.rpc("get_lead_source_report", reportArgs());
    assert.equal(data.attribution_model, "first_touch");
  });
});
