import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canManageProposals,
  canMutateProposal,
  canReadProposal,
  isLeadEligibleForProposal,
  isProposalEditable,
} from "../../src/features/proposals/permissions.ts";
import {
  proposalCreateSchema,
  proposalEditSchema,
  proposalFiltersSchema,
  proposalItemFormSchema,
  requestProposalChangesSchema,
} from "../../src/features/proposals/schemas.ts";
import { computeEstimateRange } from "../../src/features/estimator/pricing.ts";
import { estimatorLeadCaptureSchema } from "../../src/features/estimator/schemas.ts";
import {
  maskEmailForLogging,
  normalizeAndValidateRecipient,
  sendViaResendClient,
} from "../../src/lib/email/resend-result.ts";

const organizationA = "11111111-1111-4111-8111-111111111111";
const organizationB = "22222222-2222-4222-8222-222222222222";
const profileId = "33333333-3333-4333-8333-333333333333";
const leadId = "44444444-4444-4444-8444-444444444444";

function context(overrides = {}) {
  return {
    organizationId: organizationA,
    profileId,
    role: "admin",
    status: "active",
    ...overrides,
  };
}

function validProposalInput(overrides = {}) {
  return {
    leadId,
    title: "Website Redesign Proposal",
    summary: "Rebuild the marketing site.",
    scope: "Full redesign with CMS integration.",
    deliverables: "Homepage, Product pages, Blog",
    timelineText: "6-8 weeks",
    paymentTermsText: "50% upfront, 50% on delivery.",
    termsText: "Standard Nexfora terms apply.",
    validUntil: "2026-12-31",
    discount: "0",
    tax: "0",
    ...overrides,
  };
}

const MIGRATION_PATH = new URL(
  "../../supabase/migrations/20260801000000_phase_6_proposals.sql",
  import.meta.url,
);

async function readMigration() {
  return readFile(MIGRATION_PATH, "utf8");
}

// -- Internal security -------------------------------------------------

test("logged-out visitors cannot read protected proposal records", () => {
  assert.equal(canReadProposal(null, organizationA), false);
  assert.equal(canMutateProposal(null, organizationA), false);
});

test("inactive memberships cannot read or mutate proposals", () => {
  const inactive = context({ status: "inactive" });
  assert.equal(canReadProposal(inactive, organizationA), false);
  assert.equal(canMutateProposal(inactive, organizationA), false);
});

test("active internal members can read proposals in their organization only", () => {
  const teamMember = context({ role: "team_member" });
  assert.equal(canReadProposal(teamMember, organizationA), true);
  assert.equal(canReadProposal(teamMember, organizationB), false);
});

test("only super admins and admins can manage proposals", () => {
  assert.equal(canManageProposals("super_admin"), true);
  assert.equal(canManageProposals("admin"), true);
  assert.equal(canManageProposals("project_manager"), false);
  assert.equal(canManageProposals("team_member"), false);
  assert.equal(canMutateProposal(context(), organizationA), true);
  assert.equal(canMutateProposal(context(), organizationB), false);
});

test("migration enforces organization RLS and denies anonymous table access", async () => {
  const migration = await readMigration();

  assert.match(migration, /alter table public\.proposals enable row level security/i);
  assert.match(migration, /alter table public\.proposal_items enable row level security/i);
  assert.match(migration, /alter table public\.proposal_versions enable row level security/i);
  assert.match(migration, /proposals_select_internal_members/i);
  assert.match(migration, /private\.is_internal_member\(proposals\.organization_id\)/i);
  assert.match(
    migration,
    /revoke all privileges\s+on table\s+public\.proposals,\s+public\.proposal_items,\s+public\.proposal_versions,\s+public\.proposal_access_tokens\s+from public, anon, authenticated/is,
  );
  assert.doesNotMatch(migration, /grant (select|insert|update).*to anon/is);
});

test("only super_admin and admin may write proposals and related records", async () => {
  const migration = await readMigration();
  const managerRoleMatches = migration.match(/array\['super_admin', 'admin'\]/g);

  assert.ok(managerRoleMatches && managerRoleMatches.length >= 5);
});

// -- Proposal draft ------------------------------------------------------

test("only draft and changes-requested proposals are considered editable", () => {
  assert.equal(isProposalEditable("draft"), true);
  assert.equal(isProposalEditable("changes_requested"), true);
  assert.equal(isProposalEditable("sent"), false);
  assert.equal(isProposalEditable("viewed"), false);
  assert.equal(isProposalEditable("accepted"), false);
  assert.equal(isProposalEditable("declined"), false);
  assert.equal(isProposalEditable("expired"), false);
});

test("only a qualified lead is eligible to start a proposal", () => {
  assert.equal(isLeadEligibleForProposal("qualified"), true);
  assert.equal(isLeadEligibleForProposal("new"), false);
  assert.equal(isLeadEligibleForProposal("proposal"), false);
  assert.equal(isLeadEligibleForProposal("won"), false);
});

test("valid proposal creation input is accepted without a client-controlled organization field", () => {
  const result = proposalCreateSchema.safeParse(validProposalInput());

  assert.equal(result.success, true);
  assert.equal("organizationId" in proposalCreateSchema.shape, false);
});

