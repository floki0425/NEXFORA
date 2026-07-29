import "server-only";

import { createClient } from "@/lib/supabase/server";

import {
  PROJECTS_PAGE_SIZE,
  type MilestoneStatus,
  type ProjectMemberRole,
  type ProjectPriority,
  type ProjectStatus,
  type TaskPriority,
  type TaskStatus,
} from "./constants";
import type {
  ProjectDetail,
  ProjectFilters,
  ProjectListItem,
  ProjectManagerOption,
  ProjectPageData,
} from "./types";

// `projects` has two foreign keys into `clients`: the plain `client_id`
// lookup and the composite `(client_id, organization_id)` constraint that
// enforces cross-tenant ownership at the database level (see the Phase 5
// migration). Both target the same table, so PostgREST cannot infer which
// one to use for an unqualified `clients(...)` embed and returns PGRST201
// ("more than one relationship was found"). The `!projects_client_id_fkey`
// hint selects the simple relationship explicitly for this read-only lookup.
const PROJECT_LIST_COLUMNS =
  "id, organization_id, client_id, name, slug, description, status, priority, start_date, target_date, completed_at, project_manager_id, progress_percent, created_at, updated_at, clients!projects_client_id_fkey(business_name)";

const PROJECT_DETAIL_COLUMNS =
  "id, organization_id, client_id, name, slug, description, status, priority, start_date, target_date, completed_at, project_manager_id, progress_percent, created_at, updated_at, clients!projects_client_id_fkey(business_name), profiles(full_name)";

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

interface ProjectListRow {
  id: string;
  organization_id: string;
  client_id: string;
  name: string;
  slug: string | null;
  description: string | null;
  status: string;
  priority: string;
  start_date: string | null;
  target_date: string | null;
  completed_at: string | null;
  project_manager_id: string | null;
  progress_percent: number;
  created_at: string;
  updated_at: string;
  clients: { business_name: string } | { business_name: string }[] | null;
}

function clientNameFromJoin(
  clients: ProjectListRow["clients"],
): string {
  if (!clients) {
    return "Unknown client";
  }

  const client = Array.isArray(clients) ? clients[0] : clients;
  return client?.business_name ?? "Unknown client";
}

export async function getProjectPage(
  organizationId: string,
  filters: ProjectFilters,
): Promise<ProjectPageData> {
  const supabase = await createClient();
  const from = (filters.page - 1) * PROJECTS_PAGE_SIZE;
  const to = from + PROJECTS_PAGE_SIZE - 1;
  let query = supabase
    .from("projects")
    .select(PROJECT_LIST_COLUMNS, { count: "exact" })
    .eq("organization_id", organizationId);

  const search = safeSearchValue(filters.query);
  if (search) {
    query = query.ilike("name", `%${search}%`);
  }

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  if (filters.clientId) {
    query = query.eq("client_id", filters.clientId);
  }

  if (filters.projectManagerId) {
    query = query.eq("project_manager_id", filters.projectManagerId);
  }

  const { data, count, error } = await query
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (error) {
    logSupabaseError("getProjectPage", error);
    throw new Error("Unable to load projects.");
  }

  const total = count ?? 0;
  const rows = (data ?? []) as unknown as ProjectListRow[];

  return {
    projects: rows.map((project) => ({
      ...project,
      status: project.status as ProjectStatus,
      priority: project.priority as ProjectPriority,
      clientName: clientNameFromJoin(project.clients),
    })) as ProjectListItem[],
    total,
    page: filters.page,
    pageCount: Math.max(1, Math.ceil(total / PROJECTS_PAGE_SIZE)),
  };
}

export interface ClientProjectSummary {
  id: string;
  name: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  updatedAt: string;
}

export async function getClientProjects(
  organizationId: string,
  clientId: string,
): Promise<ClientProjectSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, status, priority, updated_at")
    .eq("organization_id", organizationId)
    .eq("client_id", clientId)
    .order("updated_at", { ascending: false })
    .limit(10);

  if (error) {
    logSupabaseError("getClientProjects", error);
    throw new Error("Unable to load this client's projects.");
  }

  return (data ?? []).map((project) => ({
    id: project.id,
    name: project.name,
    status: project.status as ProjectStatus,
    priority: project.priority as ProjectPriority,
    updatedAt: project.updated_at,
  }));
}

export async function getClientOptions(
  organizationId: string,
): Promise<{ id: string; businessName: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select("id, business_name")
    .eq("organization_id", organizationId)
    .order("business_name", { ascending: true })
    .limit(200);

  if (error) {
    logSupabaseError("getClientOptions", error);
    throw new Error("Unable to load clients.");
  }

  return (data ?? []).map((client) => ({
    id: client.id,
    businessName: client.business_name,
  }));
}

export async function getProjectManagerOptions(): Promise<
  ProjectManagerOption[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .order("full_name", { ascending: true })
    .limit(100);

  if (error) {
    logSupabaseError("getProjectManagerOptions", error);
    throw new Error("Unable to load team members.");
  }

  return (data ?? []).map((profile) => ({
    id: profile.id,
    fullName: profile.full_name,
  }));
}

