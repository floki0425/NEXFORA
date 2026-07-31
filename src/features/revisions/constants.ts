import type { BadgeVariant } from "@/components/ui/badge";

export const REVISION_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

export type RevisionPriority = (typeof REVISION_PRIORITIES)[number];

export const REVISION_PRIORITY_LABELS: Record<RevisionPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export const REVISION_PRIORITY_BADGES: Record<RevisionPriority, BadgeVariant> = {
  low: "neutral",
  medium: "info",
  high: "warning",
  urgent: "error",
};

export const REVISION_STATUSES = [
  "submitted",
  "reviewing",
  "in_progress",
  "ready_for_review",
  "approved",
  "rejected",
  "closed",
] as const;

export type RevisionStatus = (typeof REVISION_STATUSES)[number];

export const REVISION_STATUS_LABELS: Record<RevisionStatus, string> = {
  submitted: "Submitted",
  reviewing: "Reviewing",
  in_progress: "In progress",
  ready_for_review: "Ready for review",
  approved: "Approved",
  rejected: "Changes requested",
  closed: "Closed",
};

export const REVISION_STATUS_BADGES: Record<RevisionStatus, BadgeVariant> = {
  submitted: "neutral",
  reviewing: "info",
  in_progress: "info",
  ready_for_review: "warning",
  approved: "success",
  rejected: "error",
  closed: "neutral",
};

// Internal-only forward transitions, matching
// public.transition_revision_status() in the Phase 8 migration exactly.
// ready_for_review -> approved/rejected are deliberately absent — those are
// client-only actions (approve_revision / request_revision_changes).
export const REVISION_NEXT_INTERNAL_TRANSITION: Record<
  RevisionStatus,
  { status: RevisionStatus; label: string } | null
> = {
  submitted: { status: "reviewing", label: "Start reviewing" },
  reviewing: { status: "in_progress", label: "Start work" },
  in_progress: { status: "ready_for_review", label: "Mark ready for review" },
  ready_for_review: null,
  approved: { status: "closed", label: "Close revision" },
  rejected: { status: "in_progress", label: "Resume work" },
  closed: null,
};

export const REVISIONS_PAGE_SIZE = 20;
