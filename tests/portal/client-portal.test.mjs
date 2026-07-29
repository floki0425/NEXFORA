import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canManageClientInvitations,
  memberCanManageClientInvitations,
} from "../../src/features/client-invitations/permissions.ts";
import {
  CLIENT_INVITATION_TTL_DAYS_OPTIONS,
  CLIENT_ROLE_LABELS,
  CLIENT_ROLES,
  INVITATION_STATUSES,
} from "../../src/features/client-invitations/constants.ts";
import { inviteClientUserSchema } from "../../src/features/client-invitations/schemas.ts";
import { acceptInvitationSchema } from "../../src/features/portal/invitations/schemas.ts";
import { portalProjectIdSchema } from "../../src/features/portal/projects/schemas.ts";
import { PORTAL_NAVIGATION } from "../../src/config/portal-navigation.ts";

const MIGRATION_PATH = new URL(
  "../../supabase/migrations/20260802000000_phase_7_client_portal.sql",
  import.meta.url,
);

async function readMigration() {
  return readFile(MIGRATION_PATH, "utf8");
}

async function readSrcFile(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

function slice(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  const end = endMarker ? text.indexOf(endMarker, start) : text.length;
  return text.slice(start, end === -1 ? text.length : end);
}

// -- Client roles / statuses -------------------------------------------

test("client roles and invitation statuses match the documented vocabulary", () => {
  assert.deepEqual(CLIENT_ROLES, ["owner", "manager", "viewer"]);
  assert.deepEqual(INVITATION_STATUSES, [
    "pending",
    "accepted",
    "expired",
    "revoked",
  ]);
  for (const role of CLIENT_ROLES) {
    assert.ok(CLIENT_ROLE_LABELS[role]);
  }
});

test("only super_admin and admin can manage client invitations", () => {
  assert.equal(canManageClientInvitations("super_admin"), true);
  assert.equal(canManageClientInvitations("admin"), true);
  assert.equal(canManageClientInvitations("project_manager"), false);
  assert.equal(canManageClientInvitations("team_member"), false);
  assert.equal(
    memberCanManageClientInvitations({ role: "team_member" }),
    false,
  );
});

// -- Invitation input validation -----------------------------------------

test("invite schema rejects an invalid email, invalid role, and invalid expiration", () => {
  const base = { email: "owner@example.com", role: "viewer", expiresInDays: "7" };

  assert.equal(inviteClientUserSchema.safeParse(base).success, true);
  assert.equal(
    inviteClientUserSchema.safeParse({ ...base, email: "not-an-email" }).success,
    false,
  );
  assert.equal(
    inviteClientUserSchema.safeParse({ ...base, role: "super_admin" }).success,
    false,
  );
  assert.equal(
    inviteClientUserSchema.safeParse({ ...base, expiresInDays: "9999" }).success,
    false,
  );
  for (const days of CLIENT_INVITATION_TTL_DAYS_OPTIONS) {
    assert.equal(
      inviteClientUserSchema.safeParse({ ...base, expiresInDays: String(days) })
        .success,
      true,
    );
  }
});

// -- Acceptance input validation ------------------------------------------

test("accept-invitation schema requires a full name and matching passwords only in create mode", () => {
  assert.equal(
    acceptInvitationSchema.safeParse({
      mode: "create",
      fullName: "",
      password: "longenough1",
      passwordConfirmation: "longenough1",
    }).success,
    false,
  );
  assert.equal(
    acceptInvitationSchema.safeParse({
      mode: "create",
      fullName: "Ada Reyes",
      password: "longenough1",
      passwordConfirmation: "different",
    }).success,
    false,
  );
  assert.equal(
    acceptInvitationSchema.safeParse({
      mode: "create",
      fullName: "Ada Reyes",
      password: "longenough1",
      passwordConfirmation: "longenough1",
    }).success,
    true,
  );
  // sign_in mode needs neither a full name nor a confirmation.
  assert.equal(
    acceptInvitationSchema.safeParse({
      mode: "sign_in",
      password: "longenough1",
    }).success,
    true,
  );
  assert.equal(
    acceptInvitationSchema.safeParse({
      mode: "create",
      fullName: "Ada Reyes",
      password: "short",
      passwordConfirmation: "short",
    }).success,
    false,
  );
});

test("a project id must be a valid UUID before any portal query runs", () => {
  assert.equal(portalProjectIdSchema.safeParse("not-a-uuid").success, false);
  assert.equal(
    portalProjectIdSchema.safeParse("33333333-3333-4333-8333-333333333333")
      .success,
    true,
  );
});

// -- Portal navigation: no dead links for later phases --------------------

test("portal navigation lists only active Phase 7 functionality", () => {
  const hrefs = PORTAL_NAVIGATION.map((item) => item.href);
  assert.deepEqual(hrefs, ["/portal", "/portal/projects"]);
  for (const path of ["files", "revisions", "invoices", "support", "settings"]) {
    assert.ok(!hrefs.some((href) => href.includes(path)));
  }
});

// -- Migration: schema shape ------------------------------------------------

test("client_users matches the documented schema exactly and mutates only through accept_client_invitation", async () => {
  const migration = await readMigration();
  const clientUsersSection = slice(
    migration,
    "create table public.client_users",
    "create table public.client_invitations",
  );

  assert.match(clientUsersSection, /role text not null default 'viewer'/);
  assert.match(
    clientUsersSection,
    /check \(role in \('owner', 'manager', 'viewer'\)\)/,
  );
  assert.match(
    clientUsersSection,
    /check \(status in \('active', 'invited', 'suspended'\)\)/,
  );
  assert.match(clientUsersSection, /unique \(client_id, user_id\)/);

  assert.doesNotMatch(migration, /grant insert[^;]*on[^;]*client_users/i);
  assert.doesNotMatch(migration, /grant update[^;]*on[^;]*client_users/i);
  assert.match(
    migration,
    /grant select on table public\.client_users to authenticated;/,
  );
});

test("client_invitations matches the documented schema and adds only a partial unique index for safe resend", async () => {
  const migration = await readMigration();
  const invitationsSection = slice(
    migration,
    "create table public.client_invitations",
    "-- Row Level Security",
  );

  for (const column of [
    "client_id",
    "email",
    "role",
    "token_hash",
    "status",
    "expires_at",
    "accepted_at",
    "created_by",
    "created_at",
  ]) {
    assert.ok(
      invitationsSection.includes(column),
      `expected client_invitations to include documented column "${column}"`,
    );
  }

  assert.match(
    invitationsSection,
    /check \(status in \('pending', 'accepted', 'expired', 'revoked'\)\)/,
  );
  assert.match(invitationsSection, /token_hash ~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(
    migration,
    /create unique index client_invitations_pending_unique\s*\n\s*on public\.client_invitations \(client_id, email\)\s*\n\s*where status = 'pending';/,
  );
  assert.doesNotMatch(migration, /grant insert[^;]*on[^;]*client_invitations/i);
  assert.doesNotMatch(migration, /grant update[^;]*on[^;]*client_invitations/i);
});

test("anonymous access to client_users and client_invitations is fully denied", async () => {
  const migration = await readMigration();

  assert.match(
    migration,
    /revoke all privileges\s*\n\s*on table public\.client_users, public\.client_invitations\s*\n\s*from public, anon, authenticated;/,
  );
  assert.doesNotMatch(migration, /to anon[^;]*client_users/i);
  assert.doesNotMatch(migration, /to anon[^;]*client_invitations/i);
});

test("no new client-facing RLS policy exists on clients, projects, or milestones", async () => {
  const migration = await readMigration();

  assert.doesNotMatch(migration, /create policy[^;]*\n?on public\.clients/i);
  assert.doesNotMatch(migration, /create policy[^;]*\n?on public\.projects/i);
  assert.doesNotMatch(migration, /create policy[^;]*\n?on public\.milestones/i);
  assert.doesNotMatch(migration, /create policy[^;]*\n?on public\.tasks/i);
});

// -- Client isolation path -------------------------------------------------

test("private.active_client_id resolves a client only for exactly one active membership with an active client", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "create or replace function private.active_client_id",
    "revoke all on function private.active_client_id",
  );

  assert.match(section, /membership\.status = 'active'/);
  assert.match(section, /client\.status = 'active'/);
  assert.match(section, /having count\(\*\) = 1/);
});

