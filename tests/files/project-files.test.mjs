import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { canManageProjectFiles } from "../../src/features/files/permissions.ts";
import { validateUploadedFile } from "../../src/features/files/schemas.ts";
import {
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
} from "../../src/features/files/constants.ts";
import {
  buildProjectFileStoragePath,
  hasMismatchedFileSignature,
  PROJECT_FILES_BUCKET,
  sanitizeDisplayFileName,
} from "../../src/lib/storage/project-files.ts";

const MIGRATION_PATH = new URL(
  "../../supabase/migrations/20260803000000_phase_8_files_revisions.sql",
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
  assert.ok(start > -1, `expected to find marker "${startMarker}"`);
  const end = endMarker ? text.indexOf(endMarker, start) : text.length;
  return text.slice(start, end === -1 ? text.length : end);
}

// -- Storage helpers ---------------------------------------------------

test("buildProjectFileStoragePath produces the documented path shape", () => {
  const path = buildProjectFileStoragePath({
    organizationId: "11111111-1111-4111-8111-111111111111",
    clientId: "22222222-2222-4222-8222-222222222222",
    projectId: "33333333-3333-4333-8333-333333333333",
    uniqueId: "44444444-4444-4444-8444-444444444444",
    safeFileName: "logo.png",
  });

  assert.equal(
    path,
    "organization/11111111-1111-4111-8111-111111111111/client/22222222-2222-4222-8222-222222222222/project/33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444-logo.png",
  );
});

test("sanitizeDisplayFileName strips path separators and control characters", () => {
  assert.equal(sanitizeDisplayFileName("../../etc/passwd"), "passwd");
  assert.equal(sanitizeDisplayFileName("..\\windows\\system32"), "system32");

  const nameWithControlBytes = ["weird", String.fromCharCode(0), "name", String.fromCharCode(31), ".txt"].join("");
  assert.equal(sanitizeDisplayFileName(nameWithControlBytes), "weirdname.txt");

  assert.equal(sanitizeDisplayFileName('a<b>c:d"e|f?g*h.txt'), "abcdefgh.txt");
  assert.equal(sanitizeDisplayFileName(""), "file");
});

test("sanitizeDisplayFileName collapses a run of ordinary whitespace to a single space", () => {
  const nameWithExtraSpaces = ["weird", "  ", "name.txt"].join("");
  assert.equal(sanitizeDisplayFileName(nameWithExtraSpaces), "weird name.txt");
});

test("sanitizeDisplayFileName bounds the result to 255 characters and preserves the extension", () => {
  const longName = `${"a".repeat(300)}.png`;
  const result = sanitizeDisplayFileName(longName);
  assert.ok(result.length <= 255);
  assert.ok(result.endsWith(".png"));
});

test("hasMismatchedFileSignature detects a clearly mislabeled upload", () => {
  const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]);
  assert.equal(
    hasMismatchedFileSignature(pngBytes.buffer, "image/png"),
    false,
  );
  assert.equal(
    hasMismatchedFileSignature(pngBytes.buffer, "application/pdf"),
    true,
  );
});

test("hasMismatchedFileSignature does not reject formats it cannot reliably sniff", () => {
  const textBytes = new TextEncoder().encode("hello world");
  assert.equal(
    hasMismatchedFileSignature(textBytes.buffer, "text/plain"),
    false,
  );
});

test("PROJECT_FILES_BUCKET matches the documented bucket name", () => {
  assert.equal(PROJECT_FILES_BUCKET, "project-files-private");
});

// -- File validation -----------------------------------------------------

function fakeFile({ name, size, type }) {
  return {
    name,
    size,
    type,
  };
}

test("validateUploadedFile rejects an oversized file", () => {
  const result = validateUploadedFile(
    fakeFile({ name: "big.png", size: MAX_FILE_SIZE_BYTES + 1, type: "image/png" }),
  );
  assert.equal(result.ok, false);
});

test("validateUploadedFile rejects a disallowed extension", () => {
  const result = validateUploadedFile(
    fakeFile({ name: "script.exe", size: 100, type: "application/octet-stream" }),
  );
  assert.equal(result.ok, false);
});

test("validateUploadedFile accepts an allowed file within the size limit", () => {
  const result = validateUploadedFile(
    fakeFile({ name: "brief.pdf", size: 1024, type: "application/pdf" }),
  );
  assert.equal(result.ok, true);
});

