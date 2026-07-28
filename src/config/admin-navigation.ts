import {
  BriefcaseBusiness,
  FolderKanban,
  LayoutDashboard,
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
