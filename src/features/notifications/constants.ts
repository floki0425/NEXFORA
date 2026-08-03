export const NOTIFICATION_EVENT_TYPES = [
  "lead.created",
  "lead.status_changed",
  "lead.won",
  "lead.lost",
  "lead.converted",
  "lead.follow_up_due",
  "client.created",
  "client.archived",
  "client.restored",
  "client_invitation.issued",
  "client_invitation.revoked",
  "client_invitation.accepted",
  "proposal.sent",
  "proposal.viewed",
  "proposal.accepted",
  "proposal.declined",
  "proposal.changes_requested",
  "proposal.access_token_reissued",
  "invoice.sent",
  "invoice.voided",
  "invoice.marked_overdue",
  "invoice.reminder_due",
  "payment.recorded",
  "payment.verified",
  "payment.failed",
  "project.created",
  "project.status_changed",
  "project.completed",
  "project_member.added",
  "project_member.removed",
  "milestone.completed",
  "file.uploaded_internal",
  "file.uploaded_client",
  "revision.created",
  "revision.status_changed",
  "revision.ready_for_review",
  "revision.assigned",
  "ticket.created",
  "ticket.assigned",
  "ticket.status_changed",
  "ticket.reopened",
  "subscription.created",
  "subscription.cancelled",
  "subscription.reactivated",
  "subscription.usage_recorded",
  "subscription.renewal_due",
  "role.changed",
] as const;

// Kept in exact sync with the `audit_logs.action` / `notifications.event_type`
// check constraints in supabase/migrations/20260806000000_phase_11_notifications_audit.sql.
// tests/phase11/unit/event-types.test.mjs asserts this both directions.
export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

export const NOTIFICATION_EVENT_LABELS: Record<NotificationEventType, string> =
  {
    "lead.created": "New lead received",
    "lead.status_changed": "Lead status updated",
    "lead.won": "Lead won",
    "lead.lost": "Lead lost",
    "lead.converted": "Lead converted to client",
    "lead.follow_up_due": "Lead needs follow-up",
    "client.created": "New client created",
    "client.archived": "Client archived",
    "client.restored": "Client restored",
    "client_invitation.issued": "Client invitation sent",
    "client_invitation.revoked": "Client invitation revoked",
    "client_invitation.accepted": "Client invitation accepted",
    "proposal.sent": "Proposal sent",
    "proposal.viewed": "Proposal viewed",
    "proposal.accepted": "Proposal accepted",
    "proposal.declined": "Proposal declined",
    "proposal.changes_requested": "Proposal changes requested",
    "proposal.access_token_reissued": "Proposal link reissued",
    "invoice.sent": "Invoice sent",
    "invoice.voided": "Invoice voided",
    "invoice.marked_overdue": "Invoice overdue",
    "invoice.reminder_due": "Invoice reminder",
    "payment.recorded": "Payment recorded",
    "payment.verified": "Payment verified",
    "payment.failed": "Payment failed",
    "project.created": "New project created",
    "project.status_changed": "Project status updated",
    "project.completed": "Project completed",
    "project_member.added": "Project member added",
    "project_member.removed": "Project member removed",
    "milestone.completed": "Milestone completed",
    "file.uploaded_internal": "Internal file uploaded",
    "file.uploaded_client": "Client file uploaded",
    "revision.created": "Revision submitted",
    "revision.status_changed": "Revision status updated",
    "revision.ready_for_review": "Revision ready for review",
    "revision.assigned": "Revision assigned",
    "ticket.created": "New support ticket",
    "ticket.assigned": "Ticket assigned",
    "ticket.status_changed": "Ticket status updated",
    "ticket.reopened": "Ticket reopened",
    "subscription.created": "Subscription created",
    "subscription.cancelled": "Subscription cancelled",
    "subscription.reactivated": "Subscription reactivated",
    "subscription.usage_recorded": "Subscription usage recorded",
    "subscription.renewal_due": "Subscription renewal due",
    "role.changed": "Role changed",
  };

// Only entity types with a real admin detail page are clickable; the rest
// (milestone, project_member, client_invitation, payment, subscription_usage,
// project_file) render as non-navigable list items.
export const NOTIFICATION_ENTITY_ROUTES: Partial<
  Record<string, (entityId: string) => string>
> = {
  lead: (id) => `/admin/leads/${id}`,
  client: (id) => `/admin/clients/${id}`,
  project: (id) => `/admin/projects/${id}`,
  proposal: (id) => `/admin/proposals/${id}`,
  invoice: (id) => `/admin/invoices/${id}`,
  revision: (id) => `/admin/revisions/${id}`,
  support_ticket: (id) => `/admin/support/${id}`,
  subscription: (id) => `/admin/subscriptions/${id}`,
};

export const NOTIFICATIONS_PAGE_SIZE = 20;
export const NOTIFICATIONS_BELL_PREVIEW_SIZE = 10;

// Server-side hard maximum enforced independently by list_my_notifications
// itself (`least(coalesce(p_limit, 20), 50)`); this constant only bounds
// what the application ever requests.
export const NOTIFICATIONS_MAX_LIMIT = 50;
