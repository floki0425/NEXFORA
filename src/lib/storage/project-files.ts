/**
 * Centralized project-files storage configuration and path/filename helpers.
 * Nothing in this module calls Supabase directly — see
 * src/features/files/actions.ts and src/features/portal/files/actions.ts for
 * the only call sites that upload to, or read from, this bucket. Pure logic
 * only (no secrets, no server-only APIs), so this intentionally has no
 * "server-only" guard — it is unit-tested directly, matching
 * src/lib/utils/cn.ts.
 */

export const PROJECT_FILES_BUCKET = "project-files-private";

// 26214400 bytes = 25 MiB. Must stay in sync with
// project_files_file_size_check and the bucket's own file_size_limit in the
// Phase 8 migration.
export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

// Short-lived: long enough to start a download, short enough that a leaked
// link is useless soon after.
export const SIGNED_URL_TTL_SECONDS = 120;

export const ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "application/zip",
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export const ALLOWED_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".txt",
  ".zip",
] as const;

export function isAllowedMimeType(mimeType: string): boolean {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType);
}

function extensionOf(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  return lastDot === -1 ? "" : fileName.slice(lastDot).toLowerCase();
}

export function isAllowedExtension(fileName: string): boolean {
  return (ALLOWED_EXTENSIONS as readonly string[]).includes(
    extensionOf(fileName),
  );
}

interface MagicSignature {
  mimeType: AllowedMimeType;
  matches: (bytes: Uint8Array) => boolean;
}

// Best-effort magic-byte signatures for formats with a reliable one. ZIP-based
// office formats (.docx/.xlsx/.pptx/.zip) and legacy binary office formats
// (.doc/.xls/.ppt) share ambiguous or compound signatures, and plain text has
// none at all, so those are intentionally not covered here — this check
// exists to catch a clearly mislabeled upload (e.g. a renamed .exe claiming
// to be a PNG), not to fully validate every supported type.
const MAGIC_SIGNATURES: readonly MagicSignature[] = [
  {
    mimeType: "image/png",
    matches: (b) =>
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  {
    mimeType: "image/jpeg",
    matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mimeType: "image/gif",
    matches: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46,
  },
  {
    mimeType: "image/webp",
    matches: (b) =>
      b[0] === 0x52 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x46 &&
      b[8] === 0x57 &&
      b[9] === 0x45 &&
      b[10] === 0x42 &&
      b[11] === 0x50,
  },
  {
    mimeType: "application/pdf",
    matches: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46,
  },
];

/**
 * Returns true only when the file's first bytes positively match a *known,
 * different* format than the one it claims to be — never trusting the
 * browser-reported mime_type as the only validation. Returns false (not
 * rejected) for formats with no reliable signature here, rather than
 * guessing.
 */
export function hasMismatchedFileSignature(
  buffer: ArrayBuffer,
  claimedMimeType: string,
): boolean {
  const bytes = new Uint8Array(buffer.slice(0, 16));

  for (const signature of MAGIC_SIGNATURES) {
    if (signature.matches(bytes)) {
      return signature.mimeType !== claimedMimeType;
    }
  }

  return false;
}

const FORBIDDEN_DISPLAY_CHARS = new Set(["<", ">", ":", '"', "|", "?", "*"]);

function isPrintableChar(char: string): boolean {
  const code = char.charCodeAt(0);
  // Excludes ASCII control characters (0-31) and DEL (127), which have no
  // legitimate place in a displayed file name and could otherwise be used to
  // smuggle unexpected bytes into logs or the UI.
  return code >= 32 && code !== 127 && !FORBIDDEN_DISPLAY_CHARS.has(char);
}

/**
 * Produces a safe, display-friendly file name: strips directory separators,
 * control characters, and reserved punctuation so a crafted name can never
 * be used for path traversal or to inject extra path segments, collapses
 * whitespace, and bounds the length. This is the name shown in the UI and
 * stored in project_files.file_name — never the unique storage object name.
 */
export function sanitizeDisplayFileName(originalName: string): string {
  const withoutPath = originalName.split(/[/\\]/).pop() ?? originalName;
  const stripped = Array.from(withoutPath)
    .filter(isPrintableChar)
    .join("")
    .trim()
    .replace(/\s+/g, " ");
  const safe = stripped === "" ? "file" : stripped;

  if (safe.length <= 255) {
    return safe;
  }

  const ext = extensionOf(safe);
  const base = ext ? safe.slice(0, safe.length - ext.length) : safe;
  return `${base.slice(0, 255 - ext.length)}${ext}`;
}

interface BuildStoragePathInput {
  organizationId: string;
  clientId: string;
  projectId: string;
  uniqueId: string;
  safeFileName: string;
}

/**
 * Server-controlled storage path:
 * organization/{organization_id}/client/{client_id}/project/{project_id}/{uuid}-{safe_filename}
 *
 * organizationId/clientId/projectId always come from validated server-side
 * lookups, never from browser input. uniqueId is a client-supplied
 * idempotency key (see the upload actions) — it is never trusted for
 * authorization, only used so a retried submission reuses the same path.
 */
export function buildProjectFileStoragePath({
  organizationId,
  clientId,
  projectId,
  uniqueId,
  safeFileName,
}: BuildStoragePathInput): string {
  return `organization/${organizationId}/client/${clientId}/project/${projectId}/${uniqueId}-${safeFileName}`;
}
