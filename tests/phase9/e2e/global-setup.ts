import { writeFile } from "node:fs/promises";
import path from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getPhase9E2EConfig } from "../helpers/test-env.mjs";

// Idempotently ensures the fixed E2E fixtures exist in the configured test
// Supabase project: one organization with the internal admin as `admin`,
// and one client with the fixed owner as a portal user. Invoices themselves
// are deliberately NOT pre-seeded here — creating, sending, and paying an
// invoice is the behavior under test, so each spec creates its own fresh
// draft rather than depending on a shared, mutated fixture.
//
// Running this repeatedly must never create duplicates: everything is
// looked up by a fixed, documented slug/email before being created.
export const E2E_ORG_SLUG = "phase9-e2e-org";
export const E2E_CLIENT_EMAIL = "phase9-e2e-client@example.com";
export const E2E_CLIENT_NAME = "Phase 9 E2E Client";

const FIXTURE_IDS_PATH = path.join(
  process.cwd(),
  "tests/phase9/e2e/.e2e-fixture-ids.json",
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
    // Reset the password (and re-confirm the email) on every run so a
    // stale password from an earlier .env.test.local never causes a
    // silent, hard-to-diagnose sign-in failure — mirrors Phase 8's
    // global-setup.ts exactly.
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
    .insert({ name: "Phase 9 E2E Organization", slug: E2E_ORG_SLUG })
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
): Promise<string> {
  const { data: existing } = await admin
    .from("clients")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("email", E2E_CLIENT_EMAIL)
    .maybeSingle();
  if (existing) {
    return existing.id;
  }

  const { data, error } = await admin
    .from("clients")
    .insert({
      organization_id: organizationId,
      business_name: E2E_CLIENT_NAME,
      contact_name: E2E_CLIENT_NAME,
      email: E2E_CLIENT_EMAIL,
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`Failed to create E2E client: ${error?.message}`);
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
    await admin
      .from("client_users")
      .update({ role, status: "active" })
      .eq("id", existing.id);
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
  const config = getPhase9E2EConfig();
  if (!config) {
    console.warn(
      "Phase 9 E2E global setup skipped: required TEST_*/TEST_APP_URL env vars are not configured.",
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
  const clientOwnerAuthUserId = await ensureAuthUser(
    admin,
    config.clientOwner.email,
    config.clientOwner.password,
  );

  const internalAdminProfileId = await ensureProfile(
    admin,
    internalAdminAuthUserId,
    "Phase 9 E2E Internal Admin",
  );
  const clientOwnerProfileId = await ensureProfile(
    admin,
    clientOwnerAuthUserId,
    "Phase 9 E2E Client Owner",
  );

  const organizationId = await ensureOrganization(admin);
  await ensureOrganizationMember(admin, organizationId, internalAdminProfileId, "admin");

  const clientId = await ensureClient(admin, organizationId);
  await ensureClientUser(admin, clientId, clientOwnerProfileId, "owner");

  await writeFile(
    FIXTURE_IDS_PATH,
    JSON.stringify({ organizationId, clientId }, null, 2),
    "utf8",
  );
}