test("get_active_client_membership and get_client_projects only ever return client-safe columns", async () => {
  const migration = await readMigration();
  const membershipSection = slice(
    migration,
    "create or replace function public.get_active_client_membership",
    "create or replace function public.get_client_projects",
  );
  const projectsSection = slice(
    migration,
    "create or replace function public.get_client_projects",
    "create or replace function public.get_client_project_detail",
  );

  assert.doesNotMatch(membershipSection, /billing_address/);
  assert.doesNotMatch(membershipSection, /\bnotes\b/);
  assert.doesNotMatch(projectsSection, /organization_id/);
  assert.doesNotMatch(projectsSection, /project_manager_id/);
  assert.match(projectsSection, /limit 50/);
});

test("get_client_project_detail returns the same null result for a nonexistent project and a foreign client's project, and never includes tasks", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "create or replace function public.get_client_project_detail",
    "create or replace function public.create_or_resend_client_invitation",
  );

  assert.match(section, /where project\.id = target_project_id\s*\n\s*and project\.client_id = resolved_client_id;/);
  assert.match(section, /if not found then\s*\n\s*return null;/);
  assert.doesNotMatch(section, /from public\.tasks/i);
  assert.doesNotMatch(section, /organization_id/);
  assert.doesNotMatch(section, /project_manager_id/);
});

