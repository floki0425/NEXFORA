import type { InternalRole } from "@/lib/auth/types";

export const DASHBOARD_SUMMARIES = [
  "leads",
  "proposals",
  "revenue",
  "delivery",
] as const;

export type DashboardSummary = (typeof DASHBOARD_SUMMARIES)[number];

/**
 * Which dashboard summaries a role may receive.
 *
 * Kept free of `server-only` so it stays unit-testable, and used by
 * dashboard.ts to decide which report RPCs to call at all -- a role that may
 * not see a figure never triggers the query that produces it.
 */
export function dashboardSummariesForRole(
  role: InternalRole,
): readonly DashboardSummary[] {
  if (role === "super_admin" || role === "admin") {
    return DASHBOARD_SUMMARIES;
  }

  if (role === "project_manager") {
    // Scoped by the RPC to projects they are assigned to manage.
    return ["delivery"];
  }

  // team_member receives no restricted report data.
  return [];
}
