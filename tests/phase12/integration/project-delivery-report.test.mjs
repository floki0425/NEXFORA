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

const statusTotal = (buckets, status) =>
  buckets.find((b) => b.status === status)?.total ?? null;

describe("F-103 project delivery report", () => {
  if (!hasPhase12IntegrationEnv()) {
    test("Phase 12 project delivery integration", (t) => {
      t.skip(getPhase12IntegrationSkipReason());
    });
    return;
  }

  let admin;
  let fixtures;
  let superAdmin;
  let projectManager;

  before(async () => {
    assertTestProjectRef();
    admin = createTestAdminClient();
    fixtures = await createPhase12Fixtures(admin);
    superAdmin = await signInTestUser(
      fixtures.users["super-admin-a"].email,
      fixtures.users["super-admin-a"].password,
    );
    projectManager = await signInTestUser(
      fixtures.users["pm-a"].email,
      fixtures.users["pm-a"].password,
    );
  });

  after(async () => {
    await cleanupPhase12Fixtures(admin, fixtures);
  });

  async function report(client = superAdmin, extra = {}) {
    const { data, error } = await client.rpc("get_project_delivery_report", reportArgs(extra));
    assert.equal(error, null, `report failed: ${JSON.stringify(error)}`);
    return data;
  }

  test("active-by-status excludes completed and cancelled", async () => {
    const data = await report();
    assert.equal(statusTotal(data.active_by_status, "development"), 2);
    assert.equal(statusTotal(data.active_by_status, "planning"), 1);
    assert.equal(statusTotal(data.active_by_status, "design"), 1);
    assert.equal(statusTotal(data.active_by_status, "testing"), 1);
    assert.equal(statusTotal(data.active_by_status, "on_hold"), 0, "empty bucket must be 0, not absent");

    // The cancelled project and the three completed ones must not appear.
    const total = data.active_by_status.reduce((sum, b) => sum + b.total, 0);
    assert.equal(total, 5);
  });

  test("completed_in_period and the on-time rate are exact", async () => {
    const data = await report();
    assert.equal(data.completed_in_period, 3);
    assert.equal(data.on_schedule_count, 1);
    assert.equal(data.rated_count, 2);
    assert.equal(Number(data.schedule_on_time_rate), 0.5);
  });

  test("a project completed after its target date counts as late", async () => {
    const data = await report();
    // p1 on time, p2 late -> exactly one of two rated projects on schedule.
    assert.equal(data.rated_count - data.on_schedule_count, 1);
  });

  test("a null target_date is excluded from the rate and counted separately", async () => {
    const data = await report();
    assert.equal(data.no_target_date_count, 1);
    // Three completed but only two rated: the untargeted project cannot be
    // on or off schedule.
    assert.equal(data.completed_in_period - data.rated_count, 1);
    // Including it would have given 1/3.
    assert.notEqual(Number(data.schedule_on_time_rate), 0.3333);
  });

  test("average delivery days is exact", async () => {
    const data = await report();
    assert.equal(Number(data.avg_delivery_days), 77.33);
  });

  test("overdue active projects are counted", async () => {
    const data = await report();
    assert.equal(data.overdue_active_count, 1);
  });

  test("milestone completion and overdue milestones are exact", async () => {
    const data = await report();
    assert.equal(Number(data.milestone_completion_rate), 0.5);
    assert.equal(data.overdue_milestone_count, 1);
  });

  test("task counts are exact", async () => {
    const data = await report();
    assert.equal(data.tasks_completed_in_period, 1);
    assert.equal(statusTotal(data.open_tasks_by_status, "todo"), 1);
    assert.equal(statusTotal(data.open_tasks_by_status, "in_progress"), 1);
    assert.equal(statusTotal(data.open_tasks_by_status, "blocked"), 1);
    assert.equal(statusTotal(data.open_tasks_by_status, "review"), 0);
  });

  test("progress drift is reported and the stored column is never rewritten", async () => {
    const data = await report();
    const drift = data.progress_drift.find((d) => d.project_id === fixtures.projects.p5.id);

    assert.equal(drift.stored_progress_percent, 80);
    assert.equal(drift.derived_progress_percent, 25); // 1 of 4 tasks done
    assert.equal(drift.drift, 55);

    const { data: row } = await admin
      .from("projects")
      .select("progress_percent")
      .eq("id", fixtures.projects.p5.id)
      .single();
    assert.equal(row.progress_percent, 80, "a read-only report must not write progress_percent");
  });

  test("the metric is labelled Schedule On-Time Rate and carries its caveat", async () => {
    const data = await report();
    assert.equal(data.metric_label, "Schedule On-Time Rate");
    assert.match(data.metric_caveat, /schedule adherence only/i);
    assert.match(data.metric_caveat, /not use for performance review/i);
  });

  test("a project_manager sees ONLY projects where project_manager_id is their own profile", async () => {
    const data = await report(projectManager);

    // p7 is the only project they manage; it is in design.
    assert.equal(statusTotal(data.active_by_status, "design"), 1);
    const total = data.active_by_status.reduce((sum, b) => sum + b.total, 0);
    assert.equal(total, 1, "the PM must see exactly one active project");

    // They completed nothing, so the rate is undefined rather than zero.
    assert.equal(data.completed_in_period, 0);
    assert.equal(data.schedule_on_time_rate, null);
  });

  test("a project where the PM is only a project_members contributor is EXCLUDED", async () => {
    const pmData = await report(projectManager);
    const adminData = await report();

    // p8 (testing) is visible org-wide but the PM only contributes to it.
    assert.equal(statusTotal(adminData.active_by_status, "testing"), 1);
    assert.equal(
      statusTotal(pmData.active_by_status, "testing"),
      0,
      "can_manage_project would have included this; project_manager_id must not",
    );

    // Positive control: the contributor row genuinely exists.
    const { data: membership } = await admin
      .from("project_members")
      .select("id")
      .eq("project_id", fixtures.projects.p8.id)
      .eq("user_id", fixtures.users["pm-a"].profileId);
    assert.equal(membership.length, 1, "fixture must have the PM as a contributor on p8");
  });
});