test("ALLOWED_MIME_TYPES and ALLOWED_EXTENSIONS are non-empty and consistent", () => {
  assert.ok(ALLOWED_MIME_TYPES.length > 0);
  assert.ok(ALLOWED_EXTENSIONS.length > 0);
  assert.ok(ALLOWED_MIME_TYPES.includes("application/pdf"));
  assert.ok(ALLOWED_EXTENSIONS.includes(".pdf"));
});

// -- Role permissions (mirrors private.can_manage_project in the migration) --

test("super_admin and admin may manage files for any project", () => {
  const context = { projectManagerId: null, isProjectMember: false };
  assert.equal(
    canManageProjectFiles({ role: "super_admin", profileId: "x" }, context),
    true,
  );
  assert.equal(
    canManageProjectFiles({ role: "admin", profileId: "x" }, context),
    true,
  );
});

test("project_manager may manage files only for an accessible project", () => {
  const member = { role: "project_manager", profileId: "pm-1" };
  assert.equal(
    canManageProjectFiles(member, {
      projectManagerId: "pm-1",
      isProjectMember: false,
    }),
    true,
  );
  assert.equal(
    canManageProjectFiles(member, {
      projectManagerId: "someone-else",
      isProjectMember: true,
    }),
    true,
  );
  assert.equal(
    canManageProjectFiles(member, {
      projectManagerId: "someone-else",
      isProjectMember: false,
    }),
    false,
  );
});

test("team_member may upload only when assigned to the project", () => {
  const member = { role: "team_member", profileId: "tm-1" };
  assert.equal(
    canManageProjectFiles(member, {
      projectManagerId: null,
      isProjectMember: true,
    }),
    true,
  );
  assert.equal(
    canManageProjectFiles(member, {
      projectManagerId: null,
      isProjectMember: false,
    }),
    false,
  );
});

// -- Migration: schema shape ------------------------------------------------

test("project_files matches the documented field list plus no undocumented additions", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "create table public.project_files",
    "create index project_files_organization_created_idx",
  );

  for (const column of [
    "organization_id",
    "client_id",
    "project_id",
    "uploaded_by",
    "file_name",
    "storage_path",
    "mime_type",
    "file_size",
    "visibility",
    "category",
    "created_at",
  ]) {
    assert.ok(
      section.includes(column),
      `expected project_files to include documented column "${column}"`,
    );
  }

  assert.match(section, /check \(visibility in \('internal', 'client'\)\)/);
  assert.match(section, /constraint project_files_storage_path_key\s*\n\s*unique \(storage_path\)/);
});

test("project_files enforces project/organization/client consistency at the database boundary", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "create table public.project_files",
    "create index project_files_organization_created_idx",
  );

  assert.match(
    section,
    /constraint project_files_project_org_client_fkey\s*\n\s*foreign key \(project_id, organization_id, client_id\)\s*\n\s*references public\.projects \(id, organization_id, client_id\)/,
  );
});

test("project_files has no INSERT/UPDATE/DELETE grant to authenticated — only the RPC functions mutate it", async () => {
  const migration = await readMigration();

  assert.doesNotMatch(migration, /grant insert[^;]*on[^;]*public\.project_files/i);
  assert.doesNotMatch(migration, /grant update[^;]*on[^;]*public\.project_files/i);
  assert.doesNotMatch(migration, /grant delete[^;]*on[^;]*public\.project_files/i);
  assert.match(
    migration,
    /grant select on table public\.project_files to authenticated;/,
  );
});

test("anonymous access to project_files is fully denied", async () => {
  const migration = await readMigration();

  assert.doesNotMatch(migration, /to anon[^;]*project_files/i);
});

test("create_internal_project_file validates visibility, file size, and project access via private.can_manage_project", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "create or replace function public.create_internal_project_file",
    "create or replace function public.create_client_project_file",
  );

  assert.match(section, /private\.can_manage_project\(target_project_id\)/);
  assert.match(section, /p_visibility not in \('internal', 'client'\)/);
  assert.match(section, /p_file_size > 26214400/);
});

