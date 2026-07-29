import type { BadgeVariant } from "@/components/ui/badge";

export const PROJECT_MANAGER_ROLES = ["super_admin", "admin"] as const;

export const PROJECT_STATUSES = [
  "planning",
  "design",
  "development",
  "integration",
  "testing",
  "client_review",
  "deployment",
  "completed",
  "on_hold",
  "cancelled",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

export type ProjectPriority = (typeof PROJECT_PRIORITIES)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  planning: "Planning",
  design: "Design",
  development: "Development",
  integration: "Integration",
  testing: "Testing",
  client_review: "Client review",
  deployment: "Deployment",
  completed: "Completed",
  on_hold: "On hold",
  cancelled: "Cancelled",
};

export const PROJECT_STATUS_BADGES: Record<ProjectStatus, BadgeVariant> = {
  planning: "neutral",
  design: "info",
  development: "info",
  integration: "info",
  testing: "warning",
  client_review: "warning",
  deployment: "accent",
  completed: "success",
  on_hold: "warning",
  cancelled: "error",
};

export const PROJECT_PRIORITY_LABELS: Record<ProjectPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export const PROJECT_PRIORITY_BADGES: Record<ProjectPriority, BadgeVariant> = {
  low: "neutral",
  medium: "info",
  high: "warning",
  urgent: "error",
};

export const PROJECTS_PAGE_SIZE = 20;

export const MILESTONE_STATUSES = [
  "pending",
  "in_progress",
  "completed",
  "blocked",
] as const;

export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export const MILESTONE_STATUS_LABELS: Record<MilestoneStatus, string> = {
  pending: "Pending",
  in_progress: "In progress",
  completed: "Completed",
  blocked: "Blocked",
};

export const MILESTONE_STATUS_BADGES: Record<MilestoneStatus, BadgeVariant> = {
  pending: "neutral",
  in_progress: "info",
  completed: "success",
  blocked: "error",
};

export const TASK_STATUSES = [
  "todo",
  "in_progress",
  "blocked",
  "review",
  "done",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  review: "Review",
  done: "Done",
};

export const TASK_STATUS_BADGES: Record<TaskStatus, BadgeVariant> = {
  todo: "neutral",
  in_progress: "info",
  blocked: "error",
  review: "warning",
  done: "success",
};

export const TASK_PRIORITIES = PROJECT_PRIORITIES;
export type TaskPriority = ProjectPriority;
export const TASK_PRIORITY_LABELS = PROJECT_PRIORITY_LABELS;
export const TASK_PRIORITY_BADGES = PROJECT_PRIORITY_BADGES;

export const PROJECT_MEMBER_ROLES = [
  "project_manager",
  "developer",
  "designer",
  "qa",
  "content",
  "member",
] as const;

export type ProjectMemberRole = (typeof PROJECT_MEMBER_ROLES)[number];

export const PROJECT_MEMBER_ROLE_LABELS: Record<ProjectMemberRole, string> = {
  project_manager: "Project manager",
  developer: "Developer",
  designer: "Designer",
  qa: "QA",
  content: "Content",
  member: "Member",
};
