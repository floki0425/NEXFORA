import {
  FolderKanban,
  LayoutDashboard,
  LifeBuoy,
  Receipt,
  Repeat2,
  type LucideIcon,
} from "lucide-react";

export interface PortalNavigationItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

// Files and Revisions (Phase 8) are accessed from within a project's detail
// page, not as top-level nav destinations. Invoices, Support, and
// Subscriptions span multiple projects (or none), so each is a top-level
// portal destination.
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
  {
    label: "Support",
    href: "/portal/support",
    icon: LifeBuoy,
  },
  {
    label: "Subscriptions",
    href: "/portal/subscriptions",
    icon: Repeat2,
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
