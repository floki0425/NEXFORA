import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  REPORT_FUNCTIONS,
  compactSql,
  extractFunctionDefinition,
  extractGrantBlock,
  readReportingMigration,
} from "../helpers/migration-test-helpers.mjs";

describe("Phase 12A reporting migration security properties", () => {
  test("every report RPC is security definer, stable, and pins an empty search_path", async () => {
    const migration = await readReportingMigration();

    for (const fn of REPORT_FUNCTIONS) {
      const definition = compactSql(extractFunctionDefinition(migration, fn));

      assert.ok(
        definition.includes("security definer"),
        `${fn} must be security definer so its role check is the boundary`,
      );
      assert.ok(definition.includes("stable"), `${fn} must be declared stable`);
      assert.ok(
        definition.includes("set search_path = ''"),
        `${fn} must pin an empty search_path`,
      );
    }
  });

  test("every report RPC raises P0001 from an explicit role check", async () => {
    const migration = await readReportingMigration();

    for (const fn of REPORT_FUNCTIONS) {
      const definition = compactSql(extractFunctionDefinition(migration, fn));

      assert.ok(
        definition.includes("errcode = 'P0001'"),
        `${fn} must raise P0001 on denial`,
      );
      assert.ok(
        definition.includes("private.current_internal_actor()"),
        `${fn} must re-derive the actor server-side`,
      );
      assert.match(
        definition,
        /actor_role not in \('super_admin', 'admin'/,
        `${fn} must check the actor's role explicitly`,
      );
    }
  });

  test("the four admin-only reports exclude project_manager and team_member", async () => {
    const migration = await readReportingMigration();
    const adminOnly = REPORT_FUNCTIONS.filter(
      (fn) => fn !== "public.get_project_delivery_report",
    );

    for (const fn of adminOnly) {
      const definition = compactSql(extractFunctionDefinition(migration, fn));

      assert.ok(
        definition.includes("actor_role not in ('super_admin', 'admin')"),
        `${fn} must admit super_admin and admin only`,
      );
      assert.ok(
        !definition.includes("'project_manager'"),
        `${fn} must not admit project_manager`,
      );
      assert.ok(
        !definition.includes("'team_member'"),
        `${fn} must never admit team_member`,
      );
    }
  });

  test("the delivery report admits project_manager but never team_member", async () => {
    const migration = await readReportingMigration();
    const definition = compactSql(
      extractFunctionDefinition(migration, "public.get_project_delivery_report"),
    );

    assert.ok(
      definition.includes(
        "actor_role not in ('super_admin', 'admin', 'project_manager')",
      ),
      "delivery report must admit exactly super_admin, admin, project_manager",
    );
    assert.ok(
      !definition.includes("'team_member'"),
      "delivery report must never admit team_member",
    );
  });

  test("the delivery report scopes a project_manager by project_manager_id, not can_manage_project", async () => {
    const migration = await readReportingMigration();
    const definition = compactSql(
      extractFunctionDefinition(migration, "public.get_project_delivery_report"),
    );

    // private.can_manage_project() also returns true for an ordinary
    // project_members row. Correct for access, wrong for accountability: it
    // would inflate a project manager's on-time rate with projects they only
    // contribute to.
    assert.ok(
      !definition.includes("can_manage_project"),
      "delivery report must not use private.can_manage_project() for aggregation",
    );
    assert.ok(
      definition.includes("project.project_manager_id = actor_profile_id"),
      "delivery report must scope a project_manager by project_manager_id",
    );
  });

  test("no report RPC grants execute to anon", async () => {
    const migration = await readReportingMigration();

    for (const fn of REPORT_FUNCTIONS) {
      const grants = compactSql(extractGrantBlock(migration, fn));

      assert.ok(
        grants.includes("revoke all on function") &&
          grants.includes("from public, anon, authenticated"),
        `${fn} must revoke broad access before granting`,
      );
      assert.ok(
        grants.includes("to authenticated"),
        `${fn} must grant execute to authenticated`,
      );
      assert.ok(
        !/grant execute[^;]*to[^;]*anon/.test(grants),
        `${fn} must never grant execute to anon`,
      );
    }
  });

  test("the migration is additive: no destructive DDL and no RLS disabling", async () => {
    const migration = (await readReportingMigration()).toLowerCase();

    for (const forbidden of [
      "drop table",
      "drop column",
      "drop policy",
      "disable row level security",
      "alter column",
      "truncate",
    ]) {
      assert.ok(
        !migration.includes(forbidden),
        `reporting migration must not contain "${forbidden}"`,
      );
    }
  });

  test("the migration preflights its dependencies and refuses to run twice", async () => {
    const migration = await readReportingMigration();

    assert.ok(migration.includes("do $preflight$"), "expected a preflight block");
    assert.ok(
      migration.includes("private.effective_invoice_status(text, date, numeric)"),
      "preflight must require the Phase 9 invoice status helper",
    );
    assert.match(
      migration,
      /must not run twice/,
      "preflight must abort if Phase 12A objects already exist",
    );
    assert.ok(
      migration.trimEnd().endsWith("notify pgrst, 'reload schema';"),
      "migration must end by reloading the PostgREST schema cache",
    );
  });
});
