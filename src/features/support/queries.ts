import "server-only";

import { createClient } from "@/lib/supabase/server";

import {
  SUPPORT_TICKETS_PAGE_SIZE,
  type SupportTicketPriority,
  type SupportTicketStatus,
} from "./constants";
import type {
  SupportClientOption,
  SupportProjectOption,
  SupportTicketActivity,
  SupportTicketDetail,
  SupportTicketFilters,
  SupportTicketPageData,
} from "./types";
import { asSupportSupabaseClient } from "./supabase";

const SUPPORT_TICKET_LIST_COLUMNS =
  "id, ticket_number, title, category, priority, status, assigned_to, created_at, updated_at, clients!support_tickets_client_id_fkey(business_name), projects!support_tickets_project_id_fkey(name), assignee:profiles!support_tickets_assigned_to_fkey(full_name)";

const SUPPORT_TICKET_DETAIL_COLUMNS =
  "id, organization_id, client_id, project_id, ticket_number, title, description, category, priority, status, assigned_to, resolution_note, resolved_at, closed_at, created_at, updated_at, clients!support_tickets_client_id_fkey(business_name), projects!support_tickets_project_id_fkey(name), assignee:profiles!support_tickets_assigned_to_fkey(full_name), creator:profiles!support_tickets_created_by_fkey(full_name)";

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

function safeSearchValue(value: string): string {
  return value.replace(/[%_,().]/g, " ").replace(/\s+/g, " ").trim();
}

function one<T>(value: T | T[] | null): T | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

interface SupportTicketListRow {
  id: string;
  ticket_number: string;
  title: string;
  category: string | null;
  priority: string;
  status: string;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  clients: { business_name: string } | { business_name: string }[] | null;
  projects: { name: string } | { name: string }[] | null;
  assignee: { full_name: string } | { full_name: string }[] | null;
}

function mapSupportTicketListRow(row: SupportTicketListRow) {
  return {
    id: row.id,
    ticketNumber: row.ticket_number,
    title: row.title,
    category: row.category,
    priority: row.priority as SupportTicketPriority,
    status: row.status as SupportTicketStatus,
    assignedTo: row.assigned_to,
    assigneeName: one(row.assignee)?.full_name ?? null,
    clientName: one(row.clients)?.business_name ?? "Unknown client",
    projectName: one(row.projects)?.name ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getSupportTicketPage(
  organizationId: string,
  filters: SupportTicketFilters,
): Promise<SupportTicketPageData> {
  const supabase = asSupportSupabaseClient(await createClient());
  const from = (filters.page - 1) * SUPPORT_TICKETS_PAGE_SIZE;
  const to = from + SUPPORT_TICKETS_PAGE_SIZE - 1;
  let query = supabase
    .from("support_tickets")
    .select(SUPPORT_TICKET_LIST_COLUMNS, { count: "exact" })
    .eq("organization_id", organizationId);

  const search = safeSearchValue(filters.query);
  if (search) {
    query = query.or(
      `ticket_number.ilike.%${search}%,title.ilike.%${search}%`,
    );
  }

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  if (filters.priority) {
    query = query.eq("priority", filters.priority);
  }

  if (filters.assignedTo) {
    query = query.eq("assigned_to", filters.assignedTo);
  }

  const { data, count, error } = await query
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (error) {
    logSupabaseError("getSupportTicketPage", error);
    throw new Error("Unable to load support tickets.");
  }

  const total = count ?? 0;
  const rows = (data ?? []) as unknown as SupportTicketListRow[];

  return {
    tickets: rows.map(mapSupportTicketListRow),
    total,
    page: filters.page,
    pageCount: Math.max(1, Math.ceil(total / SUPPORT_TICKETS_PAGE_SIZE)),
  };
}

interface SupportTicketDetailRow extends SupportTicketListRow {
  organization_id: string;
  client_id: string;
  project_id: string | null;
  description: string;
  resolution_note: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  creator: { full_name: string } | { full_name: string }[] | null;
}

interface SupportTicketActivityRow {
  activity_type: string;
  title: string;
  description: string | null;
  created_at: string;
  actor: { full_name: string } | { full_name: string }[] | null;
}

export async function getSupportTicketDetail(
  organizationId: string,
  ticketId: string,
): Promise<SupportTicketDetail | null> {
  const supabase = asSupportSupabaseClient(await createClient());
  const { data: ticket, error } = await supabase
    .from("support_tickets")
    .select(SUPPORT_TICKET_DETAIL_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("id", ticketId)
    .maybeSingle();

  if (error) {
    logSupabaseError("getSupportTicketDetail.ticket", error);
    throw new Error("Unable to load this support ticket.");
  }

  if (!ticket) {
    return null;
  }

  const { data: activityRows, error: activityError } = await supabase
    .from("ticket_activities")
    .select(
      "activity_type, title, description, created_at, actor:profiles!ticket_activities_created_by_fkey(full_name)",
    )
    .eq("organization_id", organizationId)
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(200);

  if (activityError) {
    logSupabaseError("getSupportTicketDetail.activities", activityError);
    throw new Error("Unable to load this support ticket's activity.");
  }

  const row = ticket as unknown as SupportTicketDetailRow;
  const activities: SupportTicketActivity[] = (
    (activityRows ?? []) as unknown as SupportTicketActivityRow[]
  )
    .map((activity) => ({
      activityType: activity.activity_type,
      title: activity.title,
      description: activity.description,
      actorName: one(activity.actor)?.full_name ?? null,
      createdAt: activity.created_at,
    }))
    .reverse();

  return {
    ...mapSupportTicketListRow(row),
    organizationId: row.organization_id,
    clientId: row.client_id,
    projectId: row.project_id,
    description: row.description,
    resolutionNote: row.resolution_note,
    resolvedAt: row.resolved_at,
    closedAt: row.closed_at,
    creatorName: one(row.creator)?.full_name ?? null,
    activities,
  };
}

export async function getSupportClientOptions(
  organizationId: string,
): Promise<SupportClientOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select("id, business_name")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .order("business_name", { ascending: true })
    .limit(200);

  if (error) {
    logSupabaseError("getSupportClientOptions", error);
    throw new Error("Unable to load clients.");
  }

  return (data ?? []).map((client) => ({
    id: client.id,
    label: client.business_name,
  }));
}

export async function getSupportProjectOptions(
  organizationId: string,
): Promise<SupportProjectOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, client_id")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true })
    .limit(500);

  if (error) {
    logSupabaseError("getSupportProjectOptions", error);
    throw new Error("Unable to load projects.");
  }

  return (data ?? []).map((project) => ({
    id: project.id,
    label: project.name,
    clientId: project.client_id,
  }));
}

export async function getSupportAssigneeOptions(
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
    logSupabaseError("getSupportAssigneeOptions", error);
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

export async function hasSupportProjectAccess(
  organizationId: string,
  projectId: string | null,
  profileId: string,
): Promise<boolean> {
  if (!projectId) {
    return false;
  }

  const supabase = await createClient();
  const [{ data: project, error: projectError }, { data: membership, error: membershipError }] =
    await Promise.all([
      supabase
        .from("projects")
        .select("id, project_manager_id")
        .eq("organization_id", organizationId)
        .eq("id", projectId)
        .maybeSingle(),
      supabase
        .from("project_members")
        .select("id")
        .eq("project_id", projectId)
        .eq("user_id", profileId)
        .maybeSingle(),
    ]);

  if (projectError || membershipError || !project) {
    return false;
  }

  return project.project_manager_id === profileId || Boolean(membership);
}