test("proposal creation rejects a missing title and an invalid lead id", () => {
  const result = proposalCreateSchema.safeParse(
    validProposalInput({ leadId: "not-a-uuid", title: "" }),
  );

  assert.equal(result.success, false);
});

test("proposal edit schema never exposes a lead relationship field", () => {
  const result = proposalEditSchema.safeParse({
    title: "Website Redesign Proposal",
    summary: "",
    scope: "",
    deliverables: "",
    timelineText: "",
    paymentTermsText: "",
    termsText: "",
    validUntil: "",
    discount: "0",
    tax: "0",
  });

  assert.equal(result.success, true);
  assert.equal("leadId" in proposalEditSchema.shape, false);
});

test("proposal filters reject unsupported status values safely", () => {
  const filters = proposalFiltersSchema.parse({
    query: "Website",
    status: "archived",
    page: "1",
  });

  assert.equal(filters.status, "");
  assert.equal(filters.query, "Website");
});

test("server actions derive organization from the authenticated member, not the browser", async () => {
  const actions = await readFile(
    new URL("../../src/features/proposals/actions.ts", import.meta.url),
    "utf8",
  );

  assert.match(actions, /organization_id: member\.organizationId/);
  assert.match(actions, /memberCanManageProposals\(member\)/);
  assert.match(actions, /isLeadEligibleForProposal\(lead\.status\)/);
  assert.doesNotMatch(actions, /organization_id: parsed\.data/);
});

