import { writeFile } from "node:fs/promises";
import path from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getPhase8E2EConfig } from "../helpers/test-env.mjs";

// Idempotently ensures the fixed E2E fixtures exist in the configured test
// Supabase project: one organization with the internal admin as `admin`,
// one Client A (with the fixed owner/viewer as portal users) and its
// Project A, plus one Client B + Project B with no portal user of its own
// — used only as a "does this exist" target for the cross-client-access
// spec, never signed into directly.
//
// Running this repeatedly must never create duplicates: everything is
// looked up by a fixed, documented slug/email before being created.
export const E2E_ORG_SLUG = "phase8-e2e-org";
export const E2E_CLIENT_A_EMAIL = "phase8-e2e-client-a@example.com";
export const E2E_CLIENT_B_EMAIL = "phase8-e2e-client-b@example.com";
export const E2E_PROJECT_A_NAME = "Phase 8 E2E Project A";
export const E2E_PROJECT_B_NAME = "Phase 8 E2E Project B";
export const E2E_PROJECT_A_REVISION_TITLE = "E2E managed revision";
export const E2E_PROJECT_A_READY_REVISION_TITLE =
  "E2E ready-for-review revision";
export const E2E_PROJECT_A_CLIENT_FILE_NAME = "e2e-client-visible.txt";
export const E2E_PROJECT_A_INTERNAL_FILE_NAME = "e2e-internal-only.txt";
export const E2E_PROJECT_B_FILE_NAME = "e2e-client-b-visible.txt";

const FIXTURE_IDS_PATH = path.join(
  process.cwd(),
  "tests/phase8/e2e/.e2e-fixture-ids.json",
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
    // Reset the password (and re-confirm the email) on every run rather
    // than trusting whatever password the account already had. Without
    // this, a fixed test email that happens to already exist in the test
    // project — from an earlier manual sign-up, or from a previous
    // .env.test.local with a different TEST_*_PASSWORD — would silently
    // keep its old password forever, and every E2E sign-in would fail with
    // no clear indication why (the login form just redirects back to
    // itself; nothing here would surface the mismatch).
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
    .insert({ name: "Phase 8 E2E Organization", slug: E2E_ORG_SLUG })
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
    .insert({ organization_id: organizationId, business_name: businessName, contact_name: businessName, email })
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

async function ensureProject(
  admin: SupabaseClient,
  organizationId: string,
  clientId: string,
  name: string,
): Promise<string> {
  const { data: existing } = await admin
    .from("projects")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("client_id", clientId)
    .eq("name", name)
    .maybeSingle();
  if (existing) {
    return existing.id;
  }

  const { data, error } = await admin
    .from("projects")
    .insert({ organization_id: organizationId, client_id: clientId, name })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`Failed to create E2E project ${name}: ${error?.message}`);
  }
  return data.id;
}

async function ensureProjectFile(
  admin: SupabaseClient,
  organizationId: string,
  clientId: string,
  projectId: string,
  fileName: string,
  visibility: string,
): Promise<{ id: string; storage_path: string }> {
  const { data: existing } = await admin
    .from("project_files")
    .select("id, storage_path")
    .eq("project_id", projectId)
    .eq("file_name", fileName)
    .maybeSingle();
  if (existing) {
    return existing;
  }

  const storagePath = `organization/${organizationId}/client/${clientId}/project/${projectId}/${crypto.randomUUID()}-${fileName}`;
  const { error: uploadError } = await admin.storage
    .from("project-files-private")
    .upload(storagePath, new TextEncoder().encode(`E2E ${visibility} fixture`), {
      contentType: "text/plain",
      upsert: true,
    });
  if (uploadError) {
    throw new Error(`Failed to upload E2E fixture object: ${uploadError.message}`);
  }

  const { data, error } = await admin
    .from("project_files")
    .insert({
      organization_id: organizationId,
      client_id: clientId,
      project_id: projectId,
      file_name: fileName,
      storage_path: storagePath,
      mime_type: "text/plain",
      file_size: 27,
      visibility,
    })
    .select("id, storage_path")
    .single();
  if (error || !data) {
    throw new Error(
      `Failed to create E2E ${visibility} project_files row (${fileName}): ${error?.message}`,
    );
  }
  return data;
}

async function ensureProjectAReadyForReviewRevision(
  admin: SupabaseClient,
  organizationId: string,
  clientId: string,
  projectId: string,
  submittedByProfileId: string,
  assignedToProfileId: string,
): Promise<string> {
  const { data: existing } = await admin
    .from("revisions")
    .select("id")
    .eq("project_id", projectId)
    .eq("title", E2E_PROJECT_A_READY_REVISION_TITLE)
    .maybeSingle();
  if (existing) {
    // Reset to 'ready_for_review' so repeated E2E runs can approve it again
    // — this fixture is dedicated to the client-owner-flow spec and must
    // never depend on internal-admin-flow having run first.
    await admin
      .from("revisions")
      .update({
        status: "ready_for_review",
        assigned_to: assignedToProfileId,
        resolved_at: null,
      })
      .eq("id", existing.id);
    return existing.id;
  }

  const { data, error } = await admin
    .from("revisions")
    .insert({
      organization_id: organizationId,
      client_id: clientId,
      project_id: projectId,
      submitted_by: submittedByProfileId,
      assigned_to: assignedToProfileId,
      title: E2E_PROJECT_A_READY_REVISION_TITLE,
      description: "Fixed revision the client-owner E2E spec reviews and approves.",
      priority: "medium",
      status: "ready_for_review",
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`Failed to create E2E ready-for-review revision: ${error?.message}`);
  }
  return data.id;
}

