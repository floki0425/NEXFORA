// Static checks for maintenance subscription constraints, append-only usage,
// live hour calculations, and curated client-facing RPC fields.

import assert from "node:assert/strict";
import test from "node:test";

import {
  readBaseMigration,
  readFollowUpMigration,
  sliceSql,
} from "./migration-test-helpers.mjs";

test("subscription money, cycle, status, and included hours are constrained", async () => {
  const migration = await readBaseMigration();
  const table = sliceSql(
    migration,
    "create table public.subscriptions",
    "create index subscriptions_organization_updated_idx",
  );

  assert.match(table, /amount numeric\(14, 2\) not null default 0/);
  assert.match(table, /check \(amount >= 0\)/);
  assert.match(
    table,
    /billing_cycle in \('monthly', 'quarterly', 'yearly', 'custom'\)/,
  );
  assert.match(
    table,
    /status in \('trial', 'active', 'past_due', 'paused', 'cancelled', 'expired'\)/,
  );
  assert.match(
    table,
    /included_hours is null or included_hours >= 0/,
  );
  assert.match(
    table,
    /\(status = 'cancelled'\) = \(cancelled_at is not null\)/,
  );
});

test("usage rows require a positive bounded amount and non-blank description", async () => {
  const migration = await readBaseMigration();
  const table = sliceSql(
    migration,
    "create table public.subscription_usage",
    "create index subscription_usage_subscription_date_idx",
  );

  assert.match(table, /hours_used numeric\(8, 2\) not null/);
  assert.match(table, /hours_used > 0 and hours_used <= 1000/);
  assert.match(
    table,
    /btrim\(description\) <> '' and char_length\(description\) <= 2000/,
  );
  assert.match(table, /usage_date date not null/);
});

test("follow-up enforces a formatter-safe three-letter currency code", async () => {
  const migration = await readFollowUpMigration();

  assert.match(
    migration,
    /constraint subscriptions_currency_format\s+check \(currency ~ '\^\[A-Z\]\{3\}\$'\)/,
  );
  assert.match(
    migration,
    /where subscription\.currency !~ '\^\[A-Z\]\{3\}\$'/,
  );
});

test("usage has a composite subscription/organization relationship", async () => {
  const migration = await readBaseMigration();

  assert.match(
    migration,
    /constraint subscriptions_id_organization_id_key\s+unique \(id, organization_id\)/,
  );
  assert.match(
    migration,
    /constraint subscription_usage_subscription_org_fkey\s+foreign key \(subscription_id, organization_id\)\s+references public\.subscriptions \(id, organization_id\)/,
  );
});

test("authenticated usage writes are append-only with no update or delete policy", async () => {
  const migration = await readBaseMigration();
  const policies = sliceSql(migration, "-- Row Level Security", "-- Grants");
  const grants = sliceSql(migration, "-- Grants", null);

  assert.match(policies, /create policy subscription_usage_insert_managers/);
  assert.doesNotMatch(
    policies,
    /create policy subscription_usage_(update|delete)/,
  );
  assert.match(
    grants,
    /grant insert \([\s\S]*organization_id,[\s\S]*subscription_id,[\s\S]*description,[\s\S]*hours_used,[\s\S]*usage_date,[\s\S]*recorded_by[\s\S]*\) on public\.subscription_usage to authenticated;/,
  );
  assert.doesNotMatch(
    grants,
    /grant (update|delete)[\s\S]{0,120}public\.subscription_usage to authenticated/,
  );
});

test("used and remaining hours are calculated live from the usage ledger", async () => {
  const migration = await readBaseMigration();
  const section = sliceSql(
    migration,
    "create or replace function public.get_client_subscriptions",
    "revoke all on function public.get_client_subscriptions",
  );

  assert.match(
    section,
    /select entry\.subscription_id, sum\(entry\.hours_used\) as total_hours/,
  );
  assert.match(
    section,
    /coalesce\(usage\.total_hours, 0\) as used_hours/,
  );
  assert.match(
    section,
    /subscription\.included_hours - coalesce\(usage\.total_hours, 0\)/,
  );
  assert.doesNotMatch(section, /update public\.subscriptions/);
});

test("client subscription summary omits internal notes, tenant IDs, and actor IDs", async () => {
  const migration = await readBaseMigration();
  const section = sliceSql(
    migration,
    "create or replace function public.get_client_subscriptions",
    "revoke all on function public.get_client_subscriptions",
  );
  const returnsContract = section.slice(
    section.indexOf("returns table"),
    section.indexOf("language sql"),
  );

  assert.match(returnsContract, /included_hours numeric/);
  assert.match(returnsContract, /used_hours numeric/);
  assert.match(returnsContract, /remaining_hours numeric/);
  assert.doesNotMatch(
    returnsContract,
    /notes|organization_id|client_id|created_by/,
  );
  assert.match(
    section,
    /subscription\.client_id = \(select private\.active_client_id\(\)\)/,
  );
});

test("client usage history is ownership-filtered and omits recorder/tenant fields", async () => {
  const migration = await readBaseMigration();
  const section = sliceSql(
    migration,
    "create or replace function public.get_client_subscription_usage",
    "revoke all on function public.get_client_subscription_usage",
  );
  const returnsContract = section.slice(
    section.indexOf("returns table"),
    section.indexOf("language sql"),
  );

  assert.match(returnsContract, /description text/);
  assert.match(returnsContract, /hours_used numeric/);
  assert.match(returnsContract, /usage_date date/);
  assert.doesNotMatch(
    returnsContract,
    /organization_id|subscription_id|recorded_by/,
  );
  assert.match(
    section,
    /subscription\.client_id = \(select private\.active_client_id\(\)\)/,
  );
});

test("portal subscription RPCs are authenticated-only and base tables stay policy-isolated", async () => {
  const migration = await readBaseMigration();

  for (const signature of [
    "public.get_client_subscriptions()",
    "public.get_client_subscription_usage(uuid)",
  ]) {
    const privileges = sliceSql(
      migration,
      `revoke all on function ${signature}`,
      "-- ---",
    );
    assert.match(privileges, /from public, anon, authenticated;/);
    assert.match(privileges, /to authenticated;/);
  }

  const policies = sliceSql(migration, "-- Row Level Security", "-- Grants");
  assert.doesNotMatch(policies, /create policy subscriptions_select_client/);
  assert.doesNotMatch(
    policies,
    /create policy subscription_usage_select_client/,
  );
});

test("follow-up uses a bounded owned-subscription detail read", async () => {
  const migration = await readFollowUpMigration();
  const section = sliceSql(
    migration,
    "create or replace function public.get_client_subscription",
    "revoke all on function public.get_client_subscription",
  );

  assert.match(section, /subscription\.id = target_subscription_id/);
  assert.match(
    section,
    /subscription\.client_id = \(select private\.active_client_id\(\)\)/,
  );
  const returnsContract = section.slice(
    section.indexOf("returns table"),
    section.indexOf("language sql"),
  );
  assert.doesNotMatch(
    returnsContract,
    /notes|organization_id|client_id|created_by/,
  );
  const privileges = sliceSql(
    migration,
    "revoke all on function public.get_client_subscription",
    null,
  );
  assert.match(privileges, /from public, anon, authenticated;/);
  assert.match(privileges, /to authenticated;/);
});
