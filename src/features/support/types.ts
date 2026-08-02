import type {
  SupportTicketPriority,
  SupportTicketStatus,
} from "./constants";

export interface SupportTicketListItem {
  id: string;
  ticketNumber: string;
  title: string;
  category: string | null;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  assignedTo: string | null;
  assigneeName: string | null;
  clientName: string;
  projectName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupportTicketActivity {
  activityType: string;
  title: string;
  description: string | null;
  actorName: string | null;
  createdAt: string;
}

export interface SupportTicketDetail extends SupportTicketListItem {
  organizationId: string;
  clientId: string;
  projectId: string | null;
  description: string;
  resolutionNote: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  creatorName: string | null;
  activities: SupportTicketActivity[];
}

export interface SupportTicketFilters {
  query: string;
  status: SupportTicketStatus | "";
  priority: SupportTicketPriority | "";
  assignedTo: string;
  page: number;
}

export interface SupportTicketPageData {
  tickets: SupportTicketListItem[];
  total: number;
  page: number;
  pageCount: number;
}

export interface SupportActionResult {
  ok: boolean;
  message: string;
  ticketId?: string;
  fieldErrors?: Record<string, string[]>;
}

export interface SupportClientOption {
  id: string;
  label: string;
}

export interface SupportProjectOption {
  id: string;
  label: string;
  clientId: string;
}
