import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  uploadProposalAttachmentFieldsSchema,
  validateUploadedProposalAttachment,
} from "../../src/features/proposals/schemas.ts";
import {
  buildProposalAttachmentStoragePath,
  hasMismatchedFileSignature,
  isAllowedProposalAttachmentExtension,
  MAX_FILE_SIZE_BYTES,
  PROPOSAL_ATTACHMENT_BUCKET,
  PROPOSAL_ATTACHMENT_MIME_TYPE,
  sanitizeDisplayFileName,
} from "../../src/lib/storage/proposal-attachments.ts";

const organizationId = "11111111-1111-4111-8111-111111111111";
const proposalId = "44444444-4444-4444-8444-444444444444";
const idempotencyKey = "55555555-5555-4555-8555-555555555555";

const MIGRATION_PATH = new URL(
  "../../supabase/migrations/20260907000000_phase_13_proposal_attachments.sql",
  import.meta.url,
);

async function readMigration() {
  return readFile(MIGRATION_PATH, "utf8");
}

/** Minimal File stand-in: only name/size/type are read before upload. */
function fakeFile({ name = "proposal.pdf", size = 1024, type = "application/pdf" } = {}) {
  return { name, size, type };
}

// -- Upload validation -------------------------------------------------

test("accepts a well-formed PDF", () => {
  assert.deepEqual(validateUploadedProposalAttachment(fakeFile()), { ok: true });
});

test("rejects an empty file", () => {
  const result = validateUploadedProposalAttachment(fakeFile({ size: 0 }));
  assert.equal(result.ok, false);
});

test("rejects a file above the size ceiling", () => {
  const result = validateUploadedProposalAttachment(
    fakeFile({ size: MAX_FILE_SIZE_BYTES + 1 }),
  );
  assert.equal(result.ok, false);
  assert.match(result.message, /too large/i);
});

test("rejects a non-PDF extension even when the mime type claims PDF", () => {
  const result = validateUploadedProposalAttachment(
    fakeFile({ name: "contract.docx" }),
  );
  assert.equal(result.ok, false);
  assert.match(result.message, /only pdf/i);
});

test("rejects a non-PDF mime type even when the extension claims PDF", () => {
  const result = validateUploadedProposalAttachment(
    fakeFile({ name: "proposal.pdf", type: "application/zip" }),
  );
  assert.equal(result.ok, false);
});

test("allows an absent browser-reported mime type, falling back to extension", () => {
  assert.deepEqual(
    validateUploadedProposalAttachment(fakeFile({ type: "" })),
    { ok: true },
  );
});

test("extension check is case-insensitive and ignores surrounding space", () => {
  assert.equal(isAllowedProposalAttachmentExtension("Proposal.PDF"), true);
  assert.equal(isAllowedProposalAttachmentExtension("  final.pdf  "), true);
  assert.equal(isAllowedProposalAttachmentExtension("final.pdf.exe"), false);
});

test("idempotency key must be a uuid", () => {
  assert.equal(
    uploadProposalAttachmentFieldsSchema.safeParse({ idempotencyKey }).success,
    true,
  );
  assert.equal(
    uploadProposalAttachmentFieldsSchema.safeParse({ idempotencyKey: "nope" })
      .success,
    false,
  );
});

// -- Magic-byte check --------------------------------------------------

test("a renamed non-PDF is caught by its signature", () => {
  // PNG header claiming to be a PDF.
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]).buffer;
  assert.equal(
    hasMismatchedFileSignature(png, PROPOSAL_ATTACHMENT_MIME_TYPE),
    true,
  );
});

test("a genuine PDF passes its signature check", () => {
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]).buffer;
  assert.equal(
    hasMismatchedFileSignature(pdf, PROPOSAL_ATTACHMENT_MIME_TYPE),
    false,
  );
});

// -- Storage path ------------------------------------------------------

test("storage path is scoped by organization and proposal", () => {
  const path = buildProposalAttachmentStoragePath({
    organizationId,
    proposalId,
    uniqueId: idempotencyKey,
    safeFileName: "final.pdf",
  });

  assert.equal(
    path,
    `organization/${organizationId}/proposal/${proposalId}/${idempotencyKey}-final.pdf`,
  );
});

test("the same idempotency key resolves to the same path on retry", () => {
  const input = {
    organizationId,
    proposalId,
    uniqueId: idempotencyKey,
    safeFileName: "final.pdf",
  };

  assert.equal(
    buildProposalAttachmentStoragePath(input),
    buildProposalAttachmentStoragePath(input),
  );
});

