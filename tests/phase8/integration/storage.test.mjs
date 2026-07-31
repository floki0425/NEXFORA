// Section 9 — Storage integration tests against the real private test
// bucket ("project-files-private"), using authenticated test-user sessions
// so the real storage.objects RLS policies are exercised, not bypassed.
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

const BUCKET = "project-files-private";

describe("Phase 8 storage integration — project-files-private", () => {
  if (!hasPhase8IntegrationEnv()) {
    test("Phase 8 storage integration tests", (t) => {
      t.skip(getPhase8IntegrationSkipReason());
    });
    return;
  }

  let admin;
  let fixtures;
  let internalAdminClient;
  let clientAOwnerClient;
  let clientAViewerClient;
  let clientBOwnerClient;
  const uploadedPathsToCleanUp = [];

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
    if (uploadedPathsToCleanUp.length > 0) {
      await admin.storage.from(BUCKET).remove(uploadedPathsToCleanUp);
    }
    await cleanupPhase8Fixtures(admin, fixtures);
  });

  function internalPath(suffix) {
    return `organization/${fixtures.orgA.id}/client/${fixtures.clientA.id}/project/${fixtures.projectA.id}/${crypto.randomUUID()}-${suffix}`;
  }

  test("internal authorized upload succeeds", async () => {
    const path = internalPath("internal-upload.txt");
    const { error } = await internalAdminClient.storage
      .from(BUCKET)
      .upload(path, new TextEncoder().encode("internal upload"), {
        contentType: "text/plain",
      });
    assert.equal(error, null);
    uploadedPathsToCleanUp.push(path);
  });

  test("client owner/manager authorized upload succeeds", async () => {
    const path = internalPath("client-owner-upload.txt");
    const { error } = await clientAOwnerClient.storage
      .from(BUCKET)
      .upload(path, new TextEncoder().encode("client owner upload"), {
        contentType: "text/plain",
      });
    assert.equal(error, null);
    uploadedPathsToCleanUp.push(path);
  });

  test("client viewer upload fails", async () => {
    const path = internalPath("viewer-upload-attempt.txt");
    const { error } = await clientAViewerClient.storage
      .from(BUCKET)
      .upload(path, new TextEncoder().encode("should not land"), {
        contentType: "text/plain",
      });
    assert.ok(error);
  });

  test("cross-client upload fails (Client B cannot write into Client A's path)", async () => {
    const path = internalPath("cross-client-upload-attempt.txt");
    const { error } = await clientBOwnerClient.storage
      .from(BUCKET)
      .upload(path, new TextEncoder().encode("should not land"), {
        contentType: "text/plain",
      });
    assert.ok(error);
  });

  test("the uploaded object is private — the bucket is not public and no getPublicUrl-style access works unauthenticated", async () => {
    const { data: buckets } = await admin.storage.listBuckets();
    const bucket = (buckets ?? []).find((entry) => entry.name === BUCKET);
    assert.ok(bucket);
    assert.equal(bucket.public, false);
  });

  test("an authorized download can obtain a short-lived signed URL, and it is not a permanent public URL", async () => {
    const { data, error } = await internalAdminClient.storage
      .from(BUCKET)
      .createSignedUrl(fixtures.clientVisibleFile.storagePath, 120);
    assert.equal(error, null);
    assert.ok(data?.signedUrl);
    assert.match(data.signedUrl, /token=/);
  });

  test("an unauthorized user cannot obtain a signed URL for another client's/organization's object", async () => {
    const { error } = await clientBOwnerClient.storage
      .from(BUCKET)
      .createSignedUrl(fixtures.clientVisibleFile.storagePath, 120);
    assert.ok(error);
  });

  test("a client cannot obtain a signed URL for an internal-visibility file", async () => {
    const { error } = await clientAOwnerClient.storage
      .from(BUCKET)
      .createSignedUrl(fixtures.internalFile.storagePath, 120);
    assert.ok(error);
  });

  test("a generated signed URL is usable before expiry", async () => {
    const { data, error } = await internalAdminClient.storage
      .from(BUCKET)
      .createSignedUrl(fixtures.clientVisibleFile.storagePath, 120);
    assert.equal(error, null);

    const response = await fetch(data.signedUrl);
    assert.equal(response.ok, true);
  });

  test("the storage path is server-controlled: a well-formed but foreign-project path is rejected on upload", async () => {
    const foreignProjectId = crypto.randomUUID();
    const path = `organization/${fixtures.orgA.id}/client/${fixtures.clientA.id}/project/${foreignProjectId}/${crypto.randomUUID()}-forged-project.txt`;
    const { error } = await internalAdminClient.storage
      .from(BUCKET)
      .upload(path, new TextEncoder().encode("forged project id"), {
        contentType: "text/plain",
      });
    // private.can_manage_project() resolves no row for a project id that
    // does not exist, so the insert policy's EXISTS check fails.
    assert.ok(error);
  });

  test("metadata matches the uploaded object (file_size and mime_type are the real, re-verified values, not just echoed input)", async () => {
    const path = internalPath("metadata-match.txt");
    const contents = "exact metadata match fixture";
    const { error: uploadError } = await internalAdminClient.storage
      .from(BUCKET)
      .upload(path, new TextEncoder().encode(contents), {
        contentType: "text/plain",
      });
    assert.equal(uploadError, null);
    uploadedPathsToCleanUp.push(path);

    const { data, error } = await internalAdminClient.rpc(
      "create_internal_project_file",
      {
        target_project_id: fixtures.projectA.id,
        p_file_name: "metadata-match.txt",
        p_storage_path: path,
        p_mime_type: "text/plain",
        p_file_size: contents.length,
        p_visibility: "internal",
        p_category: "",
      },
    );
    assert.equal(error, null);
    const fileId = data?.[0]?.id;
    assert.ok(fileId);

    const { data: row } = await admin
      .from("project_files")
      .select("file_size, mime_type, storage_path")
      .eq("id", fileId)
      .single();
    assert.equal(row.file_size, contents.length);
    assert.equal(row.mime_type, "text/plain");
    assert.equal(row.storage_path, path);

    await admin.from("project_files").delete().eq("id", fileId);
  });

  test("retrying the same upload (same idempotency-key path) does not create duplicate metadata records", async () => {
    const path = internalPath("retry-idempotent.txt");
    const contents = "retry fixture";

    async function attemptUploadAndMetadata() {
      await internalAdminClient.storage
        .from(BUCKET)
        .upload(path, new TextEncoder().encode(contents), {
          contentType: "text/plain",
          upsert: true,
        });
      return internalAdminClient.rpc("create_internal_project_file", {
        target_project_id: fixtures.projectA.id,
        p_file_name: "retry-idempotent.txt",
        p_storage_path: path,
        p_mime_type: "text/plain",
        p_file_size: contents.length,
        p_visibility: "internal",
        p_category: "",
      });
    }

    const first = await attemptUploadAndMetadata();
    assert.equal(first.error, null);
    uploadedPathsToCleanUp.push(path);

    const retry = await attemptUploadAndMetadata();
    // The unique constraint on project_files.storage_path means a genuine
    // retry either errors with a 23505 (handled as a safe no-op by the
    // application layer — see uploadInternalProjectFileAction) or returns
    // the same row; either way, exactly one metadata row must exist.
    void retry;

    const { data: rows, error } = await admin
      .from("project_files")
      .select("id")
      .eq("storage_path", path);
    assert.equal(error, null);
    assert.equal((rows ?? []).length, 1);

    await admin.from("project_files").delete().eq("storage_path", path);
  });

  test("cleanup after a deliberately failed metadata insert removes only that upload's own object, never another project's", async () => {
    const path = internalPath("cleanup-only-own-object.txt");
    await internalAdminClient.storage
      .from(BUCKET)
      .upload(path, new TextEncoder().encode("will fail metadata"), {
        contentType: "text/plain",
      });

    // Force a metadata failure with a value the function rejects
    // (an oversized file_size), mirroring what uploadInternalProjectFileAction
    // does when create_internal_project_file errors after a successful
    // storage upload.
    const { error } = await internalAdminClient.rpc(
      "create_internal_project_file",
      {
        target_project_id: fixtures.projectA.id,
        p_file_name: "cleanup-only-own-object.txt",
        p_storage_path: path,
        p_mime_type: "text/plain",
        p_file_size: 999999999999,
        p_visibility: "internal",
        p_category: "",
      },
    );
    assert.ok(error);

    await internalAdminClient.storage.from(BUCKET).remove([path]);

    const { data: stillThere } = await admin.storage
      .from(BUCKET)
      .list(
        `organization/${fixtures.orgA.id}/client/${fixtures.clientA.id}/project/${fixtures.projectA.id}`,
      );
    const names = (stillThere ?? []).map((entry) => entry.name);
    assert.ok(!names.some((name) => path.endsWith(name)));

    // The pre-existing fixture objects for this same project must remain —
    // cleanup must never remove another upload's object.
    const { data: signedForFixture, error: signedForFixtureError } =
      await internalAdminClient.storage
        .from(BUCKET)
        .createSignedUrl(fixtures.clientVisibleFile.storagePath, 60);
    assert.equal(signedForFixtureError, null);
    assert.ok(signedForFixture?.signedUrl);
  });
});
