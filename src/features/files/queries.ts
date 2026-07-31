import "server-only";

import { createClient } from "@/lib/supabase/server";

import type { FileVisibility } from "./constants";
import type { ProjectFileListItem } from "./types";

interface SupabaseErrorDetails {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

function logSupabaseError(
  operation: string,
  error: SupabaseErrorDetails,
): void {
  if (process.env.NODE_ENV !== "production") {
    console.error(`${operation} Supabase error`, {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
  }
}

interface ProjectFileRow {
  id: string;
  file_name: string;
  mime_type: string | null;
  file_size: number | null;
  visibility: string;
  category: string | null;
  created_at: string;
  profiles: { full_name: string } | { full_name: string }[] | null;
}

function uploaderNameFromJoin(
  profiles: ProjectFileRow["profiles"],
): string | null {
  if (!profiles) {
    return null;
  }

  const profile = Array.isArray(profiles) ? profiles[0] : profiles;
  return profile?.full_name ?? null;
}

/**
 * Internal file list for one project. RLS (project_files_select_internal_members)
 * already scopes rows to the caller's organization; the explicit
 * organization_id filter here is defense-in-depth and matches the existing
 * query convention (see features/projects/queries.ts).
 */
export async function getProjectFiles(
  organizationId: string,
  projectId: string,
): Promise<ProjectFileListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_files")
    .select(
      "id, file_name, mime_type, file_size, visibility, category, created_at, profiles(full_name)",
    )
    .eq("organization_id", organizationId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    logSupabaseError("getProjectFiles", error);
    throw new Error("Unable to load project files.");
  }

  const rows = (data ?? []) as unknown as ProjectFileRow[];

  return rows.map((row) => ({
    id: row.id,
    file_name: row.file_name,
    mime_type: row.mime_type,
    file_size: row.file_size,
    visibility: row.visibility as FileVisibility,
    category: row.category,
    created_at: row.created_at,
    uploaderName: uploaderNameFromJoin(row.profiles),
  }));
}

export interface InternalFileForDownload {
  storagePath: string;
  fileName: string;
}

/**
 * Authorizes and resolves a single file for the internal signed-download
 * flow. Relies on project_files_select_internal_members RLS plus the
 * explicit organization_id filter — never authorizes using a storage path
 * alone, and never accepts one from the browser.
 */
export async function getProjectFileForInternalDownload(
  organizationId: string,
  fileId: string,
): Promise<InternalFileForDownload | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_files")
    .select("storage_path, file_name")
    .eq("organization_id", organizationId)
    .eq("id", fileId)
    .maybeSingle();

  if (error) {
    logSupabaseError("getProjectFileForInternalDownload", error);
    return null;
  }

  if (!data) {
    return null;
  }

  return { storagePath: data.storage_path, fileName: data.file_name };
}
