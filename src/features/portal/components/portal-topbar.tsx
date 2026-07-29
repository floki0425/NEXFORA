"use client";

import { LogOut, Menu } from "lucide-react";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  isPortalNavigationItemActive,
  PORTAL_NAVIGATION,
} from "@/config/portal-navigation";
import { portalLogout } from "@/features/portal/auth/actions";

interface PortalTopbarProps {
  fullName: string;
  isNavigationOpen: boolean;
  onOpenNavigation: () => void;
}

export function PortalTopbar({
  fullName,
  isNavigationOpen,
  onOpenNavigation,
}: PortalTopbarProps) {
  const pathname = usePathname();
  const currentPage =
    PORTAL_NAVIGATION.find((item) =>
      isPortalNavigationItemActive(pathname, item.href),
    )?.label ?? "Portal";

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-white/95 backdrop-blur">
      <div className="flex min-h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenNavigation}
            aria-label="Open navigation"
            aria-controls="portal-mobile-navigation"
            aria-expanded={isNavigationOpen}
            className="-ml-2 lg:hidden"
          >
            <Menu className="size-5" aria-hidden="true" />
          </Button>
          <div className="min-w-0">
            <p className="text-xs font-medium text-text-muted">
              Nexfora Client Portal
            </p>
            <p className="truncate text-sm font-semibold text-foreground">
              {currentPage}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden max-w-40 truncate text-sm font-medium text-text-secondary sm:block">
            {fullName}
          </span>
          <form action={portalLogout}>
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="gap-2 text-text-secondary hover:text-foreground"
            >
              <LogOut className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Log out</span>
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
