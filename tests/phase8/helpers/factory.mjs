// Phase 8 test-data factory and cleanup, for integration tests only.
//
// Uses the service-role TEST admin client to set up fixtures directly
// (organizations, profiles, memberships, clients, projects, files,
// revisions) — this is test *setup*, not the behavior under test. Every
// actual Phase 8 assertion in tests/phase8/integration/ authenticates as one
// of the returned test users and exercises the real RLS/RPC/storage-policy
// path, never the admin client.
//
// Every value is suffixed with a per-call run id (see testRunId()) so
// concurrent/repeated test runs never collide, and cleanupPhase8Fixtures()
// removes exactly what createPhase8Fixtures() created — nothing else.

import { randomUUID } from "node:crypto";

import { testRunId } from "./test-env.mjs";

const PROJECT_FILES_BUCKET = "project-files-private";
const TEST_PASSWORD_PREFIX = "Phase8Test!";

function testPassword(runId) {
  return `${TEST_PASSWORD_PREFIX}${runId}Aa1`;
}

async function createAuthUserWithProfile(admin, { runId, label, fullName }) {
  const email = `phase8-${label}-${runId}@example.com`;
  const password = testPassword(runId);

  const { data: createdUser, error: createError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (createError || !createdUser?.user) {
    throw new Error(
      `Failed to create test auth user "${label}": ${createError?.message}`,
    );
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .insert({ auth_user_id: createdUser.user.id, full_name: fullName })
    .select("id, auth_user_id")
    .single();

  if (profileError || !profile) {
    throw new Error(
      `Failed to create profile for test user "${label}": ${profileError?.message}`,
    );
  }

  return {
    label,
    email,
    password,
    authUserId: createdUser.user.id,
    profileId: profile.id,
  };
}

/**
 * Builds the full Phase 8 fixture set described in the test plan:
 * two organizations, an internal admin/project manager/team member (all in
 * Organization A), two clients (one per organization) each with portal
 * users, one project per client, one client-visible and one internal file
 * on Project A, and one submitted revision on Project A.
 */
export async function createPhase8Fixtures(admin) {
  const runId = testRunId();

  const { data: orgA, error: orgAError } = await admin
    .from("organizations")
    .insert({ name: `Phase8 Org A ${runId}`, slug: `phase8-org-a-${runId}` })
    .select("id")
    .single();
  if (orgAError || !orgA) {
    throw new Error(`Failed to create Organization A: ${orgAError?.message}`);
  }

  const { data: orgB, error: orgBError } = await admin
    .from("organizations")
    .insert({ name: `Phase8 Org B ${runId}`, slug: `phase8-org-b-${runId}` })
    .select("id")
    .single();
  if (orgBError || !orgB) {
    throw new Error(`Failed to create Organization B: ${orgBError?.message}`);
  }

  const [internalAdmin, projectManager, teamMember, clientAOwner, clientAManager, clientAViewer, clientBOwner] =
    await Promise.all([
      createAuthUserWithProfile(admin, { runId, label: "internal-admin", fullName: "Internal Admin" }),
      createAuthUserWithProfile(admin, { runId, label: "project-manager", fullName: "Project Manager" }),
      createAuthUserWithProfile(admin, { runId, label: "team-member", fullName: "Team Member" }),
      createAuthUserWithProfile(admin, { runId, label: "client-a-owner", fullName: "Client A Owner" }),
      createAuthUserWithProfile(admin, { runId, label: "client-a-manager", fullName: "Client A Manager" }),
      createAuthUserWithProfile(admin, { runId, label: "client-a-viewer", fullName: "Client A Viewer" }),
      createAuthUserWithProfile(admin, { runId, label: "client-b-owner", fullName: "Client B Owner" }),
    ]);

  const { error: membersError } = await admin.from("organization_members").insert([
    { organization_id: orgA.id, user_id: internalAdmin.profileId, role: "admin", status: "active" },
    { organization_id: orgA.id, user_id: projectManager.profileId, role: "project_manager", status: "active" },
    { organization_id: orgA.id, user_id: teamMember.profileId, role: "team_member", status: "active" },
  ]);
  if (membersError) {
    throw new Error(`Failed to create organization_members: ${membersError.message}`);
  }

  const { data: clientA, error: clientAError } = await admin
    .from("clients")
    .insert({
      organization_id: orgA.id,
      business_name: `Phase8 Client A ${runId}`,
      contact_name: "Client A Contact",
      email: `phase8-client-a-${runId}@example.com`,
    })
    .select("id, organization_id")
    .single();
  if (clientAError || !clientA) {
    throw new Error(`Failed to create Client A: ${clientAError?.message}`);
  }

  const { data: clientB, error: clientBError } = await admin
    .from("clients")
    .insert({
      organization_id: orgB.id,
      business_name: `Phase8 Client B ${runId}`,
      contact_name: "Client B Contact",
      email: `phase8-client-b-${runId}@example.com`,
    })
    .select("id, organization_id")
    .single();
  if (clientBError || !clientB) {
    throw new Error(`Failed to create Client B: ${clientBError?.message}`);
  }

  const { error: clientUsersError } = await admin.from("client_users").insert([
    { client_id: clientA.id, user_id: clientAOwner.profileId, role: "owner", status: "active" },
    { client_id: clientA.id, user_id: clientAManager.profileId, role: "manager", status: "active" },
    { client_id: clientA.id, user_id: clientAViewer.profileId, role: "viewer", status: "active" },
    { client_id: clientB.id, user_id: clientBOwner.profileId, role: "owner", status: "active" },
  ]);
  if (clientUsersError) {
    throw new Error(`Failed to create client_users: ${clientUsersError.message}`);
  }

  const { data: projectA, error: projectAError } = await admin
    .from("projects")
    .insert({
      organization_id: orgA.id,
      client_id: clientA.id,
      name: `Phase8 Project A ${runId}`,
      project_manager_id: projectManager.profileId,
    })
    .select("id, organization_id, client_id")
    .single();
  if (projectAError || !projectA) {
    throw new Error(`Failed to create Project A: ${projectAError?.message}`);
  }

  const { data: projectB, error: projectBError } = await admin
    .from("projects")
    .insert({
      organization_id: orgB.id,
      client_id: clientB.id,
      name: `Phase8 Project B ${runId}`,
    })
    .select("id, organization_id, client_id")
    .single();
  if (projectBError || !projectB) {
    throw new Error(`Failed to create Project B: ${projectBError?.message}`);
  }

  // Add project_members so the team member/project manager "accessible
  // project" rule (private.can_manage_project) is satisfied for Project A.
  const { error: projectMembersError } = await admin.from("project_members").insert([
    { project_id: projectA.id, user_id: projectManager.profileId, role: "project_manager" },
    { project_id: projectA.id, user_id: teamMember.profileId, role: "member" },
  ]);
  if (projectMembersError) {
    throw new Error(`Failed to create project_members: ${projectMembersError.message}`);
  }

  // project_files_storage_path_format requires the segment right before the
  // file name to be a real 36-character UUID, matching
  // buildProjectFileStoragePath()'s real output — testRunId() (a short
  // base36 timestamp+random suffix) does not satisfy that shape.
  const clientVisiblePath = `organization/${orgA.id}/client/${clientA.id}/project/${projectA.id}/${randomUUID()}-client-visible.txt`;
  const internalPath = `organization/${orgA.id}/client/${clientA.id}/project/${projectA.id}/${randomUUID()}-internal-only.txt`;

  const [clientVisibleUpload, internalUpload] = await Promise.all([
    admin.storage
      .from(PROJECT_FILES_BUCKET)
      .upload(clientVisiblePath, new TextEncoder().encode("client-visible fixture"), {
        contentType: "text/plain",
        upsert: true,
      }),
    admin.storage
      .from(PROJECT_FILES_BUCKET)
      .upload(internalPath, new TextEncoder().encode("internal fixture"), {
        contentType: "text/plain",
        upsert: true,
      }),
  ]);
  if (clientVisibleUpload.error) {
    throw new Error(
      `Failed to upload client-visible fixture object: ${clientVisibleUpload.error.message}`,
    );
  }
  if (internalUpload.error) {
    throw new Error(
      `Failed to upload internal fixture object: ${internalUpload.error.message}`,
    );
  }

  const { data: clientVisibleFile, error: clientVisibleFileError } = await admin
    .from("project_files")
    .insert({
      organization_id: orgA.id,
      client_id: clientA.id,
      project_id: projectA.id,
      uploaded_by: internalAdmin.profileId,
      file_name: "client-visible.txt",
      storage_path: clientVisiblePath,
      mime_type: "text/plain",
      file_size: 23,
      visibility: "client",
    })
    .select("id")
    .single();
  if (clientVisibleFileError || !clientVisibleFile) {
    throw new Error(
      `Failed to create client-visible project_files row: ${clientVisibleFileError?.message}`,
    );
  }

  const { data: internalFile, error: internalFileError } = await admin
    .from("project_files")
    .insert({
      organization_id: orgA.id,
      client_id: clientA.id,
      project_id: projectA.id,
      uploaded_by: internalAdmin.profileId,
      file_name: "internal-only.txt",
      storage_path: internalPath,
      mime_type: "text/plain",
      file_size: 17,
      visibility: "internal",
    })
    .select("id")
    .single();
  if (internalFileError || !internalFile) {
    throw new Error(
      `Failed to create internal project_files row: ${internalFileError?.message}`,
    );
  }

  const { data: revision, error: revisionError } = await admin
    .from("revisions")
    .insert({
      organization_id: orgA.id,
      client_id: clientA.id,
      project_id: projectA.id,
      submitted_by: clientAOwner.profileId,
      title: `Fixture revision ${runId}`,
      description: "Fixture revision description.",
      priority: "medium",
    })
    .select("id")
    .single();
  if (revisionError || !revision) {
    throw new Error(`Failed to create fixture revision: ${revisionError?.message}`);
  }

  return {
    runId,
    orgA,
    orgB,
    internalAdmin,
    projectManager,
    teamMember,
    clientAOwner,
    clientAManager,
    clientAViewer,
    clientBOwner,
    clientA,
    clientB,
    projectA,
    projectB,
    clientVisibleFile: { id: clientVisibleFile.id, storagePath: clientVisiblePath },
    internalFile: { id: internalFile.id, storagePath: internalPath },
    revision,
  };
}

/**
 * Suspends Client A's viewer membership in place, for the "suspended client
 * membership is denied" scenarios. Returns a restore function.
 */
export async function suspendClientAViewer(admin, fixtures) {
  const { error } = await admin
    .from("client_users")
    .update({ status: "suspended" })
    .eq("client_id", fixtures.clientA.id)
    .eq("user_id", fixtures.clientAViewer.profileId);
  if (error) {
    throw new Error(`Failed to suspend Client A viewer: ${error.message}`);
  }
}

/**
 * Removes exactly the rows/objects createPhase8Fixtures() created. Deletion
 * is explicit and ordered (rather than relying solely on ON DELETE CASCADE)
 * so a partial failure never cascades into deleting unrelated data, and so
 * cleanup is auditable. Safe to call even if some fixtures failed to be
 * created (each step is best-effort and logs rather than throwing).
 */
export async function cleanupPhase8Fixtures(admin, fixtures) {
  const errors = [];

  async function attempt(label, fn) {
    try {
      await fn();
    } catch (error) {
      errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  await attempt("remove storage objects", () =>
    admin.storage
      .from(PROJECT_FILES_BUCKET)
      .remove([fixtures.clientVisibleFile.storagePath, fixtures.internalFile.storagePath]),
  );

  await attempt("delete revision", () =>
    admin.from("revisions").delete().eq("id", fixtures.revision.id),
  );

  await attempt("delete project_files", () =>
    admin
      .from("project_files")
      .delete()
      .in("id", [fixtures.clientVisibleFile.id, fixtures.internalFile.id]),
  );

  await attempt("delete project_members", () =>
    admin.from("project_members").delete().eq("project_id", fixtures.projectA.id),
  );

  await attempt("delete projects", () =>
    admin.from("projects").delete().in("id", [fixtures.projectA.id, fixtures.projectB.id]),
  );

  await attempt("delete client_users", () =>
    admin
      .from("client_users")
      .delete()
      .in("client_id", [fixtures.clientA.id, fixtures.clientB.id]),
  );

  await attempt("delete clients", () =>
    admin.from("clients").delete().in("id", [fixtures.clientA.id, fixtures.clientB.id]),
  );

  await attempt("delete organization_members", () =>
    admin
      .from("organization_members")
      .delete()
      .in("organization_id", [fixtures.orgA.id, fixtures.orgB.id]),
  );

  const allUsers = [
    fixtures.internalAdmin,
    fixtures.projectManager,
    fixtures.teamMember,
    fixtures.clientAOwner,
    fixtures.clientAManager,
    fixtures.clientAViewer,
    fixtures.clientBOwner,
  ];

  await attempt("delete profiles", () =>
    admin
      .from("profiles")
      .delete()
      .in("id", allUsers.map((user) => user.profileId)),
  );

  await attempt("delete auth users", async () => {
    for (const user of allUsers) {
      const { error } = await admin.auth.admin.deleteUser(user.authUserId);
      if (error) {
        throw new Error(`${user.label}: ${error.message}`);
      }
    }
  });

  await attempt("delete organizations", () =>
    admin.from("organizations").delete().in("id", [fixtures.orgA.id, fixtures.orgB.id]),
  );

  if (errors.length > 0) {
    // Cleanup failures should never fail the test itself (the assertions
    // already ran) — but they must be visible, not swallowed.
    console.error("Phase 8 fixture cleanup had non-fatal errors:", errors);
  }
}
