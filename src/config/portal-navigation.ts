import { FolderKanban, LayoutDashboard, type LucideIcon } from "lucide-react";

export interface PortalNavigationItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

// Only active Phase 7 functionality is listed — Files, Revisions, Invoices,
// and Support belong to later phases and must not appear as dead links.
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
