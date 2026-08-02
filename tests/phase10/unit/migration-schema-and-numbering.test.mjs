// Static checks for the Phase 10 schema surface, grants, triggers, indexes,
// and race-safe official ticket numbering. Live behavior belongs in the
// Phase 10 integration suite.

import assert from "node:assert/strict";
import test from "node:test";

import {
  compactSql,
  readBaseMigration,
  readFollowUpMigration,
  sliceSql,
} from "./migration-test-helpers.mjs";

const EXPECTED_TABLES = [
  "support_tickets",
  "ticket_activities",
  "subscriptions",
  "subscription_usage",
];

const EXPECTED_PUBLIC_FUNCTIONS = [
  "close_ticket_by_client",
  "create_client_support_ticket",
  "get_client_subscription_usage",
  "get_client_subscriptions",
  "get_client_support_tickets",
  "get_client_ticket_activities",
  "reopen_ticket_by_client",
  "transition_ticket_status",
];

const ORIGINAL_RPC_SIGNATURES = [
  "public.create_client_support_ticket( text, text, text, text, uuid )",
  "public.transition_ticket_status(uuid, text, text)",
  "public.close_ticket_by_client(uuid)",
  "public.reopen_ticket_by_client(uuid, text)",
  "public.get_client_support_tickets()",
  "public.get_client_ticket_activities(uuid)",
  "public.get_client_subscriptions()",
  "public.get_client_subscription_usage(uuid)",
];

const EXPECTED_INDEXES = [
  "subscription_usage_organization_idx",
  "subscription_usage_subscription_date_idx",
  "subscriptions_client_idx",
  "subscriptions_organization_renewal_idx",
  "subscriptions_organization_status_idx",
  "subscriptions_organization_updated_idx",
  "subscriptions_project_idx",
  "support_tickets_assigned_idx",
  "support_tickets_client_idx",
  "support_tickets_organization_priority_idx",
  "support_tickets_organization_status_idx",
  "support_tickets_organization_updated_idx",
  "support_tickets_project_idx",
  "ticket_activities_organization_idx",
  "ticket_activities_ticket_created_idx",
];

test("base migration creates exactly the four Phase 10 public tables", async () => {
  const migration = await readBaseMigration();
  const tables = [...migration.matchAll(/^create table public\.(\w+)/gm)].map(
    (match) => match[1],
  );

  assert.deepEqual(tables.sort(), [...EXPECTED_TABLES].sort());
});

test("base migration exposes all eight original public RPC definitions", async () => {
  const migration = await readBaseMigration();
  const functions = [
    ...migration.matchAll(/^create or replace function public\.(\w+)/gm),
  ].map((match) => match[1]);

  assert.deepEqual(functions.sort(), [...EXPECTED_PUBLIC_FUNCTIONS].sort());
});

test("all eight original RPCs revoke defaults and grant authenticated only", async () => {
  const migration = compactSql(await readBaseMigration());

  for (const signature of ORIGINAL_RPC_SIGNATURES) {
    const escapedSignature = signature
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\s+/g, "\\s*");

    assert.match(
      migration,
      new RegExp(
        `revoke all on function ${escapedSignature} from public, anon, authenticated;`,
      ),
      `expected default revocation for ${signature}`,
    );
    assert.match(
      migration,
      new RegExp(
        `grant execute on function ${escapedSignature} to authenticated;`,
      ),
      `expected authenticated grant for ${signature}`,
    );
  }
});

test("ticket counter is private, tenant/year scoped, positive, and not directly executable", async () => {
  const migration = await readBaseMigration();
  const counter = sliceSql(
    migration,
    "create table private.ticket_number_counters",
    "create or replace function private.next_ticket_number",
  );
  const privilegeSection = sliceSql(
    migration,
    "revoke all on function private.next_ticket_number(uuid)",
    "-- ---",
  );

  assert.match(counter, /primary key \(organization_id, number_year\)/);
  assert.match(counter, /check \(last_value > 0\)/);
  assert.match(counter, /revoke all on table private\.ticket_number_counters\s+from public, anon, authenticated;/);
  assert.match(privilegeSection, /from public, anon, authenticated;/);
  assert.doesNotMatch(
    privilegeSection,
    /grant execute on function private\.next_ticket_number/,
  );
});