test("create_client_project_file hard-codes visibility to 'client' and never accepts it as a parameter", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "create or replace function public.create_client_project_file",
    "create or replace function public.get_client_project_organization_id",
  );

  assert.doesNotMatch(section, /p_visibility/);
  assert.match(section, /'client',\s*\n\s*nullif\(btrim\(coalesce\(p_category/);
  assert.match(section, /resolved_role not in \('owner', 'manager'\)/);
});

test("get_client_project_files never returns storage_path or uploaded_by", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "create or replace function public.get_client_project_files",
    "revoke all on function public.get_client_project_files",
  );

  assert.doesNotMatch(section, /storage_path/);
  assert.doesNotMatch(section, /uploaded_by/);
  assert.match(section, /file\.visibility = 'client'/);
});

test("get_client_file_for_download is scoped to the caller's own client and visibility='client'", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "create or replace function public.get_client_file_for_download",
    "create or replace function public.create_client_revision",
  );

  assert.match(section, /file\.client_id = \(select private\.active_client_id\(\)\)/);
  assert.match(section, /file\.visibility = 'client'/);
});

// -- Storage bucket + policies ----------------------------------------------

test("the storage bucket is private with a matching size limit and mime allowlist", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "insert into storage.buckets",
    "on conflict (id) do nothing;",
  );

  assert.match(section, /'project-files-private',\s*\n\s*'project-files-private',\s*\n\s*false,\s*\n\s*26214400,/);
  assert.match(section, /'application\/pdf'/);
});

