import "server-only";

import type {
  SupportTicketPriority,
  SupportTicketStatus,
} from "@/features/support/constants";
import { createClient } from "@/lib/supabase/server";

import type {
  PortalSupportActivity,
  PortalSupportTicket,
  PortalSupportTicketDetail,
} from "./types";
import { portalSupportTicketIdSchema } from "./schemas";

interface ClientSupportTicketRow {
  id: string;
  ticket_number: string;
  title: string;
  description: string;
  category: string | null;
  priority: string;
  status: string;
  project_id: string | null;
  resolution_note: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ClientSupportActivityRow {
  activity_type: string;
  title: string;
  description: string | null;
  created_at: string;
}

interface PortalSupportReadRpcClient {
  rpc: {
    (
      name: "get_client_support_tickets",
    ): Promise<{ data: ClientSupportTicketRow[] | null; error: unknown | null }>;
    (
      name: "get_client_support_ticket",
      args: { target_ticket_id: string },
    ): Promise<{ data: ClientSupportTicketRow[] | null; error: unknown | null }>;
    (
      name: "get_client_ticket_activities",
      args: { target_ticket_id: string },
    ): Promise<{ data: ClientSupportActivityRow[] | null; error: unknown | null }>;
  };
}

function mapTicket(row: ClientSupportTicketRow): PortalSupportTicket {
  return {
    id: row.id,
    ticketNumber: row.ticket_number,
    title: row.title,
    description: row.description,
    category: row.category,
    priority: row.priority as SupportTicketPriority,
    status: row.status as SupportTicketStatus,
    projectId: row.project_id,
    resolutionNote: row.resolution_note,
    resolvedAt: row.resolved_at,
    closedAt: row.closed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getPortalSupportTickets(): Promise<
  PortalSupportTicket[]
> {
  const supabase = await createClient();
  const supportRpc = supabase as unknown as PortalSupportReadRpcClient;
  const { data, error } = await supportRpc.rpc("get_client_support_tickets");

  if (error) {
    throw new Error("Unable to load your support tickets.");
  }

  return (data ?? []).map(mapTicket);
}

export async function getPortalSupportTicket(
  ticketId: string,
): Promise<PortalSupportTicketDetail | null> {
  const ticket = await getPortalSupportTicketSummary(ticketId);
  if (!ticket) {
    return null;
  }

  const supabase = await createClient();
  const supportRpc = supabase as unknown as PortalSupportReadRpcClient;
  const { data, error } = await supportRpc.rpc(
    "get_client_ticket_activities",
    { target_ticket_id: ticketId },
  );

  if (error) {
    throw new Error("Unable to load this support ticket's activity.");
  }

  const activities: PortalSupportActivity[] = (data ?? []).map((activity) => ({
    activityType: activity.activity_type,
    title: activity.title,
    description: activity.description,
    createdAt: activity.created_at,
  }));

  return { ...ticket, activities };
}

export async function getPortalSupportTicketSummary(
  ticketId: string,
): Promise<PortalSupportTicket | null> {
  const idResult = portalSupportTicketIdSchema.safeParse(ticketId);
  if (!idResult.success) {
    return null;
  }

  const supabase = await createClient();
  const supportRpc = supabase as unknown as PortalSupportReadRpcClient;
  const { data, error } = await supportRpc.rpc("get_client_support_ticket", {
    target_ticket_id: idResult.data,
  });

  if (error) {
    throw new Error("Unable to load this support ticket.");
  }

  return data?.[0] ? mapTicket(data[0]) : null;
}
