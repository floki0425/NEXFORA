import { z } from "zod";

import {
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  isAllowedExtension,
  isAllowedMimeType,
  MAX_FILE_SIZE_BYTES,
} from "../../lib/storage/project-files.ts";

import { FILE_VISIBILITIES } from "./constants.ts";

export const projectFileIdSchema = z.uuid();

export const uploadInternalFileFieldsSchema = z.object({
  visibility: z.enum(FILE_VISIBILITIES),
  category: z.string().trim().max(60).optional().default(""),
  // Client-generated once per upload attempt and resent unchanged on retry —
  // never trusted for authorization, only for idempotency (see
  // buildProjectFileStoragePath).
  idempotencyKey: z.uuid(),
});

export const uploadClientFileFieldsSchema = z.object({
  category: z.string().trim().max(60).optional().default(""),
  idempotencyKey: z.uuid(),
});

export interface FileValidationError {
  ok: false;
  message: string;
}

export interface FileValidationSuccess {
  ok: true;
}

/**
 * Validates the actual uploaded File — never trusts the browser-reported
 * mime_type/size as the only check: file.size comes from the browser's File
 * object metadata (accurate for a real <input type="file"> selection, unlike
 * a hand-crafted request), and is re-checked again server-side against the
 * real buffer length before upload.
 */
export function validateUploadedFile(
  file: File,
): FileValidationError | FileValidationSuccess {
  if (file.size <= 0) {
    return { ok: false, message: "Choose a file to upload." };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      ok: false,
      message: `This file is too large. The maximum size is ${Math.floor(
        MAX_FILE_SIZE_BYTES / (1024 * 1024),
      )} MB.`,
    };
  }

  if (!isAllowedExtension(file.name)) {
    return {
      ok: false,
      message: `That file type is not supported. Allowed types: ${ALLOWED_EXTENSIONS.join(", ")}.`,
    };
  }

  if (file.type && !isAllowedMimeType(file.type)) {
    return {
      ok: false,
      message: `That file type is not supported. Allowed types: ${ALLOWED_MIME_TYPES.join(", ")}.`,
    };
  }

  return { ok: true };
}