test("a crafted file name cannot escape its proposal folder", () => {
  const path = buildProposalAttachmentStoragePath({
    organizationId,
    proposalId,
    uniqueId: idempotencyKey,
    safeFileName: sanitizeDisplayFileName("../../../etc/passwd.pdf"),
  });

  assert.equal(path.includes(".."), false);
  assert.match(
    path,
    new RegExp(`^organization/${organizationId}/proposal/${proposalId}/`),
  );
});

// -- Migration guarantees ----------------------------------------------

test("attachment columns are constrained to PDF within the size ceiling", async () => {
  const migration = await readMigration();

  assert.match(
    migration,
    /constraint proposals_attachment_mime_type_check[\s\S]*?attachment_mime_type = 'application\/pdf'/i,
  );
  assert.match(
    migration,
    /constraint proposals_attachment_file_size_check[\s\S]*?attachment_file_size <= 26214400/i,
  );
});

test("attachment metadata is all-or-nothing", async () => {
  const migration = await readMigration();
  assert.match(migration, /constraint proposals_attachment_presence_check/i);
});

test("the size ceiling matches the application constant and the bucket limit", async () => {
  const migration = await readMigration();

  assert.equal(MAX_FILE_SIZE_BYTES, 26214400);
  // The bucket's own file_size_limit is a second, independent ceiling; if
  // these ever drift, a file could pass one check and fail the other.
  assert.match(migration, /26214400,\s*\n\s*array\['application\/pdf'\]/i);
});

test("the attachment bucket is private", async () => {
  const migration = await readMigration();

  assert.match(migration, new RegExp(PROPOSAL_ATTACHMENT_BUCKET));
  assert.match(
    migration,
    new RegExp(`'${PROPOSAL_ATTACHMENT_BUCKET}',\\s*\\n\\s*false,`, "i"),
  );
});

test("the attachment bucket has no storage.objects policy", async () => {
  const migration = await readMigration();

  // Authorization for this bucket lives entirely in the Server Actions, which
  // reach storage through the service-role client. A policy here would either
  // be dead weight or — for the anonymous client leg, which has no auth.uid()
  // and whose token RLS can never see — a weaker duplicate of the token check
  // get_proposal_attachment_by_token already performs.
  assert.doesNotMatch(migration, /on storage\.objects/i);
  assert.doesNotMatch(migration, /create policy[\s\S]*storage/i);
});

test("the token-gated attachment RPC validates hash format, revocation, and expiry", async () => {
  const migration = await readMigration();
  const fn = migration.slice(
    migration.indexOf("function public.get_proposal_attachment_by_token"),
  );

  assert.match(fn, /p_token_hash !~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(fn, /token\.revoked_at is null/);
  assert.match(fn, /token\.expires_at > pg_catalog\.now\(\)/);
  assert.match(fn, /security definer/);
  assert.match(fn, /set search_path = ''/);
});

test("the token-gated attachment RPC is granted to anon but revoked from public first", async () => {
  const migration = await readMigration();

  assert.match(
    migration,
    /revoke all on function public\.get_proposal_attachment_by_token\(text\)\s*\n\s*from public, anon, authenticated;/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.get_proposal_attachment_by_token\(text\)\s*\n\s*to anon, authenticated;/i,
  );
});

test("the client page payload never carries the storage path", async () => {
  const migration = await readMigration();
  const viewFn = migration.slice(
    migration.indexOf("function public.view_proposal_by_token"),
    migration.indexOf("function public.get_proposal_attachment_by_token"),
  );

  assert.match(viewFn, /'attachment_file_name', target_proposal\.attachment_file_name/);
  assert.match(viewFn, /'attachment_file_size', target_proposal\.attachment_file_size/);
  // The path is resolved only at download time, by the separate RPC.
  assert.doesNotMatch(viewFn, /'attachment_storage_path'/);
});

test("the version snapshot records attachment metadata at send time", async () => {
  const migration = await readMigration();
  const sendFn = migration.slice(
    migration.indexOf("function public.send_proposal"),
    migration.indexOf("function public.view_proposal_by_token"),
  );

  assert.match(sendFn, /'attachment_file_name', target_proposal\.attachment_file_name/);
  assert.match(sendFn, /'attachment_storage_path', target_proposal\.attachment_storage_path/);
});

test("attachment columns are writable only through a column-level grant", async () => {
  const migration = await readMigration();

  assert.match(
    migration,
    /grant update \(\s*\n\s*attachment_file_name,[\s\S]*?\) on public\.proposals to authenticated;/i,
  );
  // Immutability is inherited from the existing update policy rather than
  // redefined here — a new permissive policy would be a way around it.
  assert.doesNotMatch(migration, /create policy proposals_update/i);
});
