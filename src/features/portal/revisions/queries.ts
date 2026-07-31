import "server-only";

import type {
  RevisionPriority,
  RevisionStatus,
} from "@/features/revisions/constants";
import { createClient } from "@/lib/supabase/server";

import type {
  PortalRevisionActivityItem,
  PortalRevisionListItem,
} from "./types";

interface ClientRevisionRow {
  id: string;
  page_name: string | null;
  section_name: string | null;
  title: string;
  description: string;
  priority: string;
  status: string;
  attachment_file_id: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

/**
 * Reads exclusively through get_client_revisions() — a SECURITY DEFINER
 * function scoped to the caller's active client, mirroring
 * get_client_project_files()'s "no client-facing RLS policy on the base
 * table" design.
 */
export async function getPortalRevisions(
  projectId: string,
): Promise<PortalRevisionListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_client_revisions", {
    target_project_id: projectId,
  });

  if (error) {
    throw new Error("Unable to load this project's revisions.");
  }

  return ((data ?? []) as unknown as ClientRevisionRow[]).map((row) => ({
    id: row.id,
    pageName: row.page_name,
    sectionName: row.section_name,
    title: row.title,
    description: row.description,
    priority: row.priority as RevisionPriority,
    status: row.status as RevisionStatus,
    attachmentFileId: row.attachment_file_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
  }));
}

interface ClientRevisionActivityRow {
  activity_type: string;
  title: string;
  description: string | null;
  created_at: string;
}

export async function getPortalRevisionActivities(
  revisionId: string,
): Promise<PortalRevisionActivityItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "get_client_revision_activities",
    { target_revision_id: revisionId },
  );

  if (error) {
    throw new Error("Unable to load this revision's activity.");
  }

  return ((data ?? []) as unknown as ClientRevisionActivityRow[]).map(
    (row) => ({
      activityType: row.activity_type,
      title: row.title,
      description: row.description,
      createdAt: row.created_at,
    }),
  );
}
