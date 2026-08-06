import {
  BarChart3,
  Bell,
  BriefcaseBusiness,
  FileText,
  FolderKanban,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  Receipt,
  Repeat2,
  Settings,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import type { InternalRole } from "@/lib/auth/types";

export interface AdminNavigationItem {
  label: string;
  href: string;
  icon: LucideIcon;
  visibleTo?: readonly InternalRole[];
}

export const SETTINGS_ROLES = [
  "super_admin",
  "admin",
] as const satisfies readonly InternalRole[];

export const SUBSCRIPTION_ROLES = [
  "super_admin",
  "admin",
  "project_manager",
] as const satisfies readonly InternalRole[];

export const REPORT_IDS = [
  "lead_conversion",
  "lead_source",
  "proposal_win_rate",
  "revenue",
  "project_delivery",
] as const;

export type ReportId = (typeof REPORT_IDS)[number];

/**
 * Per-report role access, mirroring the role check inside each report RPC
 * (supabase/migrations/20260807000000_phase_12a_reporting.sql). The database
 * check is the boundary; this drives navigation and the route gate.
 *
 * It lives in config/ rather than features/ so both src/lib/auth (which must
 * never import from src/features) and the reports feature can share one
 * definition instead of keeping two that can drift.
 */
export const REPORT_ROLE_ACCESS: Record<ReportId, readonly InternalRole[]> = {
  lead_conversion: ["super_admin", "admin"],
  lead_source: ["super_admin", "admin"],
  proposal_win_rate: ["super_admin", "admin"],
  revenue: ["super_admin", "admin"],
  project_delivery: ["super_admin", "admin", "project_manager"],
};

/** Roles that may open the reports index at all. */
export const REPORT_INDEX_ROLES = [
  "super_admin",
  "admin",
  "project_manager",
] as const satisfies readonly InternalRole[];

export function canViewReport(role: InternalRole, reportId: ReportId): boolean {
  return REPORT_ROLE_ACCESS[reportId].includes(role);
}

export function visibleReportsForRole(role: InternalRole): readonly ReportId[] {
  return REPORT_IDS.filter((reportId) => canViewReport(role, reportId));
}

export function canViewAnyReport(role: InternalRole): boolean {
  return visibleReportsForRole(role).length > 0;
}

export const INTERNAL_ROLE_LABELS: Record<InternalRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  project_manager: "Project Manager",
  team_member: "Team Member",
};

export const ADMIN_NAVIGATION: readonly AdminNavigationItem[] = [
  {
    label: "Dashboard",
    href: "/admin",
    icon: LayoutDashboard,
  },
  {
    label: "Leads",
    href: "/admin/leads",
    icon: UsersRound,
  },
  {
    label: "Clients",
    href: "/admin/clients",
    icon: BriefcaseBusiness,
  },
  {
    label: "Projects",
    href: "/admin/projects",
    icon: FolderKanban,
  },
  {
    label: "Proposals",
    href: "/admin/proposals",
    icon: FileText,
  },
  {
    label: "Invoices",
    href: "/admin/invoices",
    icon: Receipt,
  },
  {
    label: "Revisions",
    href: "/admin/revisions",
    icon: ListChecks,
  },
  {
    label: "Support",
    href: "/admin/support",
    icon: LifeBuoy,
  },
  {
    label: "Subscriptions",
    href: "/admin/subscriptions",
    icon: Repeat2,
    visibleTo: SUBSCRIPTION_ROLES,
  },
  {
    label: "Reports",
    href: "/admin/reports",
    icon: BarChart3,
    visibleTo: REPORT_INDEX_ROLES,
  },
  {
    label: "Notifications",
    href: "/admin/notifications",
    icon: Bell,
  },
  {
    label: "Settings",
    href: "/admin/settings",
    icon: Settings,
    visibleTo: SETTINGS_ROLES,
  },
];

export function getAdminNavigationForRole(
  role: InternalRole,
): readonly AdminNavigationItem[] {
  return ADMIN_NAVIGATION.filter(
    (item) => !item.visibleTo || item.visibleTo.includes(role),
  );
}

export function isAdminNavigationItemActive(
  pathname: string,
  href: string,
): boolean {
  if (href === "/admin") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
