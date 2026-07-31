import "server-only";

import { createClient } from "@/lib/supabase/server";

import type { PortalFileListItem } from "./types";

interface ClientProjectFileRow {
  id: string;
  file_name: string;
  mime_type: string | null;
  file_size: number | null;
  category: string | null;
  created_at: string;
}

/**
 * Reads exclusively through get_client_project_files() — a SECURITY DEFINER
 * function that resolves the caller's active client membership internally
 * and returns only visibility='client' files with no storage_path or
 * uploaded_by. There is deliberately no client-facing RLS policy on
 * project_files itself, mirroring Phase 7's projects/milestones design.
 */
export async function getPortalProjectFiles(
  projectId: string,
): Promise<PortalFileListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_client_project_files", {
    target_project_id: projectId,
  });

  if (error) {
    throw new Error("Unable to load this project's files.");
  }

  return ((data ?? []) as unknown as ClientProjectFileRow[]).map((row) => ({
    id: row.id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    category: row.category,
    createdAt: row.created_at,
  }));
}
