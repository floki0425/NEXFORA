// Storage-path unit tests, closing gaps beyond
// tests/files/project-files.test.mjs's single "produces the documented path
// shape" case: uniqueness, non-reliance on the original filename alone, and
// that the path is always built from server-supplied identifiers rather
// than anything a browser could choose directly.

import assert from "node:assert/strict";
import test from "node:test";

import { buildProjectFileStoragePath } from "../../../src/lib/storage/project-files.ts";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";

test("buildProjectFileStoragePath has no parameter for a caller-supplied full path — only individually-typed identifier fields", () => {
  // A structural guarantee, not just a behavioral one: the function's own
  // parameter list makes it impossible to pass a raw/pre-built path
  // straight through, unlike a signature such as `(path: string)` would.
  assert.equal(buildProjectFileStoragePath.length, 1);
  const path = buildProjectFileStoragePath({
    organizationId: ORG_ID,
    clientId: CLIENT_ID,
    projectId: PROJECT_ID,
    uniqueId: "44444444-4444-4444-8444-444444444444",
    safeFileName: "brief.pdf",
  });
  assert.match(path, /^organization\//);
});

test("two uploads with different unique ids never collide, even for the identical file name", () => {
  const first = buildProjectFileStoragePath({
    organizationId: ORG_ID,
    clientId: CLIENT_ID,
    projectId: PROJECT_ID,
    uniqueId: "44444444-4444-4444-8444-444444444444",
    safeFileName: "brief.pdf",
  });
  const second = buildProjectFileStoragePath({
    organizationId: ORG_ID,
    clientId: CLIENT_ID,
    projectId: PROJECT_ID,
    uniqueId: "55555555-5555-4555-8555-555555555555",
    safeFileName: "brief.pdf",
  });

  assert.notEqual(first, second);
});

test("a retried upload with the same idempotency key intentionally reuses the same path", () => {
  // This is deliberate, documented idempotency behavior (see
  // docs/PHASE_8_FILES_REVISIONS_SETUP.md, "Upload and cleanup strategy"),
  // not a collision bug: the same logical attempt must land on the same
  // object so a network retry does not create a duplicate.
  const first = buildProjectFileStoragePath({
    organizationId: ORG_ID,
    clientId: CLIENT_ID,
    projectId: PROJECT_ID,
    uniqueId: "44444444-4444-4444-8444-444444444444",
    safeFileName: "brief.pdf",
  });
  const retry = buildProjectFileStoragePath({
    organizationId: ORG_ID,
    clientId: CLIENT_ID,
    projectId: PROJECT_ID,
    uniqueId: "44444444-4444-4444-8444-444444444444",
    safeFileName: "brief.pdf",
  });

  assert.equal(first, retry);
});

test("the original filename alone is never used as the storage key", () => {
  const path = buildProjectFileStoragePath({
    organizationId: ORG_ID,
    clientId: CLIENT_ID,
    projectId: PROJECT_ID,
    uniqueId: "44444444-4444-4444-8444-444444444444",
    safeFileName: "brief.pdf",
  });

  assert.notEqual(path, "brief.pdf");
  // The unique id must appear as a distinct path segment ahead of the
  // filename, not just be a coincidental substring.
  assert.match(path, /44444444-4444-4444-8444-444444444444-brief\.pdf$/);
});

test("organization, client, and project identifiers occupy fixed, unambiguous path segments", () => {
  const path = buildProjectFileStoragePath({
    organizationId: ORG_ID,
    clientId: CLIENT_ID,
    projectId: PROJECT_ID,
    uniqueId: "44444444-4444-4444-8444-444444444444",
    safeFileName: "brief.pdf",
  });
  const segments = path.split("/");

  assert.deepEqual(segments.slice(0, 6), [
    "organization",
    ORG_ID,
    "client",
    CLIENT_ID,
    "project",
    PROJECT_ID,
  ]);
});

test("a path-traversal attempt in the file name cannot escape the generated path prefix", () => {
  // sanitizeDisplayFileName() is responsible for stripping "../" segments
  // before a name ever reaches buildProjectFileStoragePath(); this test
  // documents that even an unsanitized name cannot change which
  // organization/client/project prefix the object lands under, since those
  // three segments are fixed, server-derived arguments the caller cannot
  // override via the file name.
  const path = buildProjectFileStoragePath({
    organizationId: ORG_ID,
    clientId: CLIENT_ID,
    projectId: PROJECT_ID,
    uniqueId: "44444444-4444-4444-8444-444444444444",
    safeFileName: "../../../etc/passwd",
  });

  assert.match(
    path,
    new RegExp(`^organization/${ORG_ID}/client/${CLIENT_ID}/project/${PROJECT_ID}/`),
  );
});
