import type {
  MilestoneStatus,
  ProjectPriority,
  ProjectStatus,
} from "@/features/projects/constants";

export interface PortalProjectListItem {
  id: string;
  name: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  progressPercent: number;
  startDate: string | null;
  targetDate: string | null;
  updatedAt: string;
}

export interface PortalMilestone {
  id: string;
  title: string;
  description: string | null;
  status: MilestoneStatus;
  dueDate: string | null;
  sortOrder: number;
}

export interface PortalProjectDetail extends PortalProjectListItem {
  description: string | null;
  milestones: PortalMilestone[];
}
