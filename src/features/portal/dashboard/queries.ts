import "server-only";

import type { ProjectStatus } from "@/features/projects/constants";
import { getPortalProjects } from "@/features/portal/projects/queries";
import type { PortalProjectListItem } from "@/features/portal/projects/types";

export interface PortalDashboardData {
  activeProjects: PortalProjectListItem[];
  totalProjects: number;
}

// "Active" for dashboard purposes means not yet completed/cancelled/on hold
// — mirrors the internal admin dashboard's notion of an in-flight project
// without inventing a new status value.
const ACTIVE_PROJECT_STATUSES = new Set<ProjectStatus>([
  "planning",
  "design",
  "development",
  "integration",
  "testing",
  "client_review",
  "deployment",
]);

export async function getPortalDashboardData(): Promise<PortalDashboardData> {
  const projects = await getPortalProjects();
  const activeProjects = projects.filter((project) =>
    ACTIVE_PROJECT_STATUSES.has(project.status),
  );

  return { activeProjects, totalProjects: projects.length };
}
