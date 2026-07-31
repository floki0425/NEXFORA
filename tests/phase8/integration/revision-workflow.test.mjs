// Section 10 — Revision workflow integration tests, exercising the real
// create_client_revision / transition_revision_status / approve_revision /
// request_revision_changes RPC functions through authenticated test-user
// sessions.
//
// Skips (not passes, not fails) when TEST_SUPABASE_* is not configured; see
// docs/PHASE_8_AUTOMATED_TESTING.md.

import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { cleanupPhase8Fixtures, createPhase8Fixtures } from "../helpers/factory.mjs";
import {
  createTestAdminClient,
  signInTestUser,
} from "../helpers/supabase-clients.mjs";
import {
  getPhase8IntegrationSkipReason,
  hasPhase8IntegrationEnv,
} from "../helpers/test-env.mjs";

describe("Phase 8 revision workflow integration", () => {
  if (!hasPhase8IntegrationEnv()) {
    test("Phase 8 revision workflow integration tests", (t) => {
      t.skip(getPhase8IntegrationSkipReason());
    });
    return;
  }

  let admin;
  let fixtures;
  let internalAdminClient;
  let clientAOwnerClient;
  let clientAManagerClient;
  let clientAViewerClient;
  let clientBOwnerClient;
  const createdRevisionIds = [];

  before(async () => {
    admin = createTestAdminClient();
    fixtures = await createPhase8Fixtures(admin);
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
    if (createdRevisionIds.length > 0) {
      await admin.from("revisions").delete().in("id", createdRevisionIds);
    }
    await cleanupPhase8Fixtures(admin, fixtures);
  });

  function baseRevisionInput(overrides = {}) {
    return {
      target_project_id: fixtures.projectA.id,
      p_page_name: "",
      p_section_name: "",
      p_title: "Integration test revision",
      p_description: "Created by the Phase 8 integration test suite.",
      p_priority: "medium",
      ...overrides,
    };
  }

  async function submitAndTrack(client, overrides) {
    const { data, error } = await client.rpc(
      "create_client_revision",
      baseRevisionInput(overrides),
    );
    if (data?.[0]?.id) {
      createdRevisionIds.push(data[0].id);
    }
    return { data, error };
  }

  test("client owner submits a revision for their own project, and it begins as 'submitted'", async () => {
    const { data, error } = await submitAndTrack(clientAOwnerClient);
    assert.equal(error, null);
    const revisionId = data[0].id;

    const { data: row } = await admin
      .from("revisions")
      .select("status")
      .eq("id", revisionId)
      .single();
    assert.equal(row.status, "submitted");
  });

  test("client manager submits a revision for their own project", async () => {
    const { error } = await submitAndTrack(clientAManagerClient);
    assert.equal(error, null);
  });

  test("client viewer submission fails", async () => {
    const { error } = await submitAndTrack(clientAViewerClient);
    assert.ok(error);
  });

  test("a client cannot submit against another client's project", async () => {
    const { error } = await clientAOwnerClient.rpc("create_client_revision", {
      ...baseRevisionInput(),
      target_project_id: fixtures.projectB.id,
    });
    assert.ok(error);
  });

  test("a revision without an attachment succeeds (the argument is simply omitted)", async () => {
    const { error } = await clientAOwnerClient.rpc(
      "create_client_revision",
      baseRevisionInput(),
    );
    assert.equal(error, null);
  });

  test("a revision with a valid client-visible attachment succeeds", async () => {
    const { data, error } = await submitAndTrack(clientAOwnerClient, {
      p_attachment_file_id: fixtures.clientVisibleFile.id,
    });
    assert.equal(error, null);

    const { data: row } = await admin
      .from("revisions")
      .select("attachment_file_id")
      .eq("id", data[0].id)
      .single();
    assert.equal(row.attachment_file_id, fixtures.clientVisibleFile.id);
  });

  test("a revision referencing another project's attachment fails", async () => {
    // Create a throwaway client-visible file under Project B, then try to
    // attach it to a Project A submission from Client A.
    const path = `organization/${fixtures.orgB.id}/client/${fixtures.clientB.id}/project/${fixtures.projectB.id}/${crypto.randomUUID()}-other-project.txt`;
    await admin.storage
      .from("project-files-private")
      .upload(path, new TextEncoder().encode("other project"), {
        contentType: "text/plain",
      });
    const { data: otherFile } = await admin
      .from("project_files")
      .insert({
        organization_id: fixtures.orgB.id,
        client_id: fixtures.clientB.id,
        project_id: fixtures.projectB.id,
        file_name: "other-project.txt",
        storage_path: path,
        mime_type: "text/plain",
        file_size: 13,
        visibility: "client",
      })
      .select("id")
      .single();

    const { error } = await clientAOwnerClient.rpc("create_client_revision", {
      ...baseRevisionInput(),
      p_attachment_file_id: otherFile.id,
    });
    assert.ok(error);

    await admin.from("project_files").delete().eq("id", otherFile.id);
    await admin.storage.from("project-files-private").remove([path]);
  });

  test("a revision cannot reference an internal-visibility attachment from a portal submission", async () => {
    const { error } = await clientAOwnerClient.rpc("create_client_revision", {
      ...baseRevisionInput(),
      p_attachment_file_id: fixtures.internalFile.id,
    });
    assert.ok(error);
  });

  test("same-organization internal assignment succeeds", async () => {
    const { data } = await submitAndTrack(clientAOwnerClient);
    const revisionId = data[0].id;

    const { error } = await internalAdminClient
      .from("revisions")
      .update({ assigned_to: fixtures.teamMember.profileId })
      .eq("id", revisionId);
    assert.equal(error, null);

    const { data: row } = await admin
      .from("revisions")
      .select("assigned_to")
      .eq("id", revisionId)
      .single();
    assert.equal(row.assigned_to, fixtures.teamMember.profileId);
  });

  test("cross-organization assignment fails", async () => {
    const { data } = await submitAndTrack(clientAOwnerClient);
    const revisionId = data[0].id;

    const { error } = await internalAdminClient
      .from("revisions")
      .update({ assigned_to: fixtures.clientBOwner.profileId })
      .eq("id", revisionId);
    assert.ok(error);
  });

  test("an invalid status transition fails", async () => {
    const { data } = await submitAndTrack(clientAOwnerClient);
    const revisionId = data[0].id;

    const { error } = await internalAdminClient.rpc(
      "transition_revision_status",
      { target_revision_id: revisionId, p_new_status: "closed" },
    );
    assert.ok(error);

    const { data: row } = await admin
      .from("revisions")
      .select("status")
      .eq("id", revisionId)
      .single();
    assert.equal(row.status, "submitted");
  });

  test("the ready-for-review transition succeeds through the documented sequence", async () => {
    const { data } = await submitAndTrack(clientAOwnerClient);
    const revisionId = data[0].id;

    for (const nextStatus of ["reviewing", "in_progress", "ready_for_review"]) {
      const { error } = await internalAdminClient.rpc(
        "transition_revision_status",
        { target_revision_id: revisionId, p_new_status: nextStatus },
      );
      assert.equal(error, null, `expected transition to ${nextStatus} to succeed`);
    }

    const { data: row } = await admin
      .from("revisions")
      .select("status")
      .eq("id", revisionId)
      .single();
    assert.equal(row.status, "ready_for_review");
  });

  async function advanceToReadyForReview(revisionId) {
    for (const nextStatus of ["reviewing", "in_progress", "ready_for_review"]) {
      await internalAdminClient.rpc("transition_revision_status", {
        target_revision_id: revisionId,
        p_new_status: nextStatus,
      });
    }
  }

  test("the correct client can approve a ready-for-review revision", async () => {
    const { data } = await submitAndTrack(clientAOwnerClient);
    const revisionId = data[0].id;
    await advanceToReadyForReview(revisionId);

    const { data: approval, error } = await clientAOwnerClient.rpc(
      "approve_revision",
      { target_revision_id: revisionId },
    );
    assert.equal(error, null);
    assert.equal(approval[0].status, "approved");
    assert.equal(approval[0].already_approved, false);
  });

  test("the wrong client cannot approve another client's revision", async () => {
    const { data } = await submitAndTrack(clientAOwnerClient);
    const revisionId = data[0].id;
    await advanceToReadyForReview(revisionId);

    const { error } = await clientBOwnerClient.rpc("approve_revision", {
      target_revision_id: revisionId,
    });
    assert.ok(error);
  });

  test("repeated approval by the correct client is idempotent", async () => {
    const { data } = await submitAndTrack(clientAOwnerClient);
    const revisionId = data[0].id;
    await advanceToReadyForReview(revisionId);

    const first = await clientAOwnerClient.rpc("approve_revision", {
      target_revision_id: revisionId,
    });
    assert.equal(first.error, null);
    assert.equal(first.data[0].already_approved, false);

    const second = await clientAOwnerClient.rpc("approve_revision", {
      target_revision_id: revisionId,
    });
    assert.equal(second.error, null);
    assert.equal(second.data[0].already_approved, true);

    const { data: activities } = await admin
      .from("revision_activities")
      .select("id")
      .eq("revision_id", revisionId)
      .eq("activity_type", "approved");
    assert.equal((activities ?? []).length, 1);
  });

  test("the correct client can request further changes with a non-empty comment", async () => {
    const { data } = await submitAndTrack(clientAOwnerClient);
    const revisionId = data[0].id;
    await advanceToReadyForReview(revisionId);

    const { data: result, error } = await clientAOwnerClient.rpc(
      "request_revision_changes",
      { target_revision_id: revisionId, p_comment: "Please use the brand indigo, not blue." },
    );
    assert.equal(error, null);
    assert.equal(result[0].status, "rejected");
  });

  test("an empty further-changes comment fails", async () => {
    const { data } = await submitAndTrack(clientAOwnerClient);
    const revisionId = data[0].id;
    await advanceToReadyForReview(revisionId);

    const { error } = await clientAOwnerClient.rpc(
      "request_revision_changes",
      { target_revision_id: revisionId, p_comment: "" },
    );
    assert.ok(error);
  });

  test("a rejected revision can be returned to in_progress, and every important event remains traceable in order", async () => {
    const { data } = await submitAndTrack(clientAOwnerClient);
    const revisionId = data[0].id;
    await advanceToReadyForReview(revisionId);

    await clientAOwnerClient.rpc("request_revision_changes", {
      target_revision_id: revisionId,
      p_comment: "Needs another pass.",
    });

    const { error: resumeError } = await internalAdminClient.rpc(
      "transition_revision_status",
      { target_revision_id: revisionId, p_new_status: "in_progress" },
    );
    assert.equal(resumeError, null);

    const { data: activities } = await admin
      .from("revision_activities")
      .select("activity_type, created_at")
      .eq("revision_id", revisionId)
      .order("created_at", { ascending: true });

    const types = (activities ?? []).map((activity) => activity.activity_type);
    assert.deepEqual(types, [
      "submitted",
      "status_changed", // -> reviewing
      "status_changed", // -> in_progress
      "status_changed", // -> ready_for_review
      "rejected",
      "status_changed", // -> in_progress (resumed)
    ]);
  });
});
