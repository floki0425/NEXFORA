import {
  FolderKanban,
  LayoutDashboard,
  Receipt,
  type LucideIcon,
} from "lucide-react";

export interface PortalNavigationItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

// Files and Revisions (Phase 8) are accessed from within a project's detail
// page, not as top-level nav destinations, so they are deliberately absent
// here. Support (a later phase) remains out of scope and must not appear as
// a dead link. Invoices (Phase 9) span multiple projects (or none), so it
// gets its own top-level entry like Projects.
export const PORTAL_NAVIGATION: readonly PortalNavigationItem[] = [
  {
    label: "Dashboard",
    href: "/portal",
    icon: LayoutDashboard,
  },
  {
    label: "Projects",
    href: "/portal/projects",
    icon: FolderKanban,
  },
  {
    label: "Invoices",
    href: "/portal/invoices",
    icon: Receipt,
  },
];

export function isPortalNavigationItemActive(
  pathname: string,
  href: string,
): boolean {
  if (href === "/portal") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
