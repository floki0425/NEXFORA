import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canManageLeads,
  canMutateLead,
  canReadLead,
} from "../../src/features/leads/permissions.ts";
import {
  buildSubmitProjectInquiryBudgetArgs,
  isValidBudgetRange,
  normalizeLeadCreateBudgets,
  normalizeLeadUpdateBudgets,
  resolveLeadBudgetValues,
} from "../../src/features/leads/budget.ts";
import {
  leadFormSchema,
  publicInquirySchema,
} from "../../src/features/leads/schemas.ts";

const organizationA = "11111111-1111-4111-8111-111111111111";
const organizationB = "22222222-2222-4222-8222-222222222222";
const profileId = "33333333-3333-4333-8333-333333333333";

function context(overrides = {}) {
  return {
    organizationId: organizationA,
    profileId,
    role: "admin",
    status: "active",
    ...overrides,
  };
}

function validLeadInput(overrides = {}) {
  return {
    fullName: "Ava Reyes",
    businessName: "Acme Studio",
    email: "ava@example.com",
    phone: "",
    industry: "Professional services",
    serviceInterest: "Web application",
    problemSummary: "Replace a manual client onboarding workflow.",
    requestedFeatures: "Admin dashboard, Reports",
    budgetMin: "",
    budgetMax: "",
    targetTimeline: "Within 3 months",
    source: "referral",
    sourceDetail: "Existing partner",
    leadScore: "80",
    assignedTo: "",
    ...overrides,
  };
}

test("logged-out visitors cannot read protected lead records", () => {
  assert.equal(canReadLead(null, organizationA), false);
  assert.equal(canMutateLead(null, organizationA), false);
});

test("inactive memberships cannot read or mutate leads", () => {
  const inactive = context({ status: "inactive" });
  assert.equal(canReadLead(inactive, organizationA), false);
  assert.equal(canMutateLead(inactive, organizationA), false);
});

test("active internal members can read leads in their organization only", () => {
  const teamMember = context({ role: "team_member" });
  assert.equal(canReadLead(teamMember, organizationA), true);
  assert.equal(canReadLead(teamMember, organizationB), false);
});

test("only super admins and admins can mutate leads", () => {
  assert.equal(canManageLeads("super_admin"), true);
  assert.equal(canManageLeads("admin"), true);
  assert.equal(canManageLeads("project_manager"), false);
  assert.equal(canManageLeads("team_member"), false);
  assert.equal(canMutateLead(context(), organizationA), true);
  assert.equal(canMutateLead(context(), organizationB), false);
});

test("creating a lead without a budget normalizes both columns to null", () => {
  assert.deepEqual(
    normalizeLeadCreateBudgets({
      budgetMin: "",
      budgetMax: undefined,
    }),
    {
      budget_min: null,
      budget_max: null,
    },
  );
});

test("creating a lead with minimum and maximum budgets preserves both numbers", () => {
  const budgets = normalizeLeadCreateBudgets({
    budgetMin: "100000",
    budgetMax: "250000",
  });

  assert.deepEqual(budgets, {
    budget_min: 100000,
    budget_max: 250000,
  });
  assert.equal(isValidBudgetRange(budgets), true);
});

test("public inquiry RPC budgets support no value, either bound, or both", () => {
  const scenarios = [
    {
      input: { budgetMin: null, budgetMax: null },
      expected: {},
    },
    {
      input: { budgetMin: 100000, budgetMax: null },
      expected: { inquiry_budget_min: 100000 },
    },
    {
      input: { budgetMin: null, budgetMax: 250000 },
      expected: { inquiry_budget_max: 250000 },
    },
    {
      input: { budgetMin: 100000, budgetMax: 250000 },
      expected: {
        inquiry_budget_min: 100000,
        inquiry_budget_max: 250000,
      },
    },
  ];

  for (const scenario of scenarios) {
    const budgets = normalizeLeadCreateBudgets(scenario.input);
    assert.deepEqual(
      buildSubmitProjectInquiryBudgetArgs(budgets),
      scenario.expected,
    );
  }
});

