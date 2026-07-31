// Additional Phase 8 file-validation unit tests, closing gaps beyond what
// tests/files/project-files.test.mjs already covers (MIME/extension
// allowlists, size limits, filename sanitization, the octet-stream
// fallback). These run with no external dependencies.

import assert from "node:assert/strict";
import test from "node:test";

import {
  uploadClientFileFieldsSchema,
  uploadInternalFileFieldsSchema,
  validateUploadedFile,
} from "../../../src/features/files/schemas.ts";
import { FILE_VISIBILITIES } from "../../../src/features/files/constants.ts";

function fakeFile({ name, size, type }) {
  return { name, size, type };
}

test("an allowed MIME type with an allowed extension succeeds", () => {
  const result = validateUploadedFile(
    fakeFile({ name: "photo.png", size: 1024, type: "image/png" }),
  );
  assert.equal(result.ok, true);
});

test("an unsupported MIME type fails even with an allowed extension", () => {
  // A .png name but a MIME type outside the allowlist — the extension check
  // alone is not sufficient; the reported type is also checked.
  const result = validateUploadedFile(
    fakeFile({ name: "photo.png", size: 1024, type: "application/x-msdownload" }),
  );
  assert.equal(result.ok, false);
});

test("an empty file (zero bytes) fails validation", () => {
  const result = validateUploadedFile(
    fakeFile({ name: "empty.txt", size: 0, type: "text/plain" }),
  );
  assert.equal(result.ok, false);
});

test("a negative reported file size fails validation", () => {
  const result = validateUploadedFile(
    fakeFile({ name: "broken.txt", size: -1, type: "text/plain" }),
  );
  assert.equal(result.ok, false);
});

test("internal-upload visibility accepts only the documented internal/client values", () => {
  const base = { category: "", idempotencyKey: "11111111-1111-4111-8111-111111111111" };

  for (const visibility of FILE_VISIBILITIES) {
    assert.equal(
      uploadInternalFileFieldsSchema.safeParse({ ...base, visibility }).success,
      true,
      `expected "${visibility}" to be a valid visibility`,
    );
  }

  assert.equal(
    uploadInternalFileFieldsSchema.safeParse({ ...base, visibility: "public" }).success,
    false,
  );
  assert.equal(
    uploadInternalFileFieldsSchema.safeParse({ ...base, visibility: "" }).success,
    false,
  );
});

test("client uploads have no visibility field at all — visibility is always server-hardcoded to 'client'", () => {
  // uploadClientFileFieldsSchema intentionally has no `visibility` key: the
  // portal upload path (create_client_project_file) hard-codes
  // visibility = 'client' in SQL and never accepts it as a parameter, so
  // there is nothing for the client-side schema to validate here.
  const result = uploadClientFileFieldsSchema.safeParse({
    category: "",
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal("visibility" in result.data, false);
  }
});

test("an empty category is preserved as an explicit empty string, not converted to null or omitted", () => {
  // Documented Phase 8 decision (see docs/PHASE_8_FILES_REVISIONS_SETUP.md,
  // "RPC argument nullability"): category has no SQL default, so it cannot
  // be omitted from the RPC payload. An empty string is safe and equivalent
  // to "no category" because the database function applies
  // `nullif(btrim(coalesce(p_category, '')), '')`.
  const result = uploadInternalFileFieldsSchema.safeParse({
    visibility: "internal",
    category: "",
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.category, "");
    assert.notEqual(result.data.category, null);
    assert.notEqual(result.data.category, undefined);
  }
});

test("a missing idempotency key is rejected (it must always be a valid uuid)", () => {
  const result = uploadInternalFileFieldsSchema.safeParse({
    visibility: "internal",
    category: "",
    idempotencyKey: "not-a-uuid",
  });
  assert.equal(result.success, false);
});