export async function getProjectDetail(
  organizationId: string,
  projectId: string,
): Promise<ProjectDetail | null> {
  const supabase = await createClient();
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select(PROJECT_DETAIL_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("id", projectId)
    .maybeSingle();

  if (projectError) {
    logSupabaseError("getProjectDetail.project", projectError);
    throw new Error("Unable to load this project.");
  }

  if (!project) {
    return null;
  }

  const [milestonesResult, tasksResult, membersResult] = await Promise.all([
    supabase
      .from("milestones")
      .select(
        "id, project_id, title, description, status, due_date, sort_order, completed_at, created_at, updated_at",
      )
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("tasks")
      .select(
        "id, project_id, milestone_id, title, description, status, priority, assigned_to, due_date, sort_order, completed_at, created_at, updated_at, profiles(full_name), milestones(title)",
      )
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("project_members")
      .select("id, project_id, user_id, role, created_at, profiles(full_name)")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true }),
  ]);

  if (milestonesResult.error) {
    logSupabaseError("getProjectDetail.milestones", milestonesResult.error);
    throw new Error("Unable to load project milestones.");
  }

  if (tasksResult.error) {
    logSupabaseError("getProjectDetail.tasks", tasksResult.error);
    throw new Error("Unable to load project tasks.");
  }

  if (membersResult.error) {
    logSupabaseError("getProjectDetail.members", membersResult.error);
    throw new Error("Unable to load project team members.");
  }

  const milestones = (milestonesResult.data ?? []).map((milestone) => ({
    ...milestone,
    status: milestone.status as MilestoneStatus,
  }));

  interface TaskJoinRow {
    id: string;
    project_id: string;
    milestone_id: string | null;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    assigned_to: string | null;
    due_date: string | null;
    sort_order: number;
    completed_at: string | null;
    created_at: string;
    updated_at: string;
    profiles: { full_name: string } | { full_name: string }[] | null;
    milestones: { title: string } | { title: string }[] | null;
  }

  const taskRows = (tasksResult.data ?? []) as unknown as TaskJoinRow[];
  const tasks = taskRows.map((task) => {
    const assignee = Array.isArray(task.profiles)
      ? task.profiles[0]
      : task.profiles;
    const milestone = Array.isArray(task.milestones)
      ? task.milestones[0]
      : task.milestones;

    return {
      id: task.id,
      project_id: task.project_id,
      milestone_id: task.milestone_id,
      title: task.title,
      description: task.description,
      status: task.status as TaskStatus,
      priority: task.priority as TaskPriority,
      assigned_to: task.assigned_to,
      due_date: task.due_date,
      sort_order: task.sort_order,
      completed_at: task.completed_at,
      created_at: task.created_at,
      updated_at: task.updated_at,
      assigneeName: assignee?.full_name ?? null,
      milestoneTitle: milestone?.title ?? null,
    };
  });

  interface MemberJoinRow {
    id: string;
    project_id: string;
    user_id: string;
    role: string;
    created_at: string;
    profiles: { full_name: string } | { full_name: string }[] | null;
  }

  const memberRows = (membersResult.data ?? []) as unknown as MemberJoinRow[];
  const members = memberRows.map((member) => {
    const profile = Array.isArray(member.profiles)
      ? member.profiles[0]
      : member.profiles;

    return {
      id: member.id,
      project_id: member.project_id,
      user_id: member.user_id,
      role: member.role as ProjectMemberRole,
      created_at: member.created_at,
      fullName: profile?.full_name ?? "Unknown member",
    };
  });

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((task) => task.status === "done").length;
  const percent =
    totalTasks === 0
      ? null
      : Math.round((doneTasks / totalTasks) * 100);

  const projectRow = project as unknown as {
    id: string;
    organization_id: string;
    client_id: string;
    name: string;
    slug: string | null;
    description: string | null;
    status: string;
    priority: string;
    start_date: string | null;
    target_date: string | null;
    completed_at: string | null;
    project_manager_id: string | null;
    progress_percent: number;
    created_at: string;
    updated_at: string;
    clients: { business_name: string } | { business_name: string }[] | null;
    profiles: { full_name: string } | { full_name: string }[] | null;
  };
  const projectManager = Array.isArray(projectRow.profiles)
    ? projectRow.profiles[0]
    : projectRow.profiles;

  return {
    id: projectRow.id,
    organization_id: projectRow.organization_id,
    client_id: projectRow.client_id,
    name: projectRow.name,
    slug: projectRow.slug,
    description: projectRow.description,
    status: projectRow.status as ProjectStatus,
    priority: projectRow.priority as ProjectPriority,
    start_date: projectRow.start_date,
    target_date: projectRow.target_date,
    completed_at: projectRow.completed_at,
    project_manager_id: projectRow.project_manager_id,
    progress_percent: projectRow.progress_percent,
    created_at: projectRow.created_at,
    updated_at: projectRow.updated_at,
    clientName: clientNameFromJoin(projectRow.clients),
    projectManagerName: projectManager?.full_name ?? null,
    milestones,
    tasks,
    members,
    progress: {
      totalTasks,
      doneTasks,
      percent,
    },
  };
}
