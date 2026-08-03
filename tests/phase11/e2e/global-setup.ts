import { writeFile } from "node:fs/promises";
import path from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getPhase11E2EConfig } from "../helpers/test-env.mjs";

// Idempotently ensures the fixed Phase 11 E2E fixtures exist: one dedicated
// organization (never Phase 8/9/10's — see helpers/test-env.mjs) with the
// internal admin as super_admin (needed for the audit log + "Run reminders
// now"), a team_member (needed for the audit-log permission-denied
// assertion), and one client with the client owner as a portal user (needed
// for the portal-no-notifications assertion). Running this repeatedly must
// never create duplicates.

export const E2E_ORG_SLUG = "phase11-e2e-org";
export const E2E_CLIENT_EMAIL = "phase11-e2e-client@example.com";

const FIXTURE_IDS_PATH = path.join(
  process.cwd(),
  "tests/phase11/e2e/.e2e-fixture-ids.json",
);

async function ensureAuthUser(
  admin: SupabaseClient,
  email: string,
  password: string,
): Promise<string> {
  const { data: existingPage } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  const existing = existingPage?.users?.find((user) => user.email === email);
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    });
    if (error) {
      throw new Error(
        `Failed to reset password for existing E2E auth user ${email}: ${error.message}`,
      );
    }
    return existing.id;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data?.user) {
    throw new Error(`Failed to create E2E auth user ${email}: ${error?.message}`);
  }
  return data.user.id;
}

async function ensureProfile(
  admin: SupabaseClient,
  authUserId: string,
  fullName: string,
): Promise<string> {
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (existing) {
    return existing.id;
  }

  const { data, error } = await admin
    .from("profiles")
    .insert({ auth_user_id: authUserId, full_name: fullName })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`Failed to create profile for ${authUserId}: ${error?.message}`);
  }
  return data.id;
}

async function ensureOrganization(admin: SupabaseClient): Promise<string> {
  const { data: existing } = await admin
    .from("organizations")
    .select("id")
    .eq("slug", E2E_ORG_SLUG)
    .maybeSingle();
  if (existing) {
    return existing.id;
  }

  const { data, error } = await admin
    .from("organizations")
    .insert({ name: "Phase 11 E2E Organization", slug: E2E_ORG_SLUG })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`Failed to create E2E organization: ${error?.message}`);
  }
  return data.id;
}

async function ensureOrganizationMember(
  admin: SupabaseClient,
  organizationId: string,
  profileId: string,
  role: string,
): Promise<void> {
  const { data: existing } = await admin
    .from("organization_members")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", profileId)
    .maybeSingle();
  if (existing) {
    await admin
      .from("organization_members")
      .update({ role, status: "active" })
      .eq("id", existing.id);
    return;
  }

  const { error } = await admin
    .from("organization_members")
    .insert({ organization_id: organizationId, user_id: profileId, role, status: "active" });
  if (error) {
    throw new Error(`Failed to create organization_members row: ${error.message}`);
  }
}

async function ensureClient(
  admin: SupabaseClient,
  organizationId: string,
  businessName: string,
  email: string,
): Promise<string> {
  const { data: existing } = await admin
    .from("clients")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("email", email)
    .maybeSingle();
  if (existing) {
    return existing.id;
  }

  const { data, error } = await admin
    .from("clients")
    .insert({
      organization_id: organizationId,
      business_name: businessName,
      contact_name: businessName,
      email,
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`Failed to create E2E client ${businessName}: ${error?.message}`);
  }
  return data.id;
}

async function ensureClientUser(
  admin: SupabaseClient,
  clientId: string,
  profileId: string,
  role: string,
): Promise<void> {
  const { data: existing } = await admin
    .from("client_users")
    .select("id")
    .eq("client_id", clientId)
    .eq("user_id", profileId)
    .maybeSingle();
  if (existing) {
    await admin.from("client_users").update({ role, status: "active" }).eq("id", existing.id);
    return;
  }

  const { error } = await admin
    .from("client_users")
    .insert({ client_id: clientId, user_id: profileId, role, status: "active" });
  if (error) {
    throw new Error(`Failed to create client_users row: ${error.message}`);
  }
}

export default async function globalSetup() {
  const config = getPhase11E2EConfig();
  if (!config) {
    console.warn(
      "Phase 11 E2E global setup skipped: required TEST_*/TEST_P11_* env vars are not configured.",
    );
    return;
  }

  const admin = createClient(config.url, config.secretKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });

  const internalAdminAuthUserId = await ensureAuthUser(
    admin,
    config.internalAdmin.email,
    config.internalAdmin.password,
  );
  const teamMemberAuthUserId = await ensureAuthUser(
    admin,
    config.teamMember.email,
    config.teamMember.password,
  );
  const clientOwnerAuthUserId = await ensureAuthUser(
    admin,
    config.clientOwner.email,
    config.clientOwner.password,
  );

  const internalAdminProfileId = await ensureProfile(
    admin,
    internalAdminAuthUserId,
    "Phase 11 E2E Super Admin",
  );
  const teamMemberProfileId = await ensureProfile(
    admin,
    teamMemberAuthUserId,
    "Phase 11 E2E Team Member",
  );
  const clientOwnerProfileId = await ensureProfile(
    admin,
    clientOwnerAuthUserId,
    "Phase 11 E2E Client Owner",
  );

  const organizationId = await ensureOrganization(admin);
  await ensureOrganizationMember(admin, organizationId, internalAdminProfileId, "super_admin");
  await ensureOrganizationMember(admin, organizationId, teamMemberProfileId, "team_member");

  const clientId = await ensureClient(
    admin,
    organizationId,
    "Phase 11 E2E Client",
    E2E_CLIENT_EMAIL,
  );
  await ensureClientUser(admin, clientId, clientOwnerProfileId, "owner");

  await writeFile(
    FIXTURE_IDS_PATH,
    JSON.stringify({ organizationId, clientId }, null, 2),
    "utf8",
  );
}
