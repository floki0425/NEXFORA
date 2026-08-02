import type { BadgeVariant } from "@/components/ui/badge";

export const SUPPORT_TICKET_PRIORITIES = [
  "low",
  "medium",
  "high",
  "urgent",
] as const;

export type SupportTicketPriority =
  (typeof SUPPORT_TICKET_PRIORITIES)[number];

export const SUPPORT_TICKET_PRIORITY_LABELS: Record<
  SupportTicketPriority,
  string
> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export const SUPPORT_TICKET_PRIORITY_BADGES: Record<
  SupportTicketPriority,
  BadgeVariant
> = {
  low: "neutral",
  medium: "info",
  high: "warning",
  urgent: "error",
};

export const SUPPORT_TICKET_STATUSES = [
  "open",
  "assigned",
  "in_progress",
  "waiting_for_client",
  "resolved",
  "closed",
] as const;

export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];

export const SUPPORT_TICKET_STATUS_LABELS: Record<
  SupportTicketStatus,
  string
> = {
  open: "Open",
  assigned: "Assigned",
  in_progress: "In progress",
  waiting_for_client: "Waiting for you",
  resolved: "Resolved",
  closed: "Closed",
};

export const SUPPORT_TICKET_ADMIN_STATUS_LABELS: Record<
  SupportTicketStatus,
  string
> = {
  ...SUPPORT_TICKET_STATUS_LABELS,
  waiting_for_client: "Waiting for client",
};

export const SUPPORT_TICKET_STATUS_BADGES: Record<
  SupportTicketStatus,
  BadgeVariant
> = {
  open: "warning",
  assigned: "info",
  in_progress: "info",
  waiting_for_client: "warning",
  resolved: "success",
  closed: "neutral",
};

export const SUPPORT_INTERNAL_TRANSITIONS: Record<
  SupportTicketStatus,
  readonly SupportTicketStatus[]
> = {
  open: ["assigned"],
  assigned: ["in_progress"],
  in_progress: ["waiting_for_client", "resolved"],
  waiting_for_client: ["in_progress", "resolved"],
  resolved: [],
  closed: [],
};

export const SUPPORT_TRANSITION_LABELS: Partial<
  Record<SupportTicketStatus, string>
> = {
  assigned: "Mark assigned",
  in_progress: "Start work",
  waiting_for_client: "Wait for client",
  resolved: "Resolve ticket",
};

export const SUPPORT_TICKETS_PAGE_SIZE = 20;
