import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canManageProjects,
  canMutateProject,
  canReadProject,
} from "../../src/features/projects/permissions.ts";
import {
  milestoneFormSchema,
  projectCreateSchema,
  projectEditSchema,
  projectFiltersSchema,
  projectMemberFormSchema,
  taskFormSchema,
} from "../../src/features/projects/schemas.ts";

const organizationA = "11111111-1111-4111-8111-111111111111";
const organizationB = "22222222-2222-4222-8222-222222222222";
const profileId = "33333333-3333-4333-8333-333333333333";
const clientId = "44444444-4444-4444-8444-444444444444";

function context(overrides = {}) {
  return {
    organizationId: organizationA,
    profileId,
    role: "admin",
    status: "active",
    ...overrides,
  };
}

function validProjectInput(overrides = {}) {
  return {
    clientId,
    name: "Website Redesign",
    description: "Rebuild the marketing site.",
    priority: "medium",
    startDate: "2026-08-01",
    targetDate: "2026-10-01",
    projectManagerId: "",
    ...overrides,
  };
}

test("logged-out visitors cannot read protected project records", () => {
  assert.equal(canReadProject(null, organizationA), false);
  assert.equal(canMutateProject(null, organizationA), false);
});

test("inactive memberships cannot read or mutate projects", () => {
  const inactive = context({ status: "inactive" });
  assert.equal(canReadProject(inactive, organizationA), false);
  assert.equal(canMutateProject(inactive, organizationA), false);
});

test("active internal members can read projects in their organization only", () => {
  const teamMember = context({ role: "team_member" });
  assert.equal(canReadProject(teamMember, organizationA), true);
  assert.equal(canReadProject(teamMember, organizationB), false);
});

test("only super admins and admins can manage projects", () => {
  assert.equal(canManageProjects("super_admin"), true);
  assert.equal(canManageProjects("admin"), true);
  assert.equal(canManageProjects("project_manager"), false);
  assert.equal(canManageProjects("team_member"), false);
  assert.equal(canMutateProject(context(), organizationA), true);
  assert.equal(canMutateProject(context(), organizationB), false);
});

test("valid project creation input is accepted without client-controlled tenant fields", () => {
  const result = projectCreateSchema.safeParse(validProjectInput());

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal("organizationId" in result.data, false);
    assert.equal("status" in result.data, false);
  }
});

test("project creation rejects missing name and an invalid client", () => {
  const result = projectCreateSchema.safeParse(
    validProjectInput({ clientId: "not-a-uuid", name: "" }),
  );

  assert.equal(result.success, false);
});

test("project creation rejects a target date before the start date", () => {
  const result = projectCreateSchema.safeParse(
    validProjectInput({ startDate: "2026-10-01", targetDate: "2026-08-01" }),
  );

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(
      result.error.issues.some((issue) => issue.path[0] === "targetDate"),
      true,
    );
  }
});

test("project edit schema exposes status but never a client relationship field", () => {
  const result = projectEditSchema.safeParse({
    name: "Website Redesign",
    description: "",
    status: "development",
    priority: "high",
    startDate: "",
    targetDate: "",
    projectManagerId: "",
  });

  assert.equal(result.success, true);
  assert.equal("clientId" in projectEditSchema.shape, false);
});

test("project filters reject unsupported status values safely", () => {
  const filters = projectFiltersSchema.parse({
    query: "Website",
    status: "archived",
    clientId: "not-a-uuid",
    projectManagerId: "",
    page: "1",
  });

  assert.equal(filters.status, "");
  assert.equal(filters.clientId, "");
  assert.equal(filters.query, "Website");
});

test("milestone and task input requires a title and rejects invalid identifiers", () => {
  assert.equal(
    milestoneFormSchema.safeParse({ title: "", description: "", dueDate: "" })
      .success,
    false,
  );
  assert.equal(
    milestoneFormSchema.safeParse({
      title: "Design review",
      description: "",
      dueDate: "",
    }).success,
    true,
  );
  assert.equal(
    taskFormSchema.safeParse({
      title: "Build homepage",
      description: "",
      milestoneId: "",
      priority: "medium",
      assignedTo: "not-a-uuid",
      dueDate: "",
    }).success,
    false,
  );
});

test("project member assignment requires a valid user and documented role", () => {
  assert.equal(
    projectMemberFormSchema.safeParse({ userId: profileId, role: "member" })
      .success,
    true,
  );
  assert.equal(
    projectMemberFormSchema.safeParse({
      userId: profileId,
      role: "owner",
    }).success,
    false,
  );
});