test("next_ticket_number uses one atomic upsert-and-increment for concurrency safety", async () => {
  const migration = await readBaseMigration();
  const section = sliceSql(
    migration,
    "create or replace function private.next_ticket_number",
    "revoke all on function private.next_ticket_number",
  );

  assert.match(section, /on conflict \(organization_id, number_year\)/);
  assert.match(
    section,
    /do update set last_value = private\.ticket_number_counters\.last_value \+ 1/,
  );
  assert.match(section, /returning last_value into assigned_value/);
  assert.doesNotMatch(section, /select\s+last_value\s+from/i);
});

test("server numbering is formatted and uniquely scoped per organization", async () => {
  const migration = await readBaseMigration();
  const numberFunction = sliceSql(
    migration,
    "create or replace function private.next_ticket_number",
    "revoke all on function private.next_ticket_number",
  );
  const createFunction = sliceSql(
    migration,
    "create or replace function public.create_client_support_ticket",
    "revoke all on function public.create_client_support_ticket",
  );

  assert.match(numberFunction, /'NXF-TKT-' \|\| current_year \|\| '-'/);
  assert.match(numberFunction, /lpad\(assigned_value::text, 4, '0'\)/);
  assert.match(
    migration,
    /constraint support_tickets_organization_number_key\s+unique \(organization_id, ticket_number\)/,
  );
  assert.match(
    migration,
    /ticket_number ~ '\^NXF-TKT-\[0-9\]\{4\}-\[0-9\]\{4,\}\$'/,
  );
  assert.match(
    createFunction,
    /assigned_number := private\.next_ticket_number\(resolved_organization_id\);/,
  );
  assert.doesNotMatch(
    createFunction.slice(0, createFunction.indexOf("assigned_number :=")),
    /insert into public\.support_tickets/,
  );
});

test("base migration installs all intentional Phase 10 indexes", async () => {
  const migration = await readBaseMigration();
  const indexes = [...migration.matchAll(/^create index (\w+)/gm)].map(
    (match) => match[1],
  );

  assert.deepEqual(indexes.sort(), [...EXPECTED_INDEXES].sort());
  assert.match(
    migration,
    /subscriptions_organization_renewal_idx[\s\S]*where status in \('trial', 'active', 'past_due'\)/,
  );
});

test("updated_at and ticket activity triggers are present and call private helpers", async () => {
  const migration = await readBaseMigration();
  const compact = compactSql(migration);

  assert.match(
    compact,
    /create trigger support_tickets_set_updated_at before update on public\.support_tickets for each row execute function private\.set_updated_at\(\);/,
  );
  assert.match(
    compact,
    /create trigger subscriptions_set_updated_at before update on public\.subscriptions for each row execute function private\.set_updated_at\(\);/,
  );
  assert.match(
    compact,
    /create trigger support_tickets_record_created_activity after insert on public\.support_tickets for each row execute function private\.record_ticket_created_activity\(\);/,
  );
  assert.match(
    compact,
    /create trigger support_tickets_record_assignment_activity after update of assigned_to on public\.support_tickets for each row when \(old\.assigned_to is distinct from new\.assigned_to\) execute function private\.record_ticket_assignment_activity\(\);/,
  );
});

test("base table grants stay narrow and service_role remains the trusted escape hatch", async () => {
  const migration = await readBaseMigration();
  const grants = sliceSql(migration, "-- Grants", null);

  for (const table of EXPECTED_TABLES) {
    assert.match(
      grants,
      new RegExp(`public\\.${table}`),
      `expected grants section to mention ${table}`,
    );
  }

  assert.match(
    grants,
    /grant update \(assigned_to\) on public\.support_tickets to authenticated;/,
  );
  assert.doesNotMatch(
    grants,
    /grant insert[\s\S]{0,120}on public\.support_tickets to authenticated/,
  );
  assert.doesNotMatch(
    grants,
    /grant (insert|update|delete)[\s\S]{0,120}on public\.ticket_activities to authenticated/,
  );
  assert.match(
    grants,
    /grant all privileges[\s\S]*public\.support_tickets,[\s\S]*public\.ticket_activities,[\s\S]*public\.subscriptions,[\s\S]*public\.subscription_usage[\s\S]*to service_role;/,
  );
});

test("follow-up adds internal creation without changing the eight-RPC base contract", async () => {
  const base = await readBaseMigration();
  const followUp = await readFollowUpMigration();

  assert.doesNotMatch(base, /create_internal_support_ticket/);
  assert.match(
    followUp,
    /create or replace function public\.create_internal_support_ticket/,
  );
  assert.equal(
    [...base.matchAll(/^create or replace function public\.(\w+)/gm)].length,
    8,
  );
});
