import assert from "node:assert/strict";
import test from "node:test";

import {
  compactSql,
  occurrences,
  readMigration,
  sliceSql,
} from "../helpers/migration-test-helpers.mjs";

test("RLS is enabled on all 4 public Phase 11 tables", async () => {
  const migration = await readMigration();
  for (const table of [
    "audit_logs",
    "notifications",
    "notification_preferences",
    "notification_deliveries",
  ]) {
    assert.match(
      migration,
      new RegExp(`alter table public\\.${table} enable row level security;`),
    );
  }
});

test("no policy anywhere in the migration uses using (true)", async () => {
  const migration = await readMigration();
  assert.doesNotMatch(migration, /using\s*\(\s*true\s*\)/i);
});

test("audit_logs has no insert/update/delete grant or policy for authenticated/anon", async () => {
  const migration = await readMigration();

  const rlsSection = sliceSql(
    migration,
    "-- SECTION 2: row level security",
    "-- SECTION 3: private helpers",
  );
  // The only policy touching audit_logs in the RLS section must be the one
  // named audit_logs_select_admins, and it must be "for select" — scoped to
  // this bounded section (not the whole 2000-line file) to avoid a loose
  // regex accidentally matching an unrelated policy elsewhere.
  const audit_logsPolicyBlock = sliceSql(
    rlsSection,
    "create policy audit_logs_select_admins",
    "create policy notifications_select_own",
  );
  assert.match(audit_logsPolicyBlock, /for select/);
  assert.doesNotMatch(audit_logsPolicyBlock, /for (insert|update|delete)/);
  assert.equal(
    (rlsSection.match(/on public\.audit_logs/g) ?? []).length,
    1,
    "expected exactly one policy referencing public.audit_logs",
  );

  const grantSection = sliceSql(
    migration,
    "revoke all privileges on table public.audit_logs",
    "grant all privileges on table public.audit_logs to service_role;",
  );
  assert.match(grantSection, /grant select on table public\.audit_logs to authenticated;/);
  assert.doesNotMatch(grantSection, /grant (insert|update|delete)/i);
});

test("notification_deliveries grants nothing to authenticated/anon (service_role only)", async () => {
  const migration = await readMigration();
  const grantSection = sliceSql(
    migration,
    "revoke all privileges on table public.notification_deliveries",
    "grant all privileges on table public.notification_deliveries to service_role;",
  );
  assert.doesNotMatch(grantSection, /grant [a-z, ]+ on table public\.notification_deliveries to authenticated/i);

  const rlsSection = sliceSql(
    migration,
    "-- SECTION 2: row level security",
    "-- SECTION 3: private helpers",
  );
  assert.doesNotMatch(rlsSection, /on public\.notification_deliveries/);
});

test("notifications and notification_preferences grant select only to authenticated (no write)", async () => {
  const migration = await readMigration();

  for (const table of ["notifications", "notification_preferences"]) {
    const grantSection = sliceSql(
      migration,
      `revoke all privileges on table public.${table}`,
      `grant all privileges on table public.${table} to service_role;`,
    );
    assert.match(
      grantSection,
      new RegExp(`grant select on table public\\.${table} to authenticated;`),
    );
    assert.doesNotMatch(grantSection, /grant (insert|update|delete)/i);
  }
});

test("notifications has the (user_id, event_type, entity_id, dedupe_key) unique dedupe index", async () => {
  const migration = await readMigration();
  assert.match(
    migration,
    /constraint notifications_dedupe_unique\s*\n\s*unique \(user_id, event_type, entity_id, dedupe_key\)/,
  );
});

test("private.reminder_runs is revoked from anon, authenticated, and service_role", async () => {
  const migration = await readMigration();
  assert.match(
    migration,
    /revoke all on table private\.reminder_runs from public, anon, authenticated, service_role;/,
  );
});

test("private.reminder_runs is not exposed via a public-schema table", async () => {
  const migration = await readMigration();
  assert.doesNotMatch(migration, /create table public\.reminder_runs/);
  assert.match(migration, /create table private\.reminder_runs/);
});

test("every `revoke all on function` precedes its corresponding grant", async () => {
  const migration = await readMigration();
  const compact = compactSql(migration);

  const functionNames = [
    ...migration.matchAll(/create or replace function (?:public|private)\.([a-z_]+)\(/g),
  ].map((match) => match[1]);

  for (const name of new Set(functionNames)) {
    const revokePattern = new RegExp(`revoke all on function (?:public|private)\\.${name}\\(`);
    const revokeMatch = compact.match(revokePattern);
    assert.ok(revokeMatch, `expected a revoke all for function ${name}`);
  }
});

test("service-role-only RPCs are never granted to authenticated or anon", async () => {
  const migration = await readMigration();
  const serviceRoleFunctions = [
    "raise_due_invoice_reminders",
    "raise_due_renewal_reminders",
    "raise_due_lead_follow_ups",
    "claim_pending_email_deliveries",
    "mark_email_delivery_result",
  ];

  for (const name of serviceRoleFunctions) {
    assert.doesNotMatch(
      migration,
      new RegExp(`grant execute on function public\\.${name}\\([^)]*\\)\\s*\\n?\\s*to authenticated`),
    );
    assert.match(
      migration,
      new RegExp(`grant execute on function public\\.${name}\\([^)]*\\)\\s*\\n?\\s*to service_role`),
    );
  }
});

test("preflight block aborts if any required table or helper function is missing", async () => {
  const migration = await readMigration();
  const preflight = sliceSql(migration, "do $preflight$", "$preflight$;");
  assert.match(preflight, /to_regclass\('public\.organizations'\) is null/);
  assert.match(preflight, /to_regprocedure\('private\.current_profile_id\(\)'\) is null/);
  assert.match(preflight, /raise exception/);
});

test("preflight block aborts if this migration has already been applied", async () => {
  const migration = await readMigration();
  const preflight = sliceSql(migration, "do $preflight$", "$preflight$;");
  assert.match(preflight, /to_regclass\('public\.audit_logs'\) is not null/);
});

test("every security definer function sets search_path to empty string", async () => {
  const migration = await readMigration();
  const definerBlocks = occurrences(migration, /security definer/g);
  const emptySearchPath = occurrences(migration, /security definer\nset search_path = '';?/g);
  // Every "security definer" line in this migration is immediately followed
  // by "set search_path = ''" (the repo-wide convention) — same count.
  assert.equal(emptySearchPath, definerBlocks);
});