async function ensureProjectARevision(
  admin: SupabaseClient,
  organizationId: string,
  clientId: string,
  projectId: string,
  submittedByProfileId: string,
): Promise<string> {
  const { data: existing } = await admin
    .from("revisions")
    .select("id")
    .eq("project_id", projectId)
    .eq("title", E2E_PROJECT_A_REVISION_TITLE)
    .maybeSingle();
  if (existing) {
    // Reset to 'submitted' so repeated E2E runs can walk it through the
    // workflow again from the start.
    await admin
      .from("revisions")
      .update({ status: "submitted", assigned_to: null, resolved_at: null })
      .eq("id", existing.id);
    return existing.id;
  }

  const { data, error } = await admin
    .from("revisions")
    .insert({
      organization_id: organizationId,
      client_id: clientId,
      project_id: projectId,
      submitted_by: submittedByProfileId,
      title: E2E_PROJECT_A_REVISION_TITLE,
      description: "Fixed revision the internal-admin E2E spec assigns and moves through its workflow.",
      priority: "medium",
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`Failed to create E2E Project A revision: ${error?.message}`);
  }
  return data.id;
}

export default async function globalSetup() {
  const config = getPhase8E2EConfig();
  if (!config) {
    // playwright.config.ts only wires this file in when hasPhase8E2EEnv()
    // is already true, but guard here too in case it is ever invoked
    // directly.
    console.warn(
      "Phase 8 E2E global setup skipped: required TEST_*/TEST_APP_URL env vars are not configured.",
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
  const clientViewerAuthUserId = await ensureAuthUser(
    admin,
    config.clientViewer.email,
    config.clientViewer.password,
  );

  const internalAdminProfileId = await ensureProfile(
    admin,
    internalAdminAuthUserId,
    "E2E Internal Admin",
  );
  const clientOwnerProfileId = await ensureProfile(
    admin,
    clientOwnerAuthUserId,
    "E2E Client Owner",
  );
  const clientViewerProfileId = await ensureProfile(
    admin,
    clientViewerAuthUserId,
    "E2E Client Viewer",
  );

  const organizationId = await ensureOrganization(admin);
  await ensureOrganizationMember(admin, organizationId, internalAdminProfileId, "admin");

  const clientAId = await ensureClient(
    admin,
    organizationId,
    "Phase 8 E2E Client A",
    E2E_CLIENT_A_EMAIL,
  );
  const clientBId = await ensureClient(
    admin,
    organizationId,
    "Phase 8 E2E Client B",
    E2E_CLIENT_B_EMAIL,
  );

  await ensureClientUser(admin, clientAId, clientOwnerProfileId, "owner");
  await ensureClientUser(admin, clientAId, clientViewerProfileId, "viewer");

  const projectAId = await ensureProject(admin, organizationId, clientAId, E2E_PROJECT_A_NAME);
  const projectBId = await ensureProject(admin, organizationId, clientBId, E2E_PROJECT_B_NAME);

  const clientVisibleFile = await ensureProjectFile(
    admin,
    organizationId,
    clientAId,
    projectAId,
    E2E_PROJECT_A_CLIENT_FILE_NAME,
    "client",
  );
  const internalOnlyFile = await ensureProjectFile(
    admin,
    organizationId,
    clientAId,
    projectAId,
    E2E_PROJECT_A_INTERNAL_FILE_NAME,
    "internal",
  );

  const projectARevisionId = await ensureProjectARevision(
    admin,
    organizationId,
    clientAId,
    projectAId,
    clientOwnerProfileId,
  );

  const projectAReadyForReviewRevisionId =
    await ensureProjectAReadyForReviewRevision(
      admin,
      organizationId,
      clientAId,
      projectAId,
      clientOwnerProfileId,
      internalAdminProfileId,
    );

  // A Project B fixture the cross-client spec can attempt (and must fail)
  // to reach while signed in as Client A. No auth user for Client B is
  // created — the cross-client spec never signs in as Client B.
  const projectBFile = await ensureProjectFile(
    admin,
    organizationId,
    clientBId,
    projectBId,
    E2E_PROJECT_B_FILE_NAME,
    "client",
  );

  const { data: projectBRevision } = await admin
    .from("revisions")
    .select("id")
    .eq("project_id", projectBId)
    .maybeSingle();
  let projectBRevisionId = projectBRevision?.id;
  if (!projectBRevisionId) {
    const { data, error } = await admin
      .from("revisions")
      .insert({
        organization_id: organizationId,
        client_id: clientBId,
        project_id: projectBId,
        title: "Client B revision (cross-client fixture)",
        description: "Used only to verify Client A cannot reach it.",
        priority: "low",
      })
      .select("id")
      .single();
    if (error || !data) {
      throw new Error(`Failed to create Client B fixture revision: ${error?.message}`);
    }
    projectBRevisionId = data.id;
  }

  await writeFile(
    FIXTURE_IDS_PATH,
    JSON.stringify(
      {
        organizationId,
        clientAId,
        clientBId,
        projectAId,
        projectBId,
        clientVisibleFileId: clientVisibleFile.id,
        internalOnlyFileId: internalOnlyFile.id,
        projectARevisionId,
        projectAReadyForReviewRevisionId,
        projectBFileId: projectBFile.id,
        projectBRevisionId,
      },
      null,
      2,
    ),
    "utf8",
  );
}