// -- Invitation create/resend/revoke ---------------------------------------

test("create_or_resend_client_invitation re-validates role, email, expiration, and organization ownership server-side", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "create or replace function public.create_or_resend_client_invitation",
    "create or replace function public.get_client_invitation_by_token",
  );

  assert.match(section, /actor_role not in \('super_admin', 'admin'\)/);
  assert.match(section, /p_role not in \('owner', 'manager', 'viewer'\)/);
  assert.match(section, /p_expires_at <= pg_catalog\.now\(\)/);
  assert.match(
    section,
    /client\.organization_id = actor_organization_id/,
  );
  assert.match(
    section,
    /This person already has active portal access for this client\./,
  );
});

test("inviting or resending upserts the same pending row atomically instead of creating duplicates", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "create or replace function public.create_or_resend_client_invitation",
    "create or replace function public.get_client_invitation_by_token",
  );

  assert.match(
    section,
    /on conflict \(client_id, email\) where status = 'pending'/,
  );
  assert.match(section, /do update set\s*\n\s*token_hash = excluded\.token_hash,\s*\n\s*expires_at = excluded\.expires_at,/);
  assert.match(section, /\(xmax = 0\)/);
});

test("revoke_client_invitation only affects a pending row and is organization-scoped", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "create or replace function public.revoke_client_invitation",
  );

  assert.match(section, /actor_role not in \('super_admin', 'admin'\)/);
  assert.match(section, /and invitation\.status = 'pending';/);
});

// -- Acceptance -------------------------------------------------------------

test("accept_client_invitation requires the authenticated email to match the invitation and rejects a token for a different email or client", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "create or replace function public.accept_client_invitation",
    "create or replace function public.revoke_client_invitation",
  );

  assert.match(
    section,
    /caller_email text := lower\(btrim\(\(select auth\.jwt\(\) ->> 'email'\)\)\);/,
  );
  assert.match(
    section,
    /lower\(btrim\(target_invitation\.email\)\) <> caller_email/,
  );
  // The invitation row itself supplies client_id and role — never a
  // browser-submitted value.
  assert.doesNotMatch(section, /p_client_id/);
  assert.doesNotMatch(section, /p_role/);
});

test("acceptance is idempotent: an already-active membership short-circuits before the pending/expiry check", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "create or replace function public.accept_client_invitation",
    "create or replace function public.revoke_client_invitation",
  );

  const shortCircuitIndex = section.indexOf("already_accepted', true");
  const expiryCheckIndex = section.indexOf(
    "target_invitation.status <> 'pending'",
  );

  assert.ok(shortCircuitIndex > -1 && expiryCheckIndex > -1);
  assert.ok(shortCircuitIndex < expiryCheckIndex);
});

