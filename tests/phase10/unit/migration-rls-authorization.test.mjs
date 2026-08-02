// Static checks for Phase 10 RLS and authorization repair. These assertions
// prevent broad membership policies from silently returning and complement
// live cross-role integration tests.

import assert from "node:assert/strict";
import test from "node:test";

import {
  occurrences,
  readBaseMigration,
  readFollowUpMigration,
  sliceSql,
} from "./migration-test-helpers.mjs";

test("RLS is enabled on every Phase 10 public table", async () => {
  const migration = await readBaseMigration();

  for (const table of [
    "support_tickets",
    "ticket_activities",
    "subscriptions",
    "subscription_usage",
  ]) {
    assert.match(
      migration,
      new RegExp(
        `alter table public\\.${table} enable row level security;`,
      ),
    );
  }
});

test("support SELECT is admin-wide, PM project/self-scoped, and team self-scoped", async () => {
  const migration = await readFollowUpMigration();
  const policy = sliceSql(
    migration,
    "create policy support_tickets_select_internal_members",
    "drop policy if exists support_tickets_update_assignment",
  );

  assert.match(policy, /array\['super_admin', 'admin'\]/);
  assert.match(policy, /array\['project_manager', 'team_member'\]/);
  assert.match(
    policy,
    /assigned_to = \(select private\.current_profile_id\(\)\)/,
  );
  assert.match(policy, /array\['project_manager'\]/);
  assert.match(
    policy,
    /private\.can_manage_project\(support_tickets\.project_id\)/,
  );
  assert.doesNotMatch(policy, /private\.is_internal_member/);
});

test("activity SELECT inherits the repaired support-ticket visibility boundary", async () => {
  const migration = await readFollowUpMigration();
  const policy = sliceSql(
    migration,
    "create policy ticket_activities_select_internal_members",
    "-- Maintenance RLS",
  );

  assert.match(policy, /from public\.support_tickets as ticket/);
  assert.match(policy, /ticket\.id = ticket_activities\.ticket_id/);
  assert.match(
    policy,
    /ticket\.organization_id = ticket_activities\.organization_id/,
  );
  assert.doesNotMatch(policy, /private\.is_internal_member/);
});

test("assignment UPDATE checks scoped authorization on both old and resulting rows", async () => {
  const migration = await readFollowUpMigration();
  const policy = sliceSql(
    migration,
    "create policy support_tickets_update_assignment",
    "drop policy if exists ticket_activities_select_internal_members",
  );

  assert.equal(
    occurrences(
      policy,
      /support_tickets\.assigned_to = \(select private\.current_profile_id\(\)\)/g,
    ),
    2,
    "self-assignment scope must appear in USING and WITH CHECK",
  );
  assert.equal(
    occurrences(
      policy,
      /private\.can_manage_project\(support_tickets\.project_id\)/g,
    ),
    2,
    "manageable-project scope must appear in USING and WITH CHECK",
  );
  assert.equal(
    occurrences(policy, /array\['project_manager'\]/g),
    2,
    "project-manager role must be independently checked before and after",
  );
  assert.doesNotMatch(policy, /team_member/);
  assert.match(
    policy,
    /support_tickets\.status <> 'assigned'\s+or support_tickets\.assigned_to is not null/,
  );
  assert.match(
    policy,
    /assignee_membership\.organization_id = support_tickets\.organization_id/,
  );
  assert.match(policy, /assignee_membership\.status = 'active'/);
});

test("transition RPC independently enforces admin, scoped PM, and assigned team access", async () => {
  const migration = await readFollowUpMigration();
  const section = sliceSql(
    migration,
    "create or replace function public.transition_ticket_status",
    "is_allowed_transition := (",
  );

  assert.match(section, /array\['super_admin', 'admin'\]/);
  assert.match(section, /array\['project_manager', 'team_member'\]/);
  assert.match(section, /ticket\.assigned_to = actor_profile_id/);
  assert.match(section, /array\['project_manager'\]/);
  assert.match(
    section,
    /private\.can_manage_project\(ticket\.project_id\)/,
  );
  assert.match(section, /for update;/);
  assert.doesNotMatch(section, /private\.is_internal_member/);
});

test("subscription SELECT permits admins or PMs on manageable linked projects only", async () => {
  const migration = await readFollowUpMigration();
  const policy = sliceSql(
    migration,
    "create policy subscriptions_select_internal_members",
    "drop policy if exists subscription_usage_select_internal_members",
  );

  assert.match(policy, /array\['super_admin', 'admin'\]/);
  assert.match(policy, /subscriptions\.project_id is not null/);
  assert.match(policy, /array\['project_manager'\]/);
  assert.match(
    policy,
    /private\.can_manage_project\(subscriptions\.project_id\)/,
  );
  assert.doesNotMatch(policy, /team_member|private\.is_internal_member/);
});

test("usage SELECT inherits subscription visibility, leaving team members no direct path", async () => {
  const migration = await readFollowUpMigration();
  const policy = sliceSql(
    migration,
    "create policy subscription_usage_select_internal_members",
    "drop policy if exists subscription_usage_insert_managers",
  );

  assert.match(policy, /from public\.subscriptions as subscription/);
  assert.match(
    policy,
    /subscription\.id = subscription_usage\.subscription_id/,
  );
  assert.match(
    policy,
    /subscription\.organization_id = subscription_usage\.organization_id/,
  );
  assert.doesNotMatch(policy, /team_member|private\.is_internal_member/);
});

test("usage INSERT allows admins or PMs on manageable linked projects and fixes the actor", async () => {
  const migration = await readFollowUpMigration();
  const policy = sliceSql(
    migration,
    "create policy subscription_usage_insert_managers",
    null,
  );

  assert.match(
    policy,
    /recorded_by = \(select private\.current_profile_id\(\)\)/,
  );
  assert.match(policy, /array\['super_admin', 'admin'\]/);
  assert.match(policy, /subscription\.project_id is not null/);
  assert.match(policy, /array\['project_manager'\]/);
  assert.match(
    policy,
    /private\.can_manage_project\(subscription\.project_id\)/,
  );
  assert.doesNotMatch(policy, /team_member|private\.is_internal_member/);
});

test("follow-up replaces each broad policy instead of adding permissive alternatives", async () => {
  const migration = await readFollowUpMigration();
  const policyNames = [
    "support_tickets_select_internal_members",
    "support_tickets_update_assignment",
    "ticket_activities_select_internal_members",
    "subscriptions_select_internal_members",
    "subscription_usage_select_internal_members",
    "subscription_usage_insert_managers",
  ];

  for (const policy of policyNames) {
    assert.match(
      migration,
      new RegExp(`drop policy if exists ${policy}\\s+on public\\.`),
    );
    assert.equal(
      occurrences(migration, new RegExp(`create policy ${policy}\\b`, "g")),
      1,
    );
  }

  assert.doesNotMatch(migration, /using\s*\(\s*true\s*\)/i);
  assert.doesNotMatch(migration, /with check\s*\(\s*true\s*\)/i);
});