test("lead validation rejects a negative budget", () => {
  const result = leadFormSchema.safeParse(
    validLeadInput({ budgetMin: "-1" }),
  );

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(
      result.error.issues.some((issue) => issue.path[0] === "budgetMin"),
      true,
    );
  }
});

test("lead validation rejects a maximum below the minimum", () => {
  const result = leadFormSchema.safeParse(
    validLeadInput({
      budgetMin: "100000",
      budgetMax: "50000",
    }),
  );

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(
      result.error.issues.some((issue) => issue.path[0] === "budgetMax"),
      true,
    );
  }
});

test("an edit with omitted budget fields preserves existing values", () => {
  const existing = {
    budget_min: 100000,
    budget_max: 250000,
  };
  const updates = normalizeLeadUpdateBudgets({});

  assert.deepEqual(updates, {});
  assert.deepEqual(resolveLeadBudgetValues(existing, updates), existing);
});

test("clearing budget fields writes null for both columns", () => {
  const updates = normalizeLeadUpdateBudgets({
    budgetMin: "",
    budgetMax: "",
  });

  assert.deepEqual(updates, {
    budget_min: null,
    budget_max: null,
  });
  assert.deepEqual(
    resolveLeadBudgetValues(
      {
        budget_min: 100000,
        budget_max: 250000,
      },
      updates,
    ),
    {
      budget_min: null,
      budget_max: null,
    },
  );
});

test("lead creation rejects invalid contact and budget input", () => {
  const result = leadFormSchema.safeParse({
    fullName: "",
    businessName: "",
    email: "not-an-email",
    phone: "",
    industry: "",
    serviceInterest: "",
    problemSummary: "",
    requestedFeatures: "",
    budgetMin: "100000",
    budgetMax: "50000",
    targetTimeline: "",
    source: "manual",
    sourceDetail: "",
    leadScore: "101",
    assignedTo: "",
  });

  assert.equal(result.success, false);
});

test("authorized lead input is accepted without client-controlled tenant or status fields", () => {
  const result = leadFormSchema.safeParse({
    fullName: "Ava Reyes",
    businessName: "Acme Studio",
    email: "AVA@EXAMPLE.COM",
    phone: "",
    industry: "Professional services",
    serviceInterest: "Web application",
    problemSummary: "Replace a manual client onboarding workflow.",
    requestedFeatures: "Admin dashboard, Reports",
    budgetMin: "100000",
    budgetMax: "200000",
    targetTimeline: "Within 3 months",
    source: "referral",
    sourceDetail: "Existing partner",
    leadScore: "80",
    assignedTo: "",
  });

  assert.equal(result.success, true);
  assert.equal("organizationId" in result.data, false);
  assert.equal("status" in result.data, false);
  assert.equal(result.data.email, "ava@example.com");
});

test("public inquiry accepts valid input and rejects bots or rushed submissions", () => {
  const valid = {
    fullName: "Ava Reyes",
    businessName: "Acme Studio",
    email: "ava@example.com",
    phone: "",
    industry: "Professional services",
    serviceInterest: "Web application",
    problemSummary: "We need a secure system to replace a manual onboarding workflow.",
    requestedFeatures: ["Admin dashboard"],
    budget: "₱100,000–₱249,999",
    targetTimeline: "Within 2–3 months",
    companyWebsite: "",
    startedAt: Date.now() - 5000,
  };

  assert.equal(publicInquirySchema.safeParse(valid).success, true);
  assert.equal(
    publicInquirySchema.safeParse({
      ...valid,
      companyWebsite: "https://spam.example",
    }).success,
    false,
  );
  assert.equal(
    publicInquirySchema.safeParse({ ...valid, startedAt: Date.now() }).success,
    false,
  );
});