test("acceptance creates the client_users row exactly once via an idempotent upsert and marks the invitation accepted exactly once", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "create or replace function public.accept_client_invitation",
    "create or replace function public.revoke_client_invitation",
  );

  assert.match(
    section,
    /insert into public\.client_users \(client_id, user_id, role, status\)/,
  );
  assert.match(section, /on conflict \(client_id, user_id\)\s*\n\s*do update set status = 'active'/);
  assert.match(
    section,
    /update public\.client_invitations\s*\n\s*set status = 'accepted', accepted_at = pg_catalog\.now\(\)\s*\n\s*where id = target_invitation\.id\s*\n\s*and status = 'pending';/,
  );
});

test("acceptance never creates an internal organization_members row", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "create or replace function public.accept_client_invitation",
    "create or replace function public.revoke_client_invitation",
  );

  assert.doesNotMatch(section, /organization_members/);
});

test("both onboarding branches converge on the same accept_client_invitation call", async () => {
  const actions = await readSrcFile(
    "../../src/features/portal/invitations/actions.ts",
  );

  const acceptCalls = [
    ...actions.matchAll(/rpc\(\s*\n?\s*"accept_client_invitation"/g),
  ];
  assert.ok(acceptCalls.length >= 2);
  assert.match(actions, /createError\?\.code === "email_exists"/);
  assert.match(actions, /switchToMode: "sign_in"/);
  assert.match(
    actions,
    /admin\.from\("profiles"\)\.insert\(\{\s*\n\s*auth_user_id: createdUser\.user\.id,\s*\n\s*full_name: parsed\.data\.fullName,/,
  );
});

// -- Auth onboarding never uses open public signup -------------------------

test("client onboarding uses the admin client to provision a new Auth user, never public signup", async () => {
  const actions = await readSrcFile(
    "../../src/features/portal/invitations/actions.ts",
  );

  assert.match(actions, /createAdminClient\(\)/);
  assert.doesNotMatch(actions, /\.auth\.signUp\(/);
});

// -- Logging never contains secrets -----------------------------------------

test("client-invitations and portal actions never log a raw token, RESEND_API_KEY, or SUPABASE_SECRET_KEY", async () => {
  const files = await Promise.all(
    [
      "../../src/features/client-invitations/actions.ts",
      "../../src/features/portal/invitations/actions.ts",
      "../../src/features/portal/auth/actions.ts",
    ].map(readSrcFile),
  );

  for (const file of files) {
    const consoleCalls = [...file.matchAll(/console\.(?:log|error)\(([\s\S]*?)\);/g)]
      .map((match) => match[1]);
    for (const call of consoleCalls) {
      assert.doesNotMatch(call, /rawToken/);
      assert.doesNotMatch(call, /RESEND_API_KEY/);
      assert.doesNotMatch(call, /SUPABASE_SECRET_KEY/);
    }
  }
});

// -- Email -------------------------------------------------------------

test("the client invitation email never throws and degrades safely, reusing the shared Resend infrastructure", async () => {
  const emailService = await readSrcFile(
    "../../src/lib/email/send-client-invitation-email.ts",
  );

  assert.match(emailService, /isEmailConfigured\(\)/);
  assert.match(emailService, /reason: "not_configured"/);
  assert.match(emailService, /reason: "invalid_recipient"/);
  assert.match(emailService, /normalizeAndValidateRecipient\(input\.toEmail\)/);
  assert.match(emailService, /return sendViaResendClient\(/);
  assert.match(emailService, /idempotencyKey: `client-invitation:/);
});

test("invitation email failure still reports the invitation as created, with a safe retry message", async () => {
  const actions = await readSrcFile(
    "../../src/features/client-invitations/actions.ts",
  );
  const emailSection = slice(
    actions,
    "async function sendInvitationEmail",
    "export async function inviteClientUserAction",
  );

  assert.match(emailSection, /if \(!emailResult\.ok\) \{/);
  assert.match(emailSection, /return \{ ok: true, message \};/);
  assert.doesNotMatch(emailSection, /return \{ ok: false/);
});

test("resend-result's idempotency key support is additive and does not change the existing proposal email call", async () => {
  const resendResult = await readSrcFile("../../src/lib/email/resend-result.ts");
  const proposalEmail = await readSrcFile(
    "../../src/lib/email/send-proposal-email.ts",
  );

  assert.match(resendResult, /options\?: ResendSendOptions/);
  assert.doesNotMatch(proposalEmail, /idempotencyKey/);
});

// -- Portal routes and proxy protection -------------------------------------

test("the proxy protects /portal routes but excludes /portal/login and the accept-invitation route", async () => {
  const proxy = await readSrcFile("../../src/lib/supabase/proxy.ts");

  assert.match(proxy, /PORTAL_PUBLIC_PATHS = \["\/portal\/login", "\/portal\/invitations\/accept"\]/);
  assert.match(proxy, /function isProtectedPortalPath/);
  assert.match(proxy, /loginUrl\.pathname = isAdminPath\(pathname\) \? LOGIN_PATH : PORTAL_LOGIN_PATH;/);
});

test("portal login always redirects to a fixed destination, never an attacker-controlled next parameter", async () => {
  const actions = await readSrcFile("../../src/features/portal/auth/actions.ts");

  assert.match(actions, /redirect\("\/portal"\);/);
  assert.doesNotMatch(actions, /searchParams\.get\("next"\)/);
  assert.doesNotMatch(actions, /nextPath/);
});

test("portal login resolves client membership independently of internal organization membership", async () => {
  const actions = await readSrcFile("../../src/features/portal/auth/actions.ts");

  assert.match(actions, /get_active_client_membership/);
  assert.doesNotMatch(actions, /getInternalMemberForUser/);
  assert.doesNotMatch(actions, /organization_members/);
});

test("requirePortalMember throws the existing generic auth errors rather than inventing portal-specific ones", async () => {
  const portalAuth = await readSrcFile("../../src/lib/auth/portal.ts");

  assert.match(portalAuth, /throw new AuthenticationRequiredError\(\);/);
  assert.match(portalAuth, /throw new AuthorizationDeniedError\(\);/);
  assert.match(portalAuth, /throw new AuthorizationLookupError\(\);/);
});

test("every portal page independently calls requirePortalMember rather than trusting the layout alone", async () => {
  const dashboardPage = await readSrcFile(
    "../../src/app/portal/(portal)/page.tsx",
  );
  const projectsPage = await readSrcFile(
    "../../src/app/portal/(portal)/projects/page.tsx",
  );
  const projectDetailPage = await readSrcFile(
    "../../src/app/portal/(portal)/projects/[projectId]/page.tsx",
  );
  const layout = await readSrcFile("../../src/app/portal/(portal)/layout.tsx");

  for (const page of [dashboardPage, projectsPage, projectDetailPage]) {
    assert.match(page, /requirePortalMember\(\)/);
  }
  assert.match(layout, /requirePortalMember\(\)/);
});

// -- Portal data: only safe, existing information ---------------------------

test("the dashboard only ever renders active/total projects, never fake Files/Revisions/Invoices/Support data", async () => {
  const dashboardQueries = await readSrcFile(
    "../../src/features/portal/dashboard/queries.ts",
  );
  const dashboardPage = await readSrcFile(
    "../../src/app/portal/(portal)/page.tsx",
  );

  assert.match(dashboardQueries, /ACTIVE_PROJECT_STATUSES/);
  for (const forbidden of ["Recent Files", "Open Revisions", "Outstanding Invoice", "Support"]) {
    assert.ok(!dashboardPage.includes(forbidden));
  }
  assert.match(dashboardPage, /EmptyState/);
});

test("the project detail page renders a client-safe not-found state for a missing or foreign project", async () => {
  const notFoundPage = await readSrcFile(
    "../../src/app/portal/(portal)/projects/[projectId]/not-found.tsx",
  );

  assert.match(notFoundPage, /Project not found/);
});

// -- Zero-argument RPC calls must omit the args parameter entirely --------
//
// get_active_client_membership() and get_client_projects() take no
// parameters. The generated Database["public"]["Functions"] type declares
// their Args as `never`, so `supabase.rpc(name, {})` fails to type-check
// (`{}` is not assignable to `never`) even though the call works at
// runtime. The fix is to omit the second argument entirely, never to cast
// past the generated type.

test("get_active_client_membership is called with no second argument in both requirePortalMember and portalLogin", async () => {
  const portalAuthLib = await readSrcFile("../../src/lib/auth/portal.ts");
  const portalLoginAction = await readSrcFile(
    "../../src/features/portal/auth/actions.ts",
  );

  for (const file of [portalAuthLib, portalLoginAction]) {
    assert.match(file, /supabase\.rpc\("get_active_client_membership"\)/);
    // Never re-introduce the invalid empty-object argument.
    assert.doesNotMatch(
      file,
      /supabase\.rpc\(\s*"get_active_client_membership",\s*\{\}/,
    );
  }
});

test("get_client_projects is called with no second argument", async () => {
  const projectsQueries = await readSrcFile(
    "../../src/features/portal/projects/queries.ts",
  );

  assert.match(projectsQueries, /supabase\.rpc\("get_client_projects"\)/);
  assert.doesNotMatch(
    projectsQueries,
    /supabase\.rpc\(\s*"get_client_projects",\s*\{\}/,
  );
});

test("no zero-argument RPC call anywhere in src passes an empty-object second argument", async () => {
  const zeroArgFunctionNames = ["get_active_client_membership", "get_client_projects"];

  const filesToCheck = [
    "../../src/lib/auth/portal.ts",
    "../../src/features/portal/auth/actions.ts",
    "../../src/features/portal/projects/queries.ts",
    "../../src/features/portal/dashboard/queries.ts",
  ];

  for (const relativePath of filesToCheck) {
    const contents = await readSrcFile(relativePath);
    for (const fnName of zeroArgFunctionNames) {
      assert.doesNotMatch(
        contents,
        new RegExp(`rpc\\(\\s*"${fnName}",\\s*\\{\\}`),
        `expected no "${fnName}" call with an empty-object argument in ${relativePath}`,
      );
    }
  }
});

test("no unsafe cast workaround was used to silence the Args mismatch", async () => {
  // Scoped to the zero-argument RPC call sites themselves, not the whole
  // file — these files legitimately cast RPC *return* data elsewhere
  // (`as unknown as ClientProjectRow[]`, matching the same pattern already
  // used by proposals/queries.ts), which is unrelated to this fix and must
  // not be flagged.
  const zeroArgCallSites = [
    {
      file: "../../src/lib/auth/portal.ts",
      pattern: /supabase\.rpc\("get_active_client_membership"\)[^;]*;/,
    },
    {
      file: "../../src/features/portal/auth/actions.ts",
      pattern: /supabase\.rpc\("get_active_client_membership"\)[^;]*;/,
    },
    {
      file: "../../src/features/portal/projects/queries.ts",
      pattern: /supabase\.rpc\("get_client_projects"\)[^;]*;/,
    },
  ];

  for (const { file, pattern } of zeroArgCallSites) {
    const contents = await readSrcFile(file);
    const match = contents.match(pattern);
    assert.ok(match, `expected to find the zero-argument rpc call in ${file}`);

    const callSite = match[0];
    assert.doesNotMatch(callSite, /as\s+never/);
    assert.doesNotMatch(callSite, /as\s+undefined/);
    assert.doesNotMatch(callSite, /as\s+unknown\s+as/);
    assert.doesNotMatch(callSite, /@ts-ignore/);
    assert.doesNotMatch(callSite, /@ts-expect-error/);
  }

  // No file anywhere in the fix should suppress the type checker outright.
  const files = await Promise.all(zeroArgCallSites.map(({ file }) => readSrcFile(file)));
  for (const file of files) {
    assert.doesNotMatch(file, /@ts-ignore/);
    assert.doesNotMatch(file, /@ts-expect-error/);
  }
});

test("RPC-returned errors for the zero-argument calls are still handled safely, not assumed away", async () => {
  const portalAuthLib = await readSrcFile("../../src/lib/auth/portal.ts");
  const portalLoginAction = await readSrcFile(
    "../../src/features/portal/auth/actions.ts",
  );
  const projectsQueries = await readSrcFile(
    "../../src/features/portal/projects/queries.ts",
  );

  assert.match(portalAuthLib, /if \(error\) \{\s*\n\s*throw new AuthorizationLookupError\(\);/);
  assert.match(
    portalLoginAction,
    /if \(membershipError \|\| !membershipRows \|\| membershipRows\.length === 0\) \{/,
  );
  assert.match(projectsQueries, /if \(error\) \{\s*\n\s*throw new Error\("Unable to load your projects\."\);/);
});