test("migration enforces organization RLS and denies anonymous table access", async () => {
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/20260731000000_phase_5_projects_foundation.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    migration,
    /alter table public\.projects enable row level security/i,
  );
  assert.match(
    migration,
    /alter table public\.project_members enable row level security/i,
  );
  assert.match(
    migration,
    /alter table public\.milestones enable row level security/i,
  );
  assert.match(
    migration,
    /alter table public\.tasks enable row level security/i,
  );
  assert.match(migration, /projects_select_internal_members/i);
  assert.match(
    migration,
    /private\.is_internal_member\(projects\.organization_id\)/i,
  );
  assert.match(
    migration,
    /revoke all privileges\s+on table\s+public\.projects,\s+public\.project_members,\s+public\.milestones,\s+public\.tasks\s+from public, anon, authenticated/is,
  );
  assert.doesNotMatch(migration, /grant (select|insert|update).*to anon/is);
});

test("a project's client must belong to the same organization at the database level", async () => {
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/20260731000000_phase_5_projects_foundation.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    migration,
    /clients_id_organization_id_key\s*\n\s*unique \(id, organization_id\)/i,
  );
  assert.match(
    migration,
    /projects_client_organization_fkey\s*\n\s*foreign key \(client_id, organization_id\)\s*\n\s*references public\.clients \(id, organization_id\)/i,
  );
  assert.match(
    migration,
    /exists \(\s*select 1\s*from public\.clients as client\s*where client\.id = projects\.client_id\s*and client\.organization_id = projects\.organization_id/i,
  );
});

test("a task's milestone must belong to the same project at the database level", async () => {
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/20260731000000_phase_5_projects_foundation.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    migration,
    /milestones_id_project_id_key\s*\n\s*unique \(id, project_id\)/i,
  );
  assert.match(
    migration,
    /tasks_milestone_project_fkey\s*\n\s*foreign key \(milestone_id, project_id\)\s*\n\s*references public\.milestones \(id, project_id\)/i,
  );
});

test("organization_id and client_id are protected from browser-submitted updates", async () => {
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/20260731000000_phase_5_projects_foundation.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const updateGrant = migration.slice(
    migration.indexOf("grant update (\n  name,"),
    migration.indexOf(") on public.projects to authenticated;"),
  );

  assert.doesNotMatch(updateGrant, /organization_id/);
  assert.doesNotMatch(updateGrant, /client_id/);
});

test("project manager and task/member assignment must belong to the same organization", async () => {
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/20260731000000_phase_5_projects_foundation.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    migration,
    /manager_membership\.organization_id = projects\.organization_id/i,
  );
  assert.match(
    migration,
    /assignee_membership\.organization_id\s*\n\s*= private\.project_organization_id\(project_members\.project_id\)/i,
  );
  assert.match(
    migration,
    /assignee_membership\.organization_id\s*\n\s*= private\.project_organization_id\(tasks\.project_id\)/i,
  );
});

test("only super_admin and admin may write projects, milestones, and tasks", async () => {
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/20260731000000_phase_5_projects_foundation.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const managerRoleMatches = migration.match(
    /array\['super_admin', 'admin'\]/g,
  );

  assert.ok(managerRoleMatches && managerRoleMatches.length >= 5);
});

test("server actions derive organization from the authenticated member and scope every mutation", async () => {
  const actions = await readFile(
    new URL("../../src/features/projects/actions.ts", import.meta.url),
    "utf8",
  );

  assert.match(actions, /organization_id: member\.organizationId/);
  assert.match(actions, /memberCanManageProjects\(member\)/);
  assert.match(
    actions,
    /\.eq\("organization_id", member\.organizationId\)/,
  );
  assert.match(
    actions,
    /eq\("id", parsed\.data\.clientId\)\s*\n\s*\.eq\("organization_id", member\.organizationId\)/,
  );
  assert.doesNotMatch(actions, /organization_id: parsed\.data/);
});

test("protected project routes inherit authenticated admin layout and manager checks", async () => {
  const [layout, projectsPage, newProjectPage, projectDetail, projectEdit] =
    await Promise.all([
      readFile(new URL("../../src/app/admin/layout.tsx", import.meta.url), "utf8"),
      readFile(
        new URL("../../src/app/admin/projects/page.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../../src/app/admin/projects/new/page.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../../src/app/admin/projects/[projectId]/page.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../../src/app/admin/projects/[projectId]/edit/page.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
    ]);

  assert.match(layout, /requireInternalMember\(\)/);
  assert.match(projectsPage, /requireInternalMember\(\)/);
  assert.match(newProjectPage, /memberCanManageProjects\(member\)/);
  assert.match(projectDetail, /requireInternalMember\(\)/);
  assert.match(projectEdit, /memberCanManageProjects\(member\)/);
});

test("the projects list and detail queries disambiguate the ambiguous clients relationship", async () => {
  // projects has two foreign keys into clients: the plain client_id lookup
  // and the composite (client_id, organization_id) ownership constraint.
  // An unqualified clients(...) embed is ambiguous and PostgREST returns
  // PGRST201 ("more than one relationship was found"), which the projects
  // list previously surfaced as "Unable to load projects." Both embeds must
  // use the explicit !projects_client_id_fkey hint.
  const queries = await readFile(
    new URL("../../src/features/projects/queries.ts", import.meta.url),
    "utf8",
  );

  assert.match(
    queries,
    /PROJECT_LIST_COLUMNS =\s*\n\s*"[^"]*clients!projects_client_id_fkey\(business_name\)/,
  );
  assert.match(
    queries,
    /PROJECT_DETAIL_COLUMNS =\s*\n\s*"[^"]*clients!projects_client_id_fkey\(business_name\)/,
  );
  assert.doesNotMatch(queries, /[^!]clients\(business_name\)/);
});

