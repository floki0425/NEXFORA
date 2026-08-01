import type {
  SupportTicketPriority,
  SupportTicketStatus,
} from "@/features/support/constants";

export interface PortalSupportTicket {
  id: string;
  ticketNumber: string;
  title: string;
  description: string;
  category: string | null;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  projectId: string | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PortalSupportActivity {
  activityType: string;
  title: string;
  description: string | null;
  createdAt: string;
}

export interface PortalSupportTicketDetail extends PortalSupportTicket {
  activities: PortalSupportActivity[];
}

export interface PortalSupportActionResult {
  ok: boolean;
  message: string;
  ticketId?: string;
  fieldErrors?: Record<string, string[]>;
}