test("proposal creation and organization ownership are enforced at the database level too", async () => {
  const migration = await readMigration();

  assert.match(
    migration,
    /created_by = \(select private\.current_profile_id\(\)\)/i,
  );
  assert.match(
    migration,
    /exists \(\s*select 1\s*from public\.leads as lead\s*where lead\.id = proposals\.lead_id\s*and lead\.organization_id = proposals\.organization_id/i,
  );
});

// -- Eligible-lead dropdown ------------------------------------------------

test("the eligible-lead query scopes to the caller's organization and qualified status", async () => {
  const queries = await readFile(
    new URL("../../src/features/proposals/queries.ts", import.meta.url),
    "utf8",
  );
  const eligibleSection = queries.slice(
    queries.indexOf("export async function getEligibleLeadOptions"),
  );

  // Organization scoping is applied to both the conflicting-proposal lookup
  // and the qualified-leads lookup, so a lead from another organization can
  // never appear and can never be treated as "conflicting" either.
  assert.match(
    eligibleSection,
    /\.from\("proposals"\)\s*\n\s*\.select\("lead_id"\)\s*\n\s*\.eq\("organization_id", organizationId\)/,
  );
  assert.match(
    eligibleSection,
    /\.from\("leads"\)\s*\n\s*\.select\("id, full_name, business_name, service_interest"\)\s*\n\s*\.eq\("organization_id", organizationId\)\s*\n\s*\.eq\("status", "qualified"\)/,
  );
});

test("the eligible-lead query excludes leads with a conflicting active proposal", async () => {
  const queries = await readFile(
    new URL("../../src/features/proposals/queries.ts", import.meta.url),
    "utf8",
  );
  const eligibleSection = queries.slice(
    queries.indexOf("export async function getEligibleLeadOptions"),
  );

  assert.match(
    eligibleSection,
    /\.not\(\s*"status",\s*"in",\s*`\(\$\{NON_CONFLICTING_PROPOSAL_STATUSES\.join\(","\)\}\)`,?\s*\)/,
  );
  assert.match(
    eligibleSection,
    /query = query\.not\("id", "in", `\(\$\{conflictingLeadIds\.join\(","\)\}\)`\);/,
  );
  assert.match(eligibleSection, /if \(conflictingLeadIds\.length > 0\)/);
});

test("only declined and expired proposals are treated as non-conflicting", async () => {
  const constants = await readFile(
    new URL("../../src/features/proposals/constants.ts", import.meta.url),
    "utf8",
  );

  assert.match(
    constants,
    /NON_CONFLICTING_PROPOSAL_STATUSES:[^=]*=\s*\[\s*"declined",\s*"expired",\s*\]/,
  );
});

test("the eligible-lead label includes full name, business name, and service interest", async () => {
  const queries = await readFile(
    new URL("../../src/features/proposals/queries.ts", import.meta.url),
    "utf8",
  );

  assert.match(
    queries,
    /`\$\{lead\.business_name\} \(\$\{lead\.full_name\}\) — \$\{lead\.service_interest\}`/,
  );
  assert.match(
    queries,
    /`\$\{lead\.full_name\} — \$\{lead\.service_interest\}`/,
  );
});

test("proposal creation re-checks for a conflicting active proposal at submit time", async () => {
  const actions = await readFile(
    new URL("../../src/features/proposals/actions.ts", import.meta.url),
    "utf8",
  );
  const createSection = actions.slice(
    actions.indexOf("export async function createProposalAction"),
    actions.indexOf("export async function updateProposalAction"),
  );

  assert.match(createSection, /\.eq\("lead_id", parsed\.data\.leadId\)/);
  assert.match(
    createSection,
    /NON_CONFLICTING_PROPOSAL_STATUSES\.join\(","\)/,
  );
  assert.match(createSection, /if \(conflictingProposal\) \{/);
});

test("an invalid lead UUID is rejected before any database call", () => {
  const result = proposalCreateSchema.safeParse(
    validProposalInput({ leadId: "not-a-uuid" }),
  );

  assert.equal(result.success, false);
  assert.equal(
    result.error.issues.some((issue) => issue.path[0] === "leadId"),
    true,
  );
});

test("the new-proposal page only preselects a lead confirmed eligible by the server", async () => {
  const newProposalPage = await readFile(
    new URL("../../src/app/admin/proposals/new/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    newProposalPage,
    /const defaultLeadId = leads\.some\(\(lead\) => lead\.id === requestedLeadId\)\s*\n\s*\? requestedLeadId\s*\n\s*: undefined;/,
  );
  assert.match(
    newProposalPage,
    /const staleRequestedLead = Boolean\(requestedLeadId\) && !defaultLeadId;/,
  );
  assert.match(newProposalPage, /staleRequestedLead \?/);
});

test("no eligible leads renders a useful empty state instead of a blank form", async () => {
  const newProposalPage = await readFile(
    new URL("../../src/app/admin/proposals/new/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(newProposalPage, /leads\.length === 0/);
  assert.match(newProposalPage, /No eligible qualified leads/);
  assert.match(newProposalPage, /EmptyState/);
});

// -- Line items and totals -----------------------------------------------

test("line item input rejects non-positive quantity and negative unit price", () => {
  assert.equal(
    proposalItemFormSchema.safeParse({
      name: "Design",
      description: "",
      quantity: "0",
      unitPrice: "1000",
    }).success,
    false,
  );
  assert.equal(
    proposalItemFormSchema.safeParse({
      name: "Design",
      description: "",
      quantity: "1",
      unitPrice: "-500",
    }).success,
    false,
  );
  assert.equal(
    proposalItemFormSchema.safeParse({
      name: "Design",
      description: "",
      quantity: "2",
      unitPrice: "1500.50",
    }).success,
    true,
  );
});

test("totals are computed server-side from numeric line items and never trusted from the browser", async () => {
  const migration = await readMigration();

  assert.match(
    migration,
    /sum\(item\.quantity \* item\.unit_price\)/i,
  );
  assert.match(
    migration,
    /new\.total := new\.subtotal - new\.discount \+ new\.tax;/i,
  );
  assert.match(migration, /constraint proposal_items_quantity_check\s*\n\s*check \(quantity > 0\)/i);
  assert.match(migration, /constraint proposal_items_unit_price_check\s*\n\s*check \(unit_price >= 0\)/i);
  assert.match(migration, /constraint proposals_subtotal_check\s*\n\s*check \(subtotal >= 0\)/i);
  assert.match(migration, /constraint proposals_total_check\s*\n\s*check \(total >= 0\)/i);

  const grantUpdateSection = migration.slice(
    migration.indexOf("grant update (\n  title,\n  summary"),
    migration.indexOf(") on public.proposals to authenticated;"),
  );
  assert.doesNotMatch(grantUpdateSection, /subtotal/);
  assert.doesNotMatch(grantUpdateSection, /\btotal\b/);
  assert.doesNotMatch(grantUpdateSection, /status/);
  assert.doesNotMatch(grantUpdateSection, /proposal_number/);
});

// -- Number generation -----------------------------------------------------

test("proposal numbers are generated only by a race-safe database counter", async () => {
  const migration = await readMigration();

  assert.match(migration, /function private\.next_proposal_number/i);
  assert.match(
    migration,
    /on conflict \(organization_id, number_year\)\s*\n\s*do update set last_value = private\.proposal_number_counters\.last_value \+ 1/i,
  );
  assert.match(
    migration,
    /constraint proposals_organization_number_key\s*\n\s*unique \(organization_id, proposal_number\)/i,
  );
  assert.match(
    migration,
    /'NXF-PROP-' \|\| current_year \|\| '-'/i,
  );
  assert.doesNotMatch(migration, /grant execute on function private\.next_proposal_number/i);
});

// -- Sending ----------------------------------------------------------------

test("send_proposal validates required sections before assigning a number or status", async () => {
  const migration = await readMigration();
  const sendFunction = migration.slice(
    migration.indexOf("create or replace function public.send_proposal"),
    migration.indexOf("create or replace function public.reissue_proposal_access_token"),
  );

  assert.match(sendFunction, /status not in \('draft', 'changes_requested'\)/i);
  assert.match(sendFunction, /btrim\(target_proposal\.title\) = ''/i);
  assert.match(sendFunction, /item_count = 0/i);

  const versionInsertIndex = sendFunction.indexOf("insert into public.proposal_versions");
  const statusUpdateIndex = sendFunction.indexOf("status = 'sent'");
  assert.ok(versionInsertIndex > -1 && statusUpdateIndex > -1);
  assert.ok(versionInsertIndex < statusUpdateIndex);
});

test("resending an email issues a new token without touching versions or numbers", async () => {
  const migration = await readMigration();
  const reissueFunction = migration.slice(
    migration.indexOf("create or replace function public.reissue_proposal_access_token"),
    migration.indexOf("create or replace function public.view_proposal_by_token"),
  );

  assert.doesNotMatch(reissueFunction, /proposal_versions/i);
  assert.doesNotMatch(reissueFunction, /proposal_number/i);
  assert.match(reissueFunction, /update public\.proposal_access_tokens/i);
});

// -- Send bug regression: send_proposal always failed with a Postgres
// "column reference \"version_number\" is ambiguous" error (42702), because
// `returns table (proposal_number text, version_number integer)` implicitly
// declares function-scoped variables of those names, colliding with the
// bare `version_number` referenced in the next-version lookup. This was
// reproduced against a real linked Supabase project: every send aborted
// before assigning a number, creating a version, issuing a token, or
// emailing anything, and the app correctly (but unhelpfully) surfaced only
// the generic SEND_ERROR because the raw Postgres message is intentionally
// excluded from SAFE_RPC_MESSAGES. -----------------------------------------

const FIX_MIGRATION_PATH = new URL(
  "../../supabase/migrations/20260801010000_fix_send_proposal_version_ambiguity.sql",
  import.meta.url,
);

async function readFixMigration() {
  return readFile(FIX_MIGRATION_PATH, "utf8");
}

test("the send_proposal fix qualifies version_number so it can never be ambiguous with the function's own OUT variable", async () => {
  const fixMigration = await readFixMigration();

  assert.match(
    fixMigration,
    /select coalesce\(max\(proposal_versions\.version_number\), 0\) \+ 1/i,
  );
  assert.match(
    fixMigration,
    /from public\.proposal_versions as proposal_versions/i,
  );
  // The historical bug pattern (bare, unqualified version_number inside the
  // aggregate) must not reappear in the fixed function body.
  assert.doesNotMatch(fixMigration, /max\(version_number\)/);
});

test("the fix migration is a new file and does not edit the already-applied phase 6 migration", async () => {
  const originalMigration = await readMigration();
  const fixMigration = await readFixMigration();

  // The original migration file still contains its original (buggy, but
  // historically applied and therefore never edited) text unchanged.
  assert.match(originalMigration, /select coalesce\(max\(version_number\), 0\) \+ 1/i);
  // The fix is a standalone `create or replace function`, re-issuing the
  // same grants, so it never needs the original file to change.
  assert.match(fixMigration, /create or replace function public\.send_proposal/i);
  assert.match(
    fixMigration,
    /grant execute on function public\.send_proposal\(uuid, text, timestamptz\)\s*\n\s*to authenticated;/i,
  );
});

test("email sending never throws and never marks the proposal sent without configuration", async () => {
  const emailService = await readFile(
    new URL("../../src/lib/email/send-proposal-email.ts", import.meta.url),
    "utf8",
  );

  assert.match(emailService, /isEmailConfigured\(\)/);
  assert.match(emailService, /reason: "not_configured"/);
  assert.match(emailService, /reason: "invalid_recipient"/);
  assert.match(emailService, /normalizeAndValidateRecipient\(input\.toEmail\)/);
  assert.match(emailService, /return sendViaResendClient\(/);
});

// -- Resend result handling (objective: SDK data/error/throw handling) -----

test("a successful Resend response (no error) is reported as ok", async () => {
  const client = {
    emails: {
      send: async () => ({ data: { id: "email_123" }, error: null }),
    },
  };

  const result = await sendViaResendClient(
    client,
    { from: "onboarding@resend.dev", to: "owner@example.com", subject: "s", html: "<p>h</p>" },
    { operation: "test", emailFromLoaded: true },
  );

  assert.deepEqual(result, { ok: true });
});

test("a Resend-returned error object is treated as a failure, never as success", async () => {
  const client = {
    emails: {
      send: async () => ({
        data: null,
        error: {
          name: "validation_error",
          statusCode: 422,
          message:
            "Invalid `to` field. Please use our testing email address instead of domains like `example.com`.",
        },
      }),
    },
  };

  const result = await sendViaResendClient(
    client,
    { from: "onboarding@resend.dev", to: "someone@example.com", subject: "s", html: "<p>h</p>" },
    { operation: "test", emailFromLoaded: true },
  );

  assert.deepEqual(result, { ok: false, reason: "provider_error" });
});

test("a thrown/rejected Resend client call is caught and reported safely, not propagated", async () => {
  const client = {
    emails: {
      send: async () => {
        throw new Error("network unreachable");
      },
    },
  };

  await assert.doesNotReject(async () => {
    const result = await sendViaResendClient(
      client,
      { from: "onboarding@resend.dev", to: "owner@example.com", subject: "s", html: "<p>h</p>" },
      { operation: "test", emailFromLoaded: true },
    );
    assert.deepEqual(result, { ok: false, reason: "provider_error" });
  });
});

test("recipient email is trimmed, lowercased, and validated before any provider call", () => {
  assert.deepEqual(normalizeAndValidateRecipient("  Owner@Example.COM  "), {
    ok: true,
    email: "owner@example.com",
  });
  assert.deepEqual(normalizeAndValidateRecipient("not-an-email"), { ok: false });
  assert.deepEqual(normalizeAndValidateRecipient(""), { ok: false });
  assert.deepEqual(normalizeAndValidateRecipient("   "), { ok: false });
});

test("Resend diagnostics never log the API key, the full URL, or the full recipient address", async () => {
  const resendResult = await readFile(
    new URL("../../src/lib/email/resend-result.ts", import.meta.url),
    "utf8",
  );
  const resendClient = await readFile(
    new URL("../../src/lib/email/resend-client.ts", import.meta.url),
    "utf8",
  );
  const emailService = await readFile(
    new URL("../../src/lib/email/send-proposal-email.ts", import.meta.url),
    "utf8",
  );

  // Diagnostics log the error name/message/status and only the recipient's
  // domain (via recipientDomain), never the raw `to` address or API key.
  assert.match(resendResult, /recipientDomain\(params\.to\)/);
  assert.match(resendResult, /httpStatus: error\.statusCode/);
  assert.doesNotMatch(resendResult, /RESEND_API_KEY/);
  assert.doesNotMatch(resendClient, /console\.(log|error)/);

  // Every reference to the API key in the email service must be wrapped in
  // Boolean(...) (presence-only), never interpolated/logged as a raw value.
  const apiKeyReferences = emailService
    .split("\n")
    .filter((line) => line.includes("RESEND_API_KEY"));
  assert.ok(apiKeyReferences.length > 0, "expected at least one RESEND_API_KEY reference");
  for (const line of apiKeyReferences) {
    assert.match(line, /Boolean\(serverEnv\.RESEND_API_KEY\)/);
  }
});

// -- Send-action error transparency and idempotency (Phase 6 send bug) -----

test("send_proposal RPC rejections surface their real, safe reason instead of a generic message", async () => {
  const actions = await readFile(
    new URL("../../src/features/proposals/actions.ts", import.meta.url),
    "utf8",
  );

  assert.match(actions, /"Only draft or changes-requested proposals can be sent\."/);
  assert.match(actions, /"At least one line item is required before sending\."/);
  assert.match(actions, /"A proposal title is required before sending\."/);
  assert.match(
    actions,
    /return \{ ok: false, message: safeRpcErrorMessage\(error, SEND_ERROR\) \};/,
  );
});

test("every message the database can actually raise for send/reissue is in the safe allowlist", async () => {
  const actions = await readFile(
    new URL("../../src/features/proposals/actions.ts", import.meta.url),
    "utf8",
  );
  const migration = await readMigration();
  const sendFunction = migration.slice(
    migration.indexOf("create or replace function public.send_proposal"),
    migration.indexOf("create or replace function public.reissue_proposal_access_token"),
  );
  const reissueFunction = migration.slice(
    migration.indexOf("create or replace function public.reissue_proposal_access_token"),
    migration.indexOf("create or replace function public.view_proposal_by_token"),
  );

  const allowlistSection = actions.slice(
    actions.indexOf("const SAFE_RPC_MESSAGES"),
    actions.indexOf("]);", actions.indexOf("const SAFE_RPC_MESSAGES")),
  );
  const raisedMessages = [
    ...sendFunction.matchAll(/message = '([^']+)'/g),
    ...reissueFunction.matchAll(/message = '([^']+)'/g),
  ].map((match) => match[1]);

  assert.ok(raisedMessages.length >= 6);
  for (const message of raisedMessages) {
    assert.ok(
      allowlistSection.includes(message),
      `expected SAFE_RPC_MESSAGES to include the exact raised message: "${message}"`,
    );
  }

  // The generic fallback itself must never be a database-raised message, or
  // a real rejection reason could be mistaken for the "unknown error" case.
  assert.ok(!raisedMessages.includes(
    "We could not send this proposal. No changes were made. Please try again.",
  ));
});

test("resending a proposal reuses reissue_proposal_access_token and cannot mint a new number or version", async () => {
  const actions = await readFile(
    new URL("../../src/features/proposals/actions.ts", import.meta.url),
    "utf8",
  );
  const resendSection = actions.slice(
    actions.indexOf("export async function resendProposalEmailAction"),
  );

  assert.match(resendSection, /supabase\.rpc\("reissue_proposal_access_token"/);
  assert.doesNotMatch(resendSection, /supabase\.rpc\("send_proposal"/);
  assert.match(resendSection, /return \{ ok: false, message \};/);
});

test("both send and resend actions trim/lowercase the recipient and handle an invalid recipient distinctly", async () => {
  const actions = await readFile(
    new URL("../../src/features/proposals/actions.ts", import.meta.url),
    "utf8",
  );
  const sendSection = actions.slice(
    actions.indexOf("export async function sendProposalAction"),
    actions.indexOf("export async function resendProposalEmailAction"),
  );
  const resendSection = actions.slice(
    actions.indexOf("export async function resendProposalEmailAction"),
  );

  for (const section of [sendSection, resendSection]) {
    assert.match(section, /lead\.email\.trim\(\)\.toLowerCase\(\)/);
    assert.match(section, /emailResult\.reason === "invalid_recipient"/);
  }
});

test("provider errors are never exposed verbatim to the browser on the send or resend path", async () => {
  const actions = await readFile(
    new URL("../../src/features/proposals/actions.ts", import.meta.url),
    "utf8",
  );

  // Dev-only diagnostics are gated so raw Supabase/RPC error detail never
  // reaches the browser outside local development.
  assert.match(
    actions,
    /if \(process\.env\.NODE_ENV !== "production"\) \{\s*\n\s*console\.error\(`\$\{operation\} Supabase error`/,
  );
  assert.match(actions, /const SEND_ERROR =/);
});

// -- Stage-by-stage dev-only diagnostics for the send pipeline -------------

test("logSendStage traces every documented stage of the send pipeline and never fires in production", async () => {
  const actions = await readFile(
    new URL("../../src/features/proposals/actions.ts", import.meta.url),
    "utf8",
  );

  assert.match(
    actions,
    /function logSendStage\(\s*\n\s*proposalId: string,\s*\n\s*stage: string,/,
  );
  assert.match(
    actions,
    /if \(process\.env\.NODE_ENV === "production"\) \{\s*\n\s*return;\s*\n\s*\}/,
  );

  const expectedStages = [
    "server_action_started",
    "proposal_loaded",
    "actor_authorization_passed",
    "access_token_generated",
    "rpc_send_proposal_started",
    "rpc_send_proposal_failed",
    "rpc_send_proposal_succeeded",
    "trusted_totals_confirmed",
    "recipient_resolved",
    "secure_link_created",
    "resend_call_started",
    "resend_result_received",
  ];
  for (const stage of expectedStages) {
    assert.ok(
      actions.includes(`"${stage}"`),
      `expected logSendStage to be called with stage "${stage}"`,
    );
  }
});

test("send-pipeline diagnostics never log secrets, cookies, complete tokens, or complete URLs", async () => {
  const actions = await readFile(
    new URL("../../src/features/proposals/actions.ts", import.meta.url),
    "utf8",
  );

  // Every logSendStage call site must be a literal, safe field bag — never
  // the raw token, a full proposalUrl, or a header/cookie value.
  const logCalls = [...actions.matchAll(/logSendStage\(([\s\S]*?)\);/g)].map(
    (match) => match[1],
  );
  assert.ok(logCalls.length >= 10);
  for (const call of logCalls) {
    assert.doesNotMatch(call, /rawToken/);
    assert.doesNotMatch(call, /tokenHash/);
    assert.doesNotMatch(call, /proposalUrl/);
    assert.doesNotMatch(call, /RESEND_API_KEY/);
    assert.doesNotMatch(call, /SUPABASE_SECRET_KEY/);
    assert.doesNotMatch(call, /cookie/i);
    assert.doesNotMatch(call, /Bearer /);
    assert.doesNotMatch(call, /authorization header/i);
  }

  // The masked/domain-only helpers are used for recipient logging, never
  // the raw resolved address.
  assert.match(actions, /masked: maskEmailForLogging\(resolvedRecipient\)/);
  assert.match(actions, /domain: recipientDomain\(resolvedRecipient\)/);
});

test("maskEmailForLogging never exposes a complete local part", () => {
  assert.equal(maskEmailForLogging("delivered@resend.dev"), "d*******d@resend.dev");
  assert.equal(maskEmailForLogging("ab@example.com"), "a*@example.com");
  assert.equal(maskEmailForLogging("a@example.com"), "a*@example.com");
  assert.equal(maskEmailForLogging("not-an-email"), "(invalid)");

  for (const masked of [
    maskEmailForLogging("delivered@resend.dev"),
    maskEmailForLogging("owner@example.com"),
  ]) {
    assert.doesNotMatch(masked, /^delivered@/);
    assert.doesNotMatch(masked, /^owner@/);
  }
});

// -- Ordering guarantees: a failure before the database write must never --
// -- reach Resend, and token generation happens before any DB mutation. ---

test("recipient is always resolved from the linked lead's email, never a client, version snapshot, or stale field", async () => {
  const actions = await readFile(
    new URL("../../src/features/proposals/actions.ts", import.meta.url),
    "utf8",
  );
  const sendSection = actions.slice(
    actions.indexOf("export async function sendProposalAction"),
    actions.indexOf("export async function resendProposalEmailAction"),
  );
  const resendSection = actions.slice(
    actions.indexOf("export async function resendProposalEmailAction"),
  );

  for (const section of [sendSection, resendSection]) {
    assert.match(section, /\.from\("leads"\)\s*\n\s*\.select\("full_name, email"\)/);
    assert.doesNotMatch(section, /snapshot\.email/);
    assert.doesNotMatch(section, /\.from\("clients"\)/);
  }
});

test("a failed database preparation (send_proposal RPC error) returns before Resend is ever called", async () => {
  const actions = await readFile(
    new URL("../../src/features/proposals/actions.ts", import.meta.url),
    "utf8",
  );
  const sendSection = actions.slice(
    actions.indexOf("export async function sendProposalAction"),
    actions.indexOf("export async function resendProposalEmailAction"),
  );

  const rpcCallIndex = sendSection.indexOf('supabase.rpc("send_proposal"');
  const rpcFailureReturnIndex = sendSection.indexOf(
    "return { ok: false, message: safeRpcErrorMessage(error, SEND_ERROR) };",
  );
  const sendEmailCallIndex = sendSection.indexOf("await sendProposalEmail({");

  assert.ok(rpcCallIndex > -1 && rpcFailureReturnIndex > -1 && sendEmailCallIndex > -1);
  // The early return on RPC failure appears before the email call in the
  // source, and the RPC call itself appears before both.
  assert.ok(rpcCallIndex < rpcFailureReturnIndex);
  assert.ok(rpcFailureReturnIndex < sendEmailCallIndex);
});

test("secure access token generation happens before any database mutation, so a token-generation failure cannot leave a partial send", async () => {
  const actions = await readFile(
    new URL("../../src/features/proposals/actions.ts", import.meta.url),
    "utf8",
  );
  const sendSection = actions.slice(
    actions.indexOf("export async function sendProposalAction"),
    actions.indexOf("export async function resendProposalEmailAction"),
  );

  const tokenGenIndex = sendSection.indexOf("generateProposalAccessToken()");
  const rpcCallIndex = sendSection.indexOf('supabase.rpc("send_proposal"');

  assert.ok(tokenGenIndex > -1 && rpcCallIndex > -1);
  assert.ok(tokenGenIndex < rpcCallIndex);
});

test("the email module has no database access, so an email failure can never itself mark a proposal sent", async () => {
  const files = await Promise.all(
    [
      "../../src/lib/email/send-proposal-email.ts",
      "../../src/lib/email/resend-client.ts",
      "../../src/lib/email/resend-result.ts",
      "../../src/lib/email/templates/proposal-email.ts",
    ].map((relativePath) =>
      readFile(new URL(relativePath, import.meta.url), "utf8"),
    ),
  );

  for (const file of files) {
    assert.doesNotMatch(file, /@\/lib\/supabase/);
    assert.doesNotMatch(file, /createClient/);
    assert.doesNotMatch(file, /\.rpc\(/);
  }
});

test("secure link generation always produces a valid absolute URL and never a bare/relative path", () => {
  // Mirrors token.ts's encoding (crypto.randomBytes(32).toString("base64url"))
  // without importing that module directly — it is marked "server-only",
  // which throws outside a Server Component/React Server condition, so
  // plain `node --test` cannot import it.
  for (let i = 0; i < 20; i += 1) {
    const rawToken = randomBytes(32).toString("base64url");
    const proposalUrl = `http://localhost:3000/proposal/${rawToken}`;
    const parsed = new URL(proposalUrl);

    assert.equal(parsed.origin, "http://localhost:3000");
    assert.ok(parsed.pathname.startsWith("/proposal/"));
    assert.equal(parsed.pathname, `/proposal/${rawToken}`);
  }
});

test("the send button always returns to its idle label and never disables itself based on the result", async () => {
  const button = await readFile(
    new URL(
      "../../src/features/proposals/components/send-proposal-button.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(button, /disabled=\{isPending\}/);
  assert.doesNotMatch(button, /disabled=\{isPending \|\| result/);
  assert.doesNotMatch(button, /disabled=\{result\?\.ok/);
  assert.match(button, /setResult\(response\);/);
  assert.match(button, /\{isPending \? "Sending…" : "Send proposal"\}/);
});

// -- Secure client view -------------------------------------------------

test("token-based functions reject malformed, expired, or revoked tokens uniformly", async () => {
  const migration = await readMigration();
  const viewFunction = migration.slice(
    migration.indexOf("create or replace function public.view_proposal_by_token"),
    migration.indexOf("create or replace function public.accept_proposal_by_token"),
  );

  assert.match(viewFunction, /p_token_hash !~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(viewFunction, /revoked_at is null\s*\n\s*and token\.expires_at > pg_catalog\.now\(\)/i);
  assert.match(viewFunction, /return null;/);
});

test("client-safe fields exclude internal-only proposal columns", async () => {
  const migration = await readMigration();
  const viewFunction = migration.slice(
    migration.indexOf("create or replace function public.view_proposal_by_token"),
    migration.indexOf("revoke all on function public.view_proposal_by_token"),
  );

  assert.doesNotMatch(viewFunction, /'lead_id'/);
  assert.doesNotMatch(viewFunction, /'client_id'/);
  assert.doesNotMatch(viewFunction, /'created_by'/);
  assert.doesNotMatch(viewFunction, /'organization_id'/);
});

test("first valid view records viewed_at only once and never touches other statuses", async () => {
  const migration = await readMigration();
  const viewFunction = migration.slice(
    migration.indexOf("create or replace function public.view_proposal_by_token"),
    migration.indexOf("create or replace function public.accept_proposal_by_token"),
  );

  assert.match(
    viewFunction,
    /if target_proposal\.status = 'sent' then\s*\n\s*update public\.proposals\s*\n\s*set status = 'viewed', viewed_at = pg_catalog\.now\(\)/i,
  );
});

test("internal proposal preview uses the authenticated query, never the client token view", async () => {
  const previewPage = await readFile(
    new URL(
      "../../src/app/admin/proposals/[proposalId]/preview/page.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(previewPage, /getProposalDetail\(/);
  assert.doesNotMatch(previewPage, /viewProposalByTokenAction/);
  assert.match(previewPage, /does not mark the\s*\n\s*proposal as viewed/i);
});

// -- Acceptance ---------------------------------------------------------

test("acceptance is idempotent and rejects expired or ineligible statuses", async () => {
  const migration = await readMigration();
  const acceptFunction = migration.slice(
    migration.indexOf("create or replace function public.accept_proposal_by_token"),
    migration.indexOf("create or replace function public.decline_proposal_by_token"),
  );

  assert.match(acceptFunction, /already_accepted', true/);
  assert.match(acceptFunction, /status not in \('sent', 'viewed'\)/);
  assert.match(acceptFunction, /valid_until < current_date/);
});

test("accepted proposals and their line items become immutable via RLS", async () => {
  const migration = await readMigration();

  assert.match(
    migration,
    /proposals_update_proposal_managers[\s\S]*?using \(\s*\(\s*select private\.has_internal_role\(\s*proposals\.organization_id,\s*array\['super_admin', 'admin'\]\s*\)\s*\)\s*and proposals\.status in \('draft', 'changes_requested'\)/,
  );
  assert.match(
    migration,
    /proposal_items_update_proposal_managers[\s\S]*?proposal\.status in \('draft', 'changes_requested'\)/,
  );
  assert.match(
    migration,
    /proposal_items_delete_proposal_managers[\s\S]*?proposal\.status in \('draft', 'changes_requested'\)/,
  );
});

test("status-change activity only fires once per actual transition", async () => {
  const migration = await readMigration();

  assert.match(
    migration,
    /if old\.status is distinct from new\.status and new\.lead_id is not null then/i,
  );
});

// -- Changes requested ----------------------------------------------------

test("a requested-changes message is required by both the client schema and the database function", async () => {
  assert.equal(
    requestProposalChangesSchema.safeParse({ message: "" }).success,
    false,
  );
  assert.equal(
    requestProposalChangesSchema.safeParse({ message: "Please adjust the timeline." })
      .success,
    true,
  );

  const migration = await readMigration();
  const requestChangesFunction = migration.slice(
    migration.indexOf(
      "create or replace function public.request_proposal_changes_by_token",
    ),
  );
  assert.match(requestChangesFunction, /normalized_message = ''/);
  assert.match(requestChangesFunction, /status not in \('sent', 'viewed'\)/);
});

test("proposal_versions grants no write privileges to the authenticated role", async () => {
  const migration = await readMigration();

  assert.match(migration, /grant select on table public\.proposal_versions to authenticated;/);
  assert.doesNotMatch(
    migration,
    /grant (insert|update|delete)[^;]*on (table )?public\.proposal_versions/i,
  );
});

// -- Versioning -----------------------------------------------------------

test("versions are sequential and unique per proposal", async () => {
  const migration = await readMigration();

  assert.match(
    migration,
    /select coalesce\(max\(version_number\), 0\) \+ 1\s*\n\s*into next_version/i,
  );
  assert.match(
    migration,
    /constraint proposal_versions_proposal_version_key\s*\n\s*unique \(proposal_id, version_number\)/i,
  );
});

// -- Cost estimator ---------------------------------------------------------

test("the cost estimate is a pure calculation over the centralized pricing config", () => {
  const baseline = computeEstimateRange("Business website", []);
  const withFeatures = computeEstimateRange("Business website", [
    "Online payments",
    "Admin dashboard",
  ]);

  assert.ok(withFeatures.min > baseline.min);
  assert.ok(withFeatures.max > baseline.max);
  assert.equal(
    withFeatures.min,
    baseline.min + 12000 + 10000,
  );
  assert.equal(
    withFeatures.max,
    baseline.max + 25000 + 20000,
  );
});

test("cost estimator UI clearly labels the estimate as non-final", async () => {
  const form = await readFile(
    new URL(
      "../../src/features/estimator/components/cost-estimator-form.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(form, /Non-final estimate/);
});

test("invalid cost estimator lead-capture input is rejected", () => {
  const base = {
    projectType: "Business website",
    features: [],
    details: "We need a new website for our growing business.",
    fullName: "Ava Reyes",
    businessName: "Acme Studio",
    email: "ava@example.com",
    phone: "",
    targetTimeline: "Within 1 month",
    companyWebsite: "",
    startedAt: Date.now() - 5000,
  };

  assert.equal(estimatorLeadCaptureSchema.safeParse(base).success, true);
  assert.equal(
    estimatorLeadCaptureSchema.safeParse({ ...base, details: "too short" }).success,
    false,
  );
  assert.equal(
    estimatorLeadCaptureSchema.safeParse({ ...base, email: "not-an-email" }).success,
    false,
  );
  assert.equal(
    estimatorLeadCaptureSchema.safeParse({
      ...base,
      companyWebsite: "https://spam.example",
    }).success,
    false,
  );
  assert.equal(
    estimatorLeadCaptureSchema.safeParse({ ...base, startedAt: Date.now() }).success,
    false,
  );
});

test("cost estimator lead capture reuses the existing submit_project_inquiry mechanism", async () => {
  const estimatorActions = await readFile(
    new URL("../../src/features/estimator/actions.ts", import.meta.url),
    "utf8",
  );

  assert.match(estimatorActions, /supabase\.rpc\("submit_project_inquiry", payload\)/);
  assert.doesNotMatch(estimatorActions, /\.from\("leads"\)\.insert/);
});
