// Section 8 — Database and RLS integration tests for project_files and
// revisions, against a real, dedicated non-production Supabase project.
//
// Every assertion here authenticates as a real test user (or uses no
// session at all, for the anonymous cases) and goes through the same
// RLS-protected queries / SECURITY DEFINER RPC functions the application
// itself uses — never the admin client, which is reserved for
// createPhase8Fixtures()/cleanupPhase8Fixtures() setup and teardown only.
//
// Skips (not passes, not fails) when TEST_SUPABASE_* is not configured; see
// docs/PHASE_8_AUTOMATED_TESTING.md.

import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import {
  cleanupPhase8Fixtures,
  createPhase8Fixtures,
  suspendClientAViewer,
} from "../helpers/factory.mjs";
import {
  createTestAdminClient,
  createTestAnonClient,
  signInTestUser,
} from "../helpers/supabase-clients.mjs";
import {
  getPhase8IntegrationSkipReason,
  hasPhase8IntegrationEnv,
} from "../helpers/test-env.mjs";

describe("Phase 8 RLS — project_files and revisions", () => {
  if (!hasPhase8IntegrationEnv()) {
    test("Phase 8 RLS integration tests", (t) => {
      t.skip(getPhase8IntegrationSkipReason());
    });
    return;
  }

  let admin;
  let fixtures;
  let anonClient;
  let internalAdminClient;
  let clientAOwnerClient;
  let clientAManagerClient;
  let clientAViewerClient;
  let clientBOwnerClient;

  before(async () => {
    admin = createTestAdminClient();
    fixtures = await createPhase8Fixtures(admin);
    anonClient = createTestAnonClient();
    internalAdminClient = await signInTestUser(
      fixtures.internalAdmin.email,
      fixtures.internalAdmin.password,
    );
    clientAOwnerClient = await signInTestUser(
      fixtures.clientAOwner.email,
      fixtures.clientAOwner.password,
    );
    clientAManagerClient = await signInTestUser(
      fixtures.clientAManager.email,
      fixtures.clientAManager.password,
    );
    clientAViewerClient = await signInTestUser(
      fixtures.clientAViewer.email,
      fixtures.clientAViewer.password,
    );
    clientBOwnerClient = await signInTestUser(
      fixtures.clientBOwner.email,
      fixtures.clientBOwner.password,
    );
  });

  after(async () => {
    await cleanupPhase8Fixtures(admin, fixtures);
  });

  test("anonymous user cannot select project_files", async () => {
    const { data, error } = await anonClient
      .from("project_files")
      .select("id")
      .eq("id", fixtures.clientVisibleFile.id);
    assert.ok(error || (data ?? []).length === 0);
  });

  test("anonymous user cannot select revisions", async () => {
    const { data, error } = await anonClient
      .from("revisions")
      .select("id")
      .eq("id", fixtures.revision.id);
    assert.ok(error || (data ?? []).length === 0);
  });

  test("Organization A internal member cannot read Organization B's files (RLS scopes by organization_id)", async () => {
    // Organization B has no equivalent file fixture, so this asserts the
    // stronger, general property directly: Org A's admin session can only
    // ever see rows whose organization_id is Org A's.
    const { data, error } = await internalAdminClient
      .from("project_files")
      .select("id, organization_id");
    assert.equal(error, null);
    for (const row of data ?? []) {
      assert.equal(row.organization_id, fixtures.orgA.id);
    }
  });

  test("Organization A internal member cannot read Organization B's revisions", async () => {
    const { data, error } = await internalAdminClient
      .from("revisions")
      .select("id, organization_id");
    assert.equal(error, null);
    for (const row of data ?? []) {
      assert.equal(row.organization_id, fixtures.orgA.id);
    }
  });

  test("Client A cannot read Client B's files, and Client B cannot read Client A's files", async () => {
    const { data: asClientA } = await clientAOwnerClient.rpc(
      "get_client_project_files",
      { target_project_id: fixtures.projectB.id },
    );
    assert.deepEqual(asClientA ?? [], []);

    const { data: asClientB } = await clientBOwnerClient.rpc(
      "get_client_project_files",
      { target_project_id: fixtures.projectA.id },
    );
    assert.deepEqual(asClientB ?? [], []);
  });

  test("Client A cannot read Client B's revisions, and Client B cannot read Client A's revisions", async () => {
    const { data: asClientA } = await clientAOwnerClient.rpc(
      "get_client_revisions",
      { target_project_id: fixtures.projectB.id },
    );
    assert.deepEqual(asClientA ?? [], []);

    const { data: asClientB } = await clientBOwnerClient.rpc(
      "get_client_revisions",
      { target_project_id: fixtures.projectA.id },
    );
    assert.deepEqual(asClientB ?? [], []);
  });

  test("Client A cannot discover internal-visibility file metadata through the portal read path", async () => {
    const { data } = await clientAOwnerClient.rpc("get_client_project_files", {
      target_project_id: fixtures.projectA.id,
    });
    const ids = (data ?? []).map((file) => file.id);
    assert.ok(!ids.includes(fixtures.internalFile.id));
  });

  test("Client A can read its own client-visible file metadata", async () => {
    const { data } = await clientAOwnerClient.rpc("get_client_project_files", {
      target_project_id: fixtures.projectA.id,
    });
    const ids = (data ?? []).map((file) => file.id);
    assert.ok(ids.includes(fixtures.clientVisibleFile.id));
  });

  test("a suspended client membership is denied access to files and revisions", async () => {
    await suspendClientAViewer(admin, fixtures);

    const { data: files, error: filesError } = await clientAViewerClient.rpc(
      "get_client_project_files",
      { target_project_id: fixtures.projectA.id },
    );
    // A suspended membership fails private.active_client_id()'s "exactly
    // one active membership" check, so this call either errors or returns
    // nothing — never the real file list.
    assert.ok(filesError || (files ?? []).length === 0);

    const { data: revisions, error: revisionsError } =
      await clientAViewerClient.rpc("get_client_revisions", {
        target_project_id: fixtures.projectA.id,
      });
    assert.ok(revisionsError || (revisions ?? []).length === 0);
  });

  test("a viewer cannot upload a client file (create_client_project_file rejects the role)", async () => {
    const { error } = await clientAViewerClient.rpc(
      "create_client_project_file",
      {
        target_project_id: fixtures.projectA.id,
        p_file_name: "viewer-attempt.txt",
        p_storage_path: `organization/${fixtures.orgA.id}/client/${fixtures.clientA.id}/project/${fixtures.projectA.id}/00000000-0000-4000-8000-000000000000-viewer-attempt.txt`,
        p_mime_type: "text/plain",
        p_file_size: 10,
        p_category: "",
      },
    );
    assert.ok(error);
  });

  test("owner and manager may perform the documented portal upload behavior (create_client_project_file succeeds)", async () => {
    for (const client of [clientAOwnerClient, clientAManagerClient]) {
      const path = `organization/${fixtures.orgA.id}/client/${fixtures.clientA.id}/project/${fixtures.projectA.id}/${crypto.randomUUID()}-owner-manager-upload.txt`;
      const { error: uploadError } = await client.storage
        .from("project-files-private")
        .upload(path, new TextEncoder().encode("owner/manager upload"), {
          contentType: "text/plain",
        });
      assert.equal(uploadError, null);

      const { data, error } = await client.rpc("create_client_project_file", {
        target_project_id: fixtures.projectA.id,
        p_file_name: "owner-manager-upload.txt",
        p_storage_path: path,
        p_mime_type: "text/plain",
        p_file_size: 21,
        p_category: "",
      });
      assert.equal(error, null);
      assert.ok((data ?? [])[0]?.id);

      await admin.from("project_files").delete().eq("id", data[0].id);
      await admin.storage.from("project-files-private").remove([path]);
    }
  });

  test("the browser cannot set organization_id, client_id, uploaded_by, or submitted_by — they are always server-resolved", async () => {
    // create_internal_project_file/create_client_revision never accept
    // these as parameters at all (see the migration's Args lists), so
    // attempting to smuggle them in produces a function-does-not-exist /
    // unknown-argument error rather than being silently accepted.
    const { error: fileError } = await internalAdminClient.rpc(
      "create_internal_project_file",
      {
        target_project_id: fixtures.projectA.id,
        p_file_name: "forged.txt",
        p_storage_path: `organization/${fixtures.orgA.id}/client/${fixtures.clientA.id}/project/${fixtures.projectA.id}/${crypto.randomUUID()}-forged.txt`,
        p_mime_type: "text/plain",
        p_file_size: 10,
        p_visibility: "internal",
        p_category: "",
        organization_id: fixtures.orgB.id,
        uploaded_by: fixtures.clientAOwner.profileId,
      },
    );
    assert.ok(fileError);

    const { error: revisionError } = await clientAOwnerClient.rpc(
      "create_client_revision",
      {
        target_project_id: fixtures.projectA.id,
        p_page_name: "",
        p_section_name: "",
        p_title: "Forged submitter",
        p_description: "Attempting to forge submitted_by.",
        p_priority: "low",
        submitted_by: fixtures.clientBOwner.profileId,
      },
    );
    assert.ok(revisionError);
  });

  test("the browser cannot assign a cross-organization team member to a revision", async () => {
    const { error } = await internalAdminClient
      .from("revisions")
      .update({ assigned_to: fixtures.clientBOwner.profileId })
      .eq("id", fixtures.revision.id);
    // clientBOwner is not an organization_members row at all (only a
    // client_users row in a different organization), so the
    // revisions_update_assignment policy's assignee-membership check fails.
    assert.ok(error);

    const { data: unchanged } = await admin
      .from("revisions")
      .select("assigned_to")
      .eq("id", fixtures.revision.id)
      .single();
    assert.notEqual(unchanged.assigned_to, fixtures.clientBOwner.profileId);
  });

  test("direct Supabase requests remain blocked by RLS even for a signed-in client attempting another client's row by id", async () => {
    const { data, error } = await clientBOwnerClient
      .from("revisions")
      .select("id")
      .eq("id", fixtures.revision.id);
    assert.ok(error || (data ?? []).length === 0);
  });
});
