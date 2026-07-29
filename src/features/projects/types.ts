import type { InternalRole } from "@/lib/auth/types";
import type { Database } from "@/types/database";

import type {
  MilestoneStatus,
  ProjectMemberRole,
  ProjectPriority,
  ProjectStatus,
  TaskPriority,
  TaskStatus,
} from "./constants";

export type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
export type ProjectInsert =
  Database["public"]["Tables"]["projects"]["Insert"];
export type ProjectUpdate =
  Database["public"]["Tables"]["projects"]["Update"];

export type ProjectMemberRow =
  Database["public"]["Tables"]["project_members"]["Row"];
export type MilestoneRow = Database["public"]["Tables"]["milestones"]["Row"];
export type MilestoneInsert =
  Database["public"]["Tables"]["milestones"]["Insert"];
export type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
export type TaskInsert = Database["public"]["Tables"]["tasks"]["Insert"];

export interface ProjectListItem extends Omit<ProjectRow, "status" | "priority"> {
  status: ProjectStatus;
  priority: ProjectPriority;
  clientName: string;
}

export interface ProjectManagerOption {
  id: string;
  fullName: string;
}

export interface MilestoneItem extends Omit<MilestoneRow, "status"> {
  status: MilestoneStatus;
}

export interface TaskItem extends Omit<TaskRow, "status" | "priority"> {
  status: TaskStatus;
  priority: TaskPriority;
  assigneeName: string | null;
  milestoneTitle: string | null;
}

export interface ProjectMemberItem extends Omit<ProjectMemberRow, "role"> {
  role: ProjectMemberRole;
  fullName: string;
}

export interface ProjectProgress {
  totalTasks: number;
  doneTasks: number;
  percent: number | null;
}

export interface ProjectDetail
  extends Omit<ProjectRow, "status" | "priority"> {
  status: ProjectStatus;
  priority: ProjectPriority;
  clientName: string;
  projectManagerName: string | null;
  milestones: MilestoneItem[];
  tasks: TaskItem[];
  members: ProjectMemberItem[];
  progress: ProjectProgress;
}

export interface ProjectFilters {
  query: string;
  status: ProjectStatus | "";
  clientId: string;
  projectManagerId: string;
  page: number;
}

export interface ProjectPageData {
  projects: ProjectListItem[];
  total: number;
  page: number;
  pageCount: number;
}

export interface ProjectAccessContext {
  organizationId: string;
  profileId: string;
  role: InternalRole;
  status: "active" | "inactive";
}

export interface ProjectActionResult {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string[]>;
  projectId?: string;
}
