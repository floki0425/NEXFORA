import "server-only";

import { createClient } from "@/lib/supabase/server";

import {
  REVISIONS_PAGE_SIZE,
  type RevisionPriority,
  type RevisionStatus,
} from "./constants";
import type {
  RevisionActivityItem,
  RevisionDetail,
  RevisionFilters,
  RevisionPageData,
} from "./types";

// revisions has two foreign keys reaching `projects` — the plain
// revisions_project_id_fkey and the composite
// revisions_project_org_client_fkey used for tenant-consistency checking
// (see the Phase 8 migration) — so an unqualified `projects(...)` embed is
// ambiguous to PostgREST (PGRST201), exactly the same situation
// features/projects/queries.ts already documents for `projects -> clients`.
// The `!revisions_project_id_fkey` / `!revisions_assigned_to_fkey` hints
// select the simple relationship explicitly.
const REVISION_LIST_COLUMNS =
  "id, project_id, title, priority, status, assigned_to, created_at, updated_at, projects!revisions_project_id_fkey(name), clients!revisions_client_id_fkey(business_name), profiles!revisions_assigned_to_fkey(full_name)";

const REVISION_DETAIL_COLUMNS =
  "id, organization_id, project_id, client_id, page_name, section_name, title, description, priority, status, assigned_to, attachment_file_id, resolved_at, created_at, updated_at, projects!revisions_project_id_fkey(name), clients!revisions_client_id_fkey(business_name), submitted_by_profile:profiles!revisions_submitted_by_fkey(full_name), assignee_profile:profiles!revisions_assigned_to_fkey(full_name)";

function safeSearchValue(value: string): string {
  return value.replace(/[%_,().]/g, " ").replace(/\s+/g, " ").trim();
}

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

function one<T>(value: T | T[] | null): T | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

interface RevisionListRow {
  id: string;
  project_id: string;
  title: string;
  priority: string;
  status: string;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  projects: { name: string } | { name: string }[] | null;
  clients: { business_name: string } | { business_name: string }[] | null;
  profiles: { full_name: string } | { full_name: string }[] | null;
}

export async function getRevisionPage(
  organizationId: string,
  filters: RevisionFilters,
): Promise<RevisionPageData> {
  const supabase = await createClient();
  const from = (filters.page - 1) * REVISIONS_PAGE_SIZE;
  const to = from + REVISIONS_PAGE_SIZE - 1;
  let query = supabase
    .from("revisions")
    .select(REVISION_LIST_COLUMNS, { count: "exact" })
    .eq("organization_id", organizationId);

  const search = safeSearchValue(filters.query);
  if (search) {
    query = query.ilike("title", `%${search}%`);
  }

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  if (filters.priority) {
    query = query.eq("priority", filters.priority);
  }

  if (filters.projectId) {
    query = query.eq("project_id", filters.projectId);
  }

  if (filters.assignedTo) {
    query = query.eq("assigned_to", filters.assignedTo);
  }

  const { data, count, error } = await query
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (error) {
    logSupabaseError("getRevisionPage", error);
    throw new Error("Unable to load revisions.");
  }

  const total = count ?? 0;
  const rows = (data ?? []) as unknown as RevisionListRow[];

  return {
    revisions: rows.map((row) => ({
      id: row.id,
      project_id: row.project_id,
      title: row.title,
      priority: row.priority as RevisionPriority,
      status: row.status as RevisionStatus,
      assigned_to: row.assigned_to,
      created_at: row.created_at,
      updated_at: row.updated_at,
      projectName: one(row.projects)?.name ?? "Unknown project",
      clientName: one(row.clients)?.business_name ?? "Unknown client",
      assigneeName: one(row.profiles)?.full_name ?? null,
    })),
    total,
    page: filters.page,
    pageCount: Math.max(1, Math.ceil(total / REVISIONS_PAGE_SIZE)),
  };
}

export async function getProjectOptions(
  organizationId: string,
): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, name")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true })
    .limit(200);

  if (error) {
    logSupabaseError("getProjectOptions", error);
    throw new Error("Unable to load projects.");
  }

  return data ?? [];
}

export async function getAssigneeOptions(
  organizationId: string,
): Promise<{ id: string; fullName: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_members")
    .select("user_id, profiles(full_name)")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .limit(200);

  if (error) {
    logSupabaseError("getAssigneeOptions", error);
    throw new Error("Unable to load team members.");
  }

  interface MemberRow {
    user_id: string;
    profiles: { full_name: string } | { full_name: string }[] | null;
  }

  return ((data ?? []) as unknown as MemberRow[])
    .map((row) => ({
      id: row.user_id,
      fullName: one(row.profiles)?.full_name ?? "Unknown member",
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

interface RevisionDetailRow {
  id: string;
  organization_id: string;
  project_id: string;
  client_id: string;
  page_name: string | null;
  section_name: string | null;
  title: string;
  description: string;
  priority: string;
  status: string;
  assigned_to: string | null;
  attachment_file_id: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  projects: { name: string } | { name: string }[] | null;
  clients: { business_name: string } | { business_name: string }[] | null;
  submitted_by_profile: { full_name: string } | { full_name: string }[] | null;
  assignee_profile: { full_name: string } | { full_name: string }[] | null;
}

interface RevisionActivityRow {
  activity_type: string;
  title: string;
  description: string | null;
  created_at: string;
  profiles: { full_name: string } | { full_name: string }[] | null;
}

export async function getRevisionDetail(
  organizationId: string,
  revisionId: string,
): Promise<RevisionDetail | null> {
  const supabase = await createClient();
  const { data: revision, error } = await supabase
    .from("revisions")
    .select(REVISION_DETAIL_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("id", revisionId)
    .maybeSingle();

  if (error) {
    logSupabaseError("getRevisionDetail.revision", error);
    throw new Error("Unable to load this revision.");
  }

  if (!revision) {
    return null;
  }

  const row = revision as unknown as RevisionDetailRow;

  const { data: activityRows, error: activityError } = await supabase
    .from("revision_activities")
    .select("activity_type, title, description, created_at, profiles(full_name)")
    .eq("revision_id", revisionId)
    .order("created_at", { ascending: true })
    .limit(200);

  if (activityError) {
    logSupabaseError("getRevisionDetail.activities", activityError);
    throw new Error("Unable to load this revision's activity.");
  }

  const activities: RevisionActivityItem[] = (
    (activityRows ?? []) as unknown as RevisionActivityRow[]
  ).map((activity) => ({
    activity_type: activity.activity_type,
    title: activity.title,
    description: activity.description,
    created_at: activity.created_at,
    actorName: one(activity.profiles)?.full_name ?? null,
  }));

  return {
    id: row.id,
    organization_id: row.organization_id,
    project_id: row.project_id,
    client_id: row.client_id,
    page_name: row.page_name,
    section_name: row.section_name,
    title: row.title,
    description: row.description,
    priority: row.priority as RevisionPriority,
    status: row.status as RevisionStatus,
    assigned_to: row.assigned_to,
    attachment_file_id: row.attachment_file_id,
    resolved_at: row.resolved_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    projectName: one(row.projects)?.name ?? "Unknown project",
    clientName: one(row.clients)?.business_name ?? "Unknown client",
    submitterName: one(row.submitted_by_profile)?.full_name ?? null,
    assigneeName: one(row.assignee_profile)?.full_name ?? null,
    activities,
  };
}
