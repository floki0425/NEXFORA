import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  FORBIDDEN_SEARCH_IDENTIFIERS,
  compactSql,
  extractFunctionDefinition,
  extractGrantBlock,
  readSearchMigration,
  sliceSql,
} from "../helpers/migration-test-helpers.mjs";

const SEARCH_FN = "public.search_workspace";

function searchBody(migration) {
  return compactSql(extractFunctionDefinition(migration, SEARCH_FN));
}

/** Isolates one UNION branch so a predicate on branch A cannot satisfy an assertion about branch B. */
function branch(migration, startComment, endComment) {
  return compactSql(
    sliceSql(extractFunctionDefinition(migration, SEARCH_FN), startComment, endComment),
  );
}

describe("Phase 12A search migration authorization", () => {
  test("LAYER 2: search_workspace is NOT security definer", async () => {
    const migration = await readSearchMigration();
    const definition = searchBody(migration);

    // This is the property the entire search design rests on. As SECURITY
    // INVOKER, every UNION branch executes as the caller, so each table's own
    // RLS still applies inside the function and the per-entity visibility
    // rules cannot drift from the policies. Flipping this to definer would
    // leak support-ticket scoping silently.
    assert.ok(
      !definition.includes("security definer"),
      "search_workspace must remain SECURITY INVOKER",
    );
    assert.ok(definition.includes("stable"), "search_workspace must be stable");
    assert.ok(
      definition.includes("set search_path = ''"),
      "search_workspace must pin an empty search_path",
    );
  });

  test("LAYER 1: an explicit internal-membership guard raises P0001 before any table is read", async () => {
    const migration = await readSearchMigration();
    const definition = searchBody(migration);

    assert.ok(
      definition.includes("private.current_internal_actor()"),
      "guard must re-derive the caller's membership server-side",
    );
    assert.ok(
      definition.includes("errcode = 'P0001'"),
      "guard must raise P0001 for a non-internal caller",
    );
    assert.ok(
      definition.includes(
        "actor_organization_id is distinct from p_organization_id",
      ),
      "guard must reject a caller from another organization",
    );

    // The guard must precede the query, otherwise it is not a guard.
    const guardIndex = definition.indexOf("errcode = 'P0001'");
    const queryIndex = definition.indexOf("return query");
    assert.ok(guardIndex > -1 && queryIndex > -1 && guardIndex < queryIndex);
  });

  test("LAYER 4: lead, proposal and invoice branches are super_admin/admin only", async () => {
    const migration = await readSearchMigration();

    const leadBranch = branch(migration, "-- lead: super_admin", "-- client:");
    const proposalBranch = branch(migration, "-- proposal: super_admin", "-- invoice:");
    const invoiceBranch = branch(migration, "-- invoice: super_admin", "-- support_ticket:");

    for (const [name, text] of [
      ["lead", leadBranch],
      ["proposal", proposalBranch],
      ["invoice", invoiceBranch],
    ]) {
      assert.ok(
        text.includes("actor_role in ('super_admin', 'admin')"),
        `${name} branch must require super_admin or admin`,
      );
      assert.ok(
        !text.includes("project_manager"),
        `${name} branch must not admit project_manager`,
      );
      assert.ok(
        !text.includes("team_member"),
        `${name} branch must not admit team_member`,
      );
    }
  });

  test("LAYER 4: the client branch scopes a project_manager through projects they own", async () => {
    const migration = await readSearchMigration();
    const clientBranch = branch(migration, "-- client: organization-wide", "-- project:");

    assert.ok(clientBranch.includes("actor_role in ('super_admin', 'admin')"));
    assert.ok(
      clientBranch.includes("actor_role = 'project_manager'"),
      "client branch must handle project_manager explicitly",
    );
    assert.ok(
      clientBranch.includes("owned.project_manager_id = actor_profile_id"),
      "a project_manager's clients must resolve through projects they own",
    );
    assert.ok(
      !clientBranch.includes("team_member"),
      "team_member must get no client results",
    );
    assert.ok(
      !clientBranch.includes("can_manage_project"),
      "client scoping must use the narrow project_manager_id rule",
    );
  });

  test("LAYER 4: the project branch uses project_manager_id for PMs and project_members for team members", async () => {
    const migration = await readSearchMigration();
    const projectBranch = branch(migration, "-- project: organization-wide", "-- proposal:");

    assert.ok(projectBranch.includes("actor_role in ('super_admin', 'admin')"));
    assert.ok(
      projectBranch.includes("project.project_manager_id = actor_profile_id"),
      "a project_manager sees projects they own",
    );
    assert.ok(
      projectBranch.includes("public.project_members"),
      "a team_member sees projects they are assigned to",
    );
    assert.ok(
      projectBranch.includes("membership.user_id = actor_profile_id"),
      "team_member assignment must be keyed on the actor's own profile",
    );
    assert.ok(
      !projectBranch.includes("can_manage_project"),
      "project scoping must not collapse the two rules into can_manage_project",
    );
  });

  test("the support_ticket branch adds NO product predicate and defers to RLS", async () => {
    const migration = await readSearchMigration();
    const ticketBranch = branch(migration, "-- support_ticket: NO product", "union all");

    // Its RLS policy already IS the product rule (admin, or assignee, or the
    // managing project manager). Copying that predicate here would create a
    // second definition that can drift from the policy.
    assert.ok(
      !ticketBranch.includes("actor_role"),
      "support_ticket branch must not re-implement its RLS predicate",
    );
    assert.ok(
      !ticketBranch.includes("assigned_to"),
      "support_ticket branch must not duplicate assignee scoping",
    );
    assert.ok(
      ticketBranch.includes("ticket.organization_id = p_organization_id"),
      "support_ticket branch must still filter by organization",
    );
  });

  test("no forbidden secret or internal-only identifier appears anywhere in the search migration", async () => {
    const migration = await readSearchMigration();

    for (const identifier of FORBIDDEN_SEARCH_IDENTIFIERS) {
      assert.ok(
        !migration.includes(identifier),
        `search migration must never reference "${identifier}"`,
      );
    }

    const definition = searchBody(migration);
    assert.ok(
      !definition.includes("metadata"),
      "search must never read a metadata column",
    );
    assert.ok(
      !definition.includes("invoice.notes"),
      "search must never read internal invoice notes",
    );
  });

  test("query bounds are enforced inside the function, not trusted from the caller", async () => {
    const migration = await readSearchMigration();
    const definition = searchBody(migration);

    assert.ok(
      definition.includes("char_length(normalized_query) < 2"),
      "a minimum query length must be enforced",
    );
    assert.ok(
      definition.includes("char_length(normalized_query) > 120"),
      "a maximum query length must be enforced",
    );
    assert.ok(
      definition.includes("least(greatest(coalesce(p_limit, 5), 1), 5)"),
      "the per-entity limit must be clamped",
    );
    assert.ok(definition.includes("limit 30"), "a hard total cap must be applied");
  });

  test("LIKE metacharacters are escaped, and every match uses the escape clause", async () => {
    const migration = await readSearchMigration();
    const definition = extractFunctionDefinition(migration, SEARCH_FN);

    assert.ok(
      definition.includes("replace(normalized_query, '\\', '\\\\')"),
      "backslash must be escaped first",
    );
    assert.ok(definition.includes("'%', '\\%'"), "percent must be escaped");
    assert.ok(definition.includes("'_', '\\_'"), "underscore must be escaped");

    const ilikeCount = [...definition.matchAll(/ilike like_pattern/g)].length;
    const escapeCount = [...definition.matchAll(/ilike like_pattern escape '\\'/g)]
      .length;
    assert.ok(ilikeCount > 0, "expected ILIKE matching");
    assert.equal(
      ilikeCount,
      escapeCount,
      "every ILIKE must carry the escape clause, or escaping is defeated",
    );
  });

  test("search_workspace grants execute to authenticated only", async () => {
    const migration = await readSearchMigration();
    const grants = compactSql(extractGrantBlock(migration, SEARCH_FN));

    assert.ok(grants.includes("from public, anon, authenticated"));
    assert.ok(grants.includes("to authenticated"));
    assert.ok(
      !/grant execute[^;]*to[^;]*anon/.test(grants),
      "search must never be granted to anon",
    );
  });

  test("the search migration is additive and reloads the schema cache", async () => {
    const migration = await readSearchMigration();
    const lowered = migration.toLowerCase();

    for (const forbidden of [
      "drop table",
      "drop column",
      "drop policy",
      "disable row level security",
      "alter column",
    ]) {
      assert.ok(!lowered.includes(forbidden), `must not contain "${forbidden}"`);
    }

    assert.ok(migration.includes("do $preflight$"));
    assert.ok(migration.trimEnd().endsWith("notify pgrst, 'reload schema';"));
  });
});