test("Supabase query failures log only safe diagnostic fields and never leak details in the thrown error", async () => {
  const queries = await readFile(
    new URL("../../src/features/projects/queries.ts", import.meta.url),
    "utf8",
  );

  assert.match(queries, /process\.env\.NODE_ENV !== "production"/);
  assert.match(
    queries,
    /console\.error\(`\$\{operation\} Supabase error`, \{\s*code: error\.code,\s*message: error\.message,\s*details: error\.details,\s*hint: error\.hint,/,
  );
  assert.match(queries, /logSupabaseError\("getProjectPage", error\)/);
  assert.match(
    queries,
    /logSupabaseError\("getProjectDetail\.project", projectError\)/,
  );
  assert.match(
    queries,
    /logSupabaseError\("getProjectDetail\.milestones", milestonesResult\.error\)/,
  );
  assert.match(
    queries,
    /logSupabaseError\("getProjectDetail\.tasks", tasksResult\.error\)/,
  );
  assert.match(
    queries,
    /logSupabaseError\("getProjectDetail\.members", membersResult\.error\)/,
  );
  // Every throw site must use a static, safe message — never a template
  // literal that could interpolate the underlying Supabase/PostgREST error.
  assert.doesNotMatch(queries, /throw new Error\(`/);
  assert.doesNotMatch(queries, /throw new Error\(error\b/);
});

test("project list and detail queries scope every read to the caller's organization", async () => {
  const queries = await readFile(
    new URL("../../src/features/projects/queries.ts", import.meta.url),
    "utf8",
  );
  const listSection = queries.slice(
    queries.indexOf("export async function getProjectPage"),
    queries.indexOf("export interface ClientProjectSummary"),
  );
  const detailSection = queries.slice(
    queries.indexOf("export async function getProjectDetail"),
  );

  assert.match(listSection, /\.eq\("organization_id", organizationId\)/);
  assert.match(detailSection, /\.eq\("organization_id", organizationId\)/);
});

test("project list search and filters use documented project columns", async () => {
  const queries = await readFile(
    new URL("../../src/features/projects/queries.ts", import.meta.url),
    "utf8",
  );

  assert.match(queries, /query\.ilike\("name", `%\$\{search\}%`\)/);
  assert.match(queries, /query\.eq\("status", filters\.status\)/);
  assert.match(queries, /query\.eq\("client_id", filters\.clientId\)/);
  assert.match(
    queries,
    /query\.eq\("project_manager_id", filters\.projectManagerId\)/,
  );
});

test("project list pagination requests a bounded range and an exact count", async () => {
  const queries = await readFile(
    new URL("../../src/features/projects/queries.ts", import.meta.url),
    "utf8",
  );

  assert.match(queries, /\{ count: "exact" \}/);
  assert.match(
    queries,
    /const from = \(filters\.page - 1\) \* PROJECTS_PAGE_SIZE/,
  );
  assert.match(queries, /const to = from \+ PROJECTS_PAGE_SIZE - 1/);
  assert.match(queries, /\.range\(from, to\)/);
});

test("projects page renders a proper empty state without fetching unlimited rows", async () => {
  const projectsPage = await readFile(
    new URL("../../src/app/admin/projects/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(projectsPage, /pageData\.projects\.length === 0/);
  assert.match(projectsPage, /EmptyState/);
  assert.match(projectsPage, /getProjectPage\(/);
});

test("client detail create-project entry point reauthorizes and never submits organization ownership", async () => {
  const clientDetail = await readFile(
    new URL(
      "../../src/app/admin/clients/[clientId]/page.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const newProjectPage = await readFile(
    new URL("../../src/app/admin/projects/new/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(clientDetail, /memberCanManageProjects\(member\)/);
  assert.match(clientDetail, /\/admin\/projects\/new\?clientId=/);
  assert.match(newProjectPage, /requireInternalMember\(\)/);
  assert.match(newProjectPage, /memberCanManageProjects\(member\)/);
  assert.doesNotMatch(newProjectPage, /organizationId=/);
});
