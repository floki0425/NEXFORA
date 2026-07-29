import "server-only";

import type {
  MilestoneStatus,
  ProjectPriority,
  ProjectStatus,
} from "@/features/projects/constants";
import { createClient } from "@/lib/supabase/server";

import type {
  PortalMilestone,
  PortalProjectDetail,
  PortalProjectListItem,
} from "./types.ts";

interface ClientProjectRow {
  id: string;
  name: string;
  status: string;
  priority: string;
  progress_percent: number;
  start_date: string | null;
  target_date: string | null;
  updated_at: string;
}

interface ClientProjectDetailRow extends ClientProjectRow {
  description: string | null;
  milestones: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    due_date: string | null;
    sort_order: number;
  }[];
}

function mapProjectRow(row: ClientProjectRow): PortalProjectListItem {
  return {
    id: row.id,
    name: row.name,
    status: row.status as ProjectStatus,
    priority: row.priority as ProjectPriority,
    progressPercent: row.progress_percent,
    startDate: row.start_date,
    targetDate: row.target_date,
    updatedAt: row.updated_at,
  };
}

function mapMilestoneRow(
  row: ClientProjectDetailRow["milestones"][number],
): PortalMilestone {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status as MilestoneStatus,
    dueDate: row.due_date,
    sortOrder: row.sort_order,
  };
}

/**
 * Reads exclusively through get_client_projects() — a SECURITY DEFINER
 * function that resolves the caller's active client membership internally
 * and returns only client-safe columns. There is deliberately no
 * client-facing RLS policy on public.projects itself (see the Phase 7
 * migration's RLS comment): a policy would also let a client user query the
 * base table directly and see internal-only columns like
 * project_manager_id/organization_id.
 */
export async function getPortalProjects(): Promise<PortalProjectListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_client_projects");

  if (error) {
    throw new Error("Unable to load your projects.");
  }

  return ((data ?? []) as unknown as ClientProjectRow[]).map(mapProjectRow);
}

/**
 * Reads through get_client_project_detail(), which returns null uniformly
 * for both "no such project" and "project belongs to another client" — a
 * modified project id can never be used to probe another client's data.
 * Tasks are never included: no documented client-visible boundary exists
 * for them in this phase.
 */
export async function getPortalProjectDetail(
  projectId: string,
): Promise<PortalProjectDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_client_project_detail", {
    target_project_id: projectId,
  });

  if (error || !data) {
    return null;
  }

  const row = data as unknown as ClientProjectDetailRow;

  return {
    ...mapProjectRow(row),
    description: row.description,
    milestones: (row.milestones ?? [])
      .map(mapMilestoneRow)
      .sort((a, b) => a.sortOrder - b.sortOrder),
  };
}