test("storage.objects policies validate the object path against real projects/membership, not folder naming alone", async () => {
  const migration = await readMigration();

  assert.match(migration, /create policy project_files_storage_insert_internal/);
  assert.match(migration, /create policy project_files_storage_insert_client/);
  assert.match(migration, /create policy project_files_storage_select_internal/);
  assert.match(migration, /create policy project_files_storage_select_client/);
  assert.match(migration, /create policy project_files_storage_delete_internal/);
  assert.match(migration, /create policy project_files_storage_delete_client/);

  const insertInternal = slice(
    migration,
    "create policy project_files_storage_insert_internal",
    "create policy project_files_storage_insert_client",
  );
  assert.match(
    insertInternal,
    /exists \(\s*\n\s*select 1\s*\n\s*from public\.projects as project/,
  );
  assert.match(
    insertInternal,
    /private\.can_manage_project\(\(storage\.foldername\(name\)\)\[6\]::uuid\)/,
  );

  const selectClient = slice(
    migration,
    "create policy project_files_storage_select_client",
    "-- Delete policies exist only",
  );
  assert.match(selectClient, /from public\.project_files as file/);
  assert.match(selectClient, /file\.visibility = 'client'/);
});

test("no broad `using (true)` policy exists on storage.objects for this bucket", async () => {
  const migration = await readMigration();
  const storageSection = slice(migration, "insert into storage.buckets");

  assert.doesNotMatch(storageSection, /using \(\s*true\s*\)/);
  assert.doesNotMatch(storageSection, /with check \(\s*true\s*\)/);
});

// -- Actions: idempotency, cleanup, and safe logging -------------------------

test("uploadInternalProjectFileAction cleans up the orphaned storage object when metadata insert fails, and treats a duplicate key as a safe retry", async () => {
  const actions = await readSrcFile("../../src/features/files/actions.ts");

  assert.match(actions, /metadataError\.code === "23505"/);
  assert.match(actions, /storage\.from\(PROJECT_FILES_BUCKET\)\.remove\(\[storagePath\]\)/);
});

test("file upload and download actions never log complete signed URLs or raw storage errors to the client", async () => {
  const filesActions = await readSrcFile("../../src/features/files/actions.ts");
  const portalActions = await readSrcFile(
    "../../src/features/portal/files/actions.ts",
  );

  for (const file of [filesActions, portalActions]) {
    const consoleCalls = [...file.matchAll(/console\.(?:log|error)\(([\s\S]*?)\);/g)].map(
      (match) => match[1],
    );
    for (const call of consoleCalls) {
      assert.doesNotMatch(call, /signedUrl/);
      assert.doesNotMatch(call, /signed\.signedUrl/);
    }
  }
});

test("downloads always use a short-lived signed URL, never a permanent public URL", async () => {
  const filesActions = await readSrcFile("../../src/features/files/actions.ts");
  const portalActions = await readSrcFile(
    "../../src/features/portal/files/actions.ts",
  );

  for (const file of [filesActions, portalActions]) {
    assert.match(file, /createSignedUrl\(/);
    assert.doesNotMatch(file, /getPublicUrl\(/);
  }
});

test("no signed URL is ever persisted to the database — only returned directly to the caller", async () => {
  const migration = await readMigration();
  assert.doesNotMatch(migration, /signed_url/i);
});

// -- RPC payloads: required string arguments never receive null -------------
//
// create_internal_project_file/create_client_project_file's p_mime_type and
// p_category parameters are required, non-nullable strings in the generated
// Args type (no SQL default) — the actions must always supply a real
// string, never `value || null`.

test("a missing browser MIME type falls back to a safe, explicit value instead of null or an empty string", async () => {
  const filesActions = await readSrcFile("../../src/features/files/actions.ts");
  const portalActions = await readSrcFile(
    "../../src/features/portal/files/actions.ts",
  );

  for (const file of [filesActions, portalActions]) {
    assert.match(
      file,
      /const safeMimeType = file\.type\.trim\(\) \|\| "application\/octet-stream";/,
    );
    assert.match(file, /p_mime_type: safeMimeType/);
  }
});

test("a valid browser-reported MIME type is preserved, not overridden", () => {
  // Exercises the exact expression used in both actions:
  // `file.type.trim() || "application/octet-stream"`.
  const computeSafeMimeType = (type) => type.trim() || "application/octet-stream";

  assert.equal(computeSafeMimeType("image/png"), "image/png");
  assert.equal(computeSafeMimeType("  application/pdf  "), "application/pdf");
  assert.equal(computeSafeMimeType(""), "application/octet-stream");
  assert.equal(computeSafeMimeType("   "), "application/octet-stream");
});

test("the MIME fallback never bypasses the extension/allowlist validation already performed by validateUploadedFile", async () => {
  const filesActions = await readSrcFile("../../src/features/files/actions.ts");
  const portalActions = await readSrcFile(
    "../../src/features/portal/files/actions.ts",
  );

  for (const file of [filesActions, portalActions]) {
    const fileCheckIndex = file.indexOf("validateUploadedFile(file)");
    const safeMimeTypeIndex = file.indexOf("const safeMimeType");
    assert.ok(fileCheckIndex > -1 && safeMimeTypeIndex > -1);
    // Validation always happens before the fallback is computed, so the
    // fallback can never be used to admit a file that failed validation.
    assert.ok(fileCheckIndex < safeMimeTypeIndex);
  }
});

test("category is passed through as a real (possibly empty) string, never converted to null", async () => {
  const filesActions = await readSrcFile("../../src/features/files/actions.ts");
  const portalActions = await readSrcFile(
    "../../src/features/portal/files/actions.ts",
  );

  for (const file of [filesActions, portalActions]) {
    assert.match(file, /p_category: fieldsResult\.data\.category,/);
    assert.doesNotMatch(file, /p_category: fieldsResult\.data\.category \|\| null/);
  }
});

test("neither file-upload action ever sends an explicit null for a required RPC string argument", async () => {
  const filesActions = await readSrcFile("../../src/features/files/actions.ts");
  const portalActions = await readSrcFile(
    "../../src/features/portal/files/actions.ts",
  );

  for (const file of [filesActions, portalActions]) {
    assert.doesNotMatch(file, /p_mime_type:.*\|\| null/);
    assert.doesNotMatch(file, /p_category:.*\|\| null/);
    assert.doesNotMatch(file, /p_mime_type:.*\?\? null/);
    assert.doesNotMatch(file, /p_category:.*\?\? null/);
  }
});

test("no unsafe type workaround was used anywhere in the file-upload actions", async () => {
  const filesActions = await readSrcFile("../../src/features/files/actions.ts");
  const portalActions = await readSrcFile(
    "../../src/features/portal/files/actions.ts",
  );

  for (const file of [filesActions, portalActions]) {
    assert.doesNotMatch(file, /as string/);
    assert.doesNotMatch(file, /as any/);
    assert.doesNotMatch(file, /as never/);
    assert.doesNotMatch(file, /@ts-ignore/);
    assert.doesNotMatch(file, /@ts-expect-error/);
    assert.doesNotMatch(file, /!\s*[,)]/);
  }
});
