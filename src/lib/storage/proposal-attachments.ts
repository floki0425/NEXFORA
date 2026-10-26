/**
 * Centralized proposal-attachment storage configuration and path helpers.
 *
 * Nothing here calls Supabase directly — see src/features/proposals/actions.ts
 * (internal upload/replace/remove/download) and
 * src/features/proposals/client-actions.ts (token-gated client download) for
 * the only call sites that touch this bucket. Pure logic only, so this has no
 * "server-only" guard and can be unit tested directly, matching
 * src/lib/storage/project-files.ts.
 *
 * The format-agnostic validation primitives are re-exported from
 * project-files rather than duplicated: a mislabeled-file check, a display
 * name sanitizer, a size ceiling, and a signed-URL TTL mean the same thing
 * for both features, and having one definition keeps them from drifting.
 */

import {
  hasMismatchedFileSignature,
  MAX_FILE_SIZE_BYTES,
  sanitizeDisplayFileName,
  SIGNED_URL_TTL_SECONDS,
} from "./project-files.ts";

export {
  hasMismatchedFileSignature,
  MAX_FILE_SIZE_BYTES,
  sanitizeDisplayFileName,
  SIGNED_URL_TTL_SECONDS,
};

export const PROPOSAL_ATTACHMENT_BUCKET = "proposal-attachments-private";

// Deliberately narrower than the project-files allowlist: this slot holds the
// finished proposal document, not arbitrary deliverables. Kept in sync with
// proposals_attachment_mime_type_check and the bucket's own
// allowed_mime_types in the Phase 13 migration.
export const PROPOSAL_ATTACHMENT_MIME_TYPE = "application/pdf";
export const PROPOSAL_ATTACHMENT_EXTENSION = ".pdf";

export function isAllowedProposalAttachmentExtension(
  fileName: string,
): boolean {
  return fileName.trim().toLowerCase().endsWith(PROPOSAL_ATTACHMENT_EXTENSION);
}

interface BuildProposalAttachmentStoragePathInput {
  organizationId: string;
  proposalId: string;
  uniqueId: string;
  safeFileName: string;
}

/**
 * Server-controlled storage path:
 * organization/{organization_id}/proposal/{proposal_id}/{uuid}-{safe_filename}
 *
 * Scoped by proposal rather than by client/project: proposals exist before
 * conversion, so proposals.client_id and proposals.lead_id are both nullable
 * and neither is a reliable path segment. organizationId and proposalId always
 * come from validated server-side lookups, never from browser input. uniqueId
 * is a client-supplied idempotency key — never trusted for authorization, only
 * so a retried submission reuses the same path.
 */
export function buildProposalAttachmentStoragePath({
  organizationId,
  proposalId,
  uniqueId,
  safeFileName,
}: BuildProposalAttachmentStoragePathInput): string {
  return `organization/${organizationId}/proposal/${proposalId}/${uniqueId}-${safeFileName}`;
}
