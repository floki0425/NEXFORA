"use server";

import { z } from "zod";

import { requireInternalMember } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import {
  buildProjectFileStoragePath,
  hasMismatchedFileSignature,
  MAX_FILE_SIZE_BYTES,
  PROJECT_FILES_BUCKET,
  sanitizeDisplayFileName,
  SIGNED_URL_TTL_SECONDS,
} from "@/lib/storage/project-files";

import { canManageProjectFiles } from "./permissions";
import {
  projectFileIdSchema,
  uploadInternalFileFieldsSchema,
  validateUploadedFile,
} from "./schemas";
import type { DownloadUrlResult, FileActionResult } from "./types";

const GENERIC_ERROR = "We couldn't upload this file. Please try again.";
const DOWNLOAD_ERROR = "We couldn't prepare this download. Please try again.";

const projectIdSchema = z.uuid();

export async function uploadInternalProjectFileAction(
  projectId: string,
  formData: FormData,
): Promise<FileActionResult> {
  const idResult = projectIdSchema.safeParse(projectId);
  if (!idResult.success) {
    return { ok: false, message: "This project could not be found." };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, message: "Choose a file to upload." };
  }

  const fieldsResult = uploadInternalFileFieldsSchema.safeParse({
    visibility: formData.get("visibility"),
    category: formData.get("category") ?? "",
    idempotencyKey: formData.get("idempotencyKey"),
  });

  if (!fieldsResult.success) {
    return {
      ok: false,
      message: "Please correct the highlighted fields.",
      fieldErrors: fieldsResult.error.flatten().fieldErrors,
    };
  }

  const fileCheck = validateUploadedFile(file);
  if (!fileCheck.ok) {
    return { ok: false, message: fileCheck.message };
  }

  try {
    const member = await requireInternalMember();
    const supabase = await createClient();

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, client_id, project_manager_id")
      .eq("id", idResult.data)
      .eq("organization_id", member.organizationId)
      .maybeSingle();

    if (projectError || !project) {
      return { ok: false, message: "This project could not be found." };
    }

    const { data: membershipRow } = await supabase
      .from("project_members")
      .select("id")
      .eq("project_id", idResult.data)
      .eq("user_id", member.profileId)
      .maybeSingle();

    const canManage = canManageProjectFiles(member, {
      projectManagerId: project.project_manager_id,
      isProjectMember: Boolean(membershipRow),
    });

    if (!canManage) {
      return {
        ok: false,
        message:
          "You do not have permission to upload files to this project.",
      };
    }

    const buffer = await file.arrayBuffer();
    if (buffer.byteLength <= 0 || buffer.byteLength > MAX_FILE_SIZE_BYTES) {
      return { ok: false, message: "This file is too large." };
    }

    if (file.type && hasMismatchedFileSignature(buffer, file.type)) {
      return {
        ok: false,
        message: "This file's contents do not match its file type.",
      };
    }

    // create_internal_project_file's p_mime_type parameter is a required,
    // non-nullable string in the generated Args type (no SQL default) — a
    // value must always be supplied, never null/undefined. The browser
    // occasionally reports no MIME type at all (file.type === ""); fall
    // back to a safe, explicit value rather than storing an empty string.
    // This does not bypass the allowlist check above, which already
    // validated by extension when file.type was empty, and is only a
    // display/storage fallback, never a way around that check.
    const safeMimeType = file.type.trim() || "application/octet-stream";

    const safeFileName = sanitizeDisplayFileName(file.name);
    const storagePath = buildProjectFileStoragePath({
      organizationId: member.organizationId,
      clientId: project.client_id,
      projectId: idResult.data,
      uniqueId: fieldsResult.data.idempotencyKey,
      safeFileName,
    });

    const { error: uploadError } = await supabase.storage
      .from(PROJECT_FILES_BUCKET)
      .upload(storagePath, buffer, {
        contentType: safeMimeType,
        upsert: true,
      });

    if (uploadError) {
      console.error("Project file storage upload failed.", {
        projectId: idResult.data,
        mimeType: safeMimeType,
        fileSize: buffer.byteLength,
      });
      return { ok: false, message: GENERIC_ERROR };
    }

    const { error: metadataError } = await supabase.rpc(
      "create_internal_project_file",
      {
        target_project_id: idResult.data,
        p_file_name: safeFileName,
        p_storage_path: storagePath,
        p_mime_type: safeMimeType,
        p_file_size: buffer.byteLength,
        p_visibility: fieldsResult.data.visibility,
        // p_category is a required, non-nullable string with no SQL default.
        // The schema already normalizes it to a plain (possibly empty)
        // string via .trim().default(""); an empty string has documented
        // meaning here — the function's own
        // `nullif(btrim(coalesce(...)), '')` treats it as "no category" —
        // so it is passed through as-is rather than converted to null.
        p_category: fieldsResult.data.category,
      },
    );

    if (metadataError) {
      if (metadataError.code === "23505") {
        // A genuine retry: metadata for this idempotency key already
        // exists, so the just-uploaded object is the correct one — nothing
        // to clean up.
        return { ok: true, message: "File uploaded." };
      }

      // Storage upload succeeded but metadata insert failed: clean up the
      // now-orphaned object rather than leaving it unreferenced.
      await supabase.storage.from(PROJECT_FILES_BUCKET).remove([storagePath]);
      console.error("Project file metadata insert failed.", {
        projectId: idResult.data,
        stage: "metadata_insert",
      });
      return { ok: false, message: GENERIC_ERROR };
    }

    return { ok: true, message: "File uploaded." };
  } catch {
    console.error("Project file upload authorization or persistence failed.");
    return { ok: false, message: GENERIC_ERROR };
  }
}

export async function getInternalFileDownloadUrlAction(
  fileId: string,
): Promise<DownloadUrlResult> {
  const idResult = projectFileIdSchema.safeParse(fileId);
  if (!idResult.success) {
    return { ok: false, message: "This file could not be found." };
  }

  try {
    const member = await requireInternalMember();
    const supabase = await createClient();

    const { data: file, error } = await supabase
      .from("project_files")
      .select("storage_path, file_name")
      .eq("organization_id", member.organizationId)
      .eq("id", idResult.data)
      .maybeSingle();

    if (error || !file) {
      return { ok: false, message: "This file could not be found." };
    }

    const { data: signed, error: signError } = await supabase.storage
      .from(PROJECT_FILES_BUCKET)
      .createSignedUrl(file.storage_path, SIGNED_URL_TTL_SECONDS, {
        download: file.file_name,
      });

    if (signError || !signed?.signedUrl) {
      console.error("Signed URL generation failed.", {
        fileId: idResult.data,
      });
      return { ok: false, message: DOWNLOAD_ERROR };
    }

    return {
      ok: true,
      message: "Ready.",
      url: signed.signedUrl,
      fileName: file.file_name,
    };
  } catch {
    console.error("File download authorization failed.");
    return { ok: false, message: DOWNLOAD_ERROR };
  }
}