test("migration enforces organization RLS, manager writes, immutable activity, and bounded public intake", async () => {
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/20260729000000_phase_3_leads_crm.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /alter table public\.leads enable row level security/i);
  assert.match(migration, /leads_select_internal_members/i);
  assert.match(migration, /array\['super_admin', 'admin'\]/i);
  assert.match(migration, /assignee_membership\.organization_id = leads\.organization_id/i);
  assert.doesNotMatch(migration, /lead_activities_(update|delete)/i);
  assert.match(migration, /create trigger leads_record_created_activity/i);
  assert.match(migration, /create trigger leads_record_update_activity/i);
  assert.match(migration, /recent_inquiry_count >= 3/i);
  assert.match(migration, /organization\.slug = 'nexfora'/i);
  assert.match(migration, /grant execute on function public\.submit_project_inquiry/i);
});

test("public inquiry migration defaults nullable budgets and maps them to lead columns", async () => {
  const [foundationMigration, nullableBudgetMigration] = await Promise.all([
    readFile(
      new URL(
        "../../supabase/migrations/20260729000000_phase_3_leads_crm.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../supabase/migrations/20260729120000_phase_3_public_inquiry_nullable_budgets.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(
    nullableBudgetMigration,
    /inquiry_target_timeline text,\s+inquiry_budget_min numeric default null,\s+inquiry_budget_max numeric default null/i,
  );
  assert.match(
    nullableBudgetMigration,
    /budget_min,\s+budget_max,\s+target_timeline[\s\S]*?inquiry_budget_min,\s+inquiry_budget_max,\s+nullif\(btrim\(inquiry_target_timeline\), ''\)/i,
  );
  assert.doesNotMatch(
    nullableBudgetMigration,
    /coalesce\s*\(\s*inquiry_budget_(?:min|max)\s*,\s*0/i,
  );
  assert.match(
    foundationMigration,
    /check \(budget_min is null or budget_min >= 0\)/i,
  );
  assert.match(
    foundationMigration,
    /check \(budget_max is null or budget_max >= 0\)/i,
  );
  assert.match(
    foundationMigration,
    /budget_min is null\s+or budget_max is null\s+or budget_max >= budget_min/i,
  );
});

test("server actions derive tenant and initial status and scope every update", async () => {
  const actions = await readFile(
    new URL("../../src/features/leads/actions.ts", import.meta.url),
    "utf8",
  );

  assert.match(actions, /organization_id: member\.organizationId/);
  assert.match(actions, /status: "new"/);
  assert.match(actions, /\.eq\("organization_id", member\.organizationId\)/);
  assert.match(actions, /memberCanManageLeads\(member\)/);
  assert.doesNotMatch(actions, /converted_client_id:/);
});

test("direct lead table operations use budget_min and budget_max only", async () => {
  const [actions, queries] = await Promise.all([
    readFile(
      new URL("../../src/features/leads/actions.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../src/features/leads/queries.ts", import.meta.url),
      "utf8",
    ),
  ]);
  const directActionSection = actions.slice(
    0,
    actions.indexOf("export async function submitProjectInquiryAction"),
  );

  assert.match(directActionSection, /budget_min: budgets\.budget_min/);
  assert.match(directActionSection, /budget_max: budgets\.budget_max/);
  assert.match(queries, /budget_min, budget_max/);
  assert.doesNotMatch(directActionSection, /inquiry_budget_(min|max)/);
  assert.doesNotMatch(queries, /inquiry_budget_(min|max)/);
});

test("public inquiry omits null budgets from the generated RPC argument payload", async () => {
  const [actions, budgetFormatter] = await Promise.all([
    readFile(
      new URL("../../src/features/leads/actions.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../src/features/leads/format.ts", import.meta.url),
      "utf8",
    ),
  ]);
  const rpcActionSection = actions.slice(
    actions.indexOf("export async function submitProjectInquiryAction"),
  );

  assert.match(
    rpcActionSection,
    /const inquiryPayload: SubmitProjectInquiryArgs/,
  );
  assert.match(
    rpcActionSection,
    /\.\.\.buildSubmitProjectInquiryBudgetArgs\(budgets\)/,
  );
  assert.doesNotMatch(rpcActionSection, /budget(?:Min|Max)\s*\?\?\s*0/);
  assert.doesNotMatch(budgetFormatter, /maximum\s*\?\?\s*0/);
});
