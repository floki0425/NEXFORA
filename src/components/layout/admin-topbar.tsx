"use client";

import { ChevronDown, LogOut, Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { useDismissablePopover } from "@/components/ui/use-dismissable-popover";
import {
  getAdminNavigationForRole,
  INTERNAL_ROLE_LABELS,
  isAdminNavigationItemActive,
} from "@/config/admin-navigation";
import { logout } from "@/features/auth/actions";
import { NotificationBell } from "@/features/notifications/components/notification-bell";
import type { InternalRole } from "@/lib/auth/types";

interface AdminTopbarProps {
  fullName: string;
  initialUnreadNotificationCount: number;
  isNavigationOpen: boolean;
  organizationName: string;
  role: InternalRole;
  onOpenNavigation: () => void;
}

function getInitials(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((namePart) => namePart.charAt(0).toUpperCase())
    .join("");
}

export function AdminTopbar({
  fullName,
  initialUnreadNotificationCount,
  isNavigationOpen,
  organizationName,
  role,
  onOpenNavigation,
}: AdminTopbarProps) {
  const pathname = usePathname();
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const closeProfileMenu = useCallback(() => setIsProfileMenuOpen(false), []);
  const { containerRef: profileMenuRef, triggerRef: profileButtonRef } =
    useDismissablePopover<HTMLDivElement, HTMLButtonElement>(
      isProfileMenuOpen,
      closeProfileMenu,
    );
  const currentPage =
    getAdminNavigationForRole(role).find((item) =>
      isAdminNavigationItemActive(pathname, item.href),
    )?.label ?? "Workspace";

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-white/95 backdrop-blur">
      <div className="flex min-h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenNavigation}
            aria-label="Open navigation"
            aria-controls="mobile-navigation"
            aria-expanded={isNavigationOpen}
            className="-ml-2 lg:hidden"
          >
            <Menu className="size-5" aria-hidden="true" />
          </Button>
          <div className="min-w-0">
            <p className="text-xs font-medium text-text-muted">NEXFORA OS</p>
            <p className="truncate text-sm font-semibold text-foreground">
              {currentPage}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <NotificationBell initialUnreadCount={initialUnreadNotificationCount} />

          <div ref={profileMenuRef} className="relative">
            <button
              ref={profileButtonRef}
              type="button"
              aria-haspopup="true"
              aria-expanded={isProfileMenuOpen}
              aria-controls="profile-menu"
              onClick={() => setIsProfileMenuOpen((isOpen) => !isOpen)}
              className="flex min-h-11 items-center gap-2 rounded-md px-1.5 text-left transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:gap-3 sm:px-2"
            >
              <span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-nexfora-black text-xs font-semibold text-white"
              >
                {getInitials(fullName)}
              </span>
              <span className="hidden min-w-0 sm:block">
                <span className="block max-w-40 truncate text-sm font-medium text-foreground">
                  {fullName}
                </span>
                <span className="block text-xs text-text-muted">
                  {INTERNAL_ROLE_LABELS[role]}
                </span>
              </span>
              <ChevronDown
                className="hidden size-4 text-text-muted sm:block"
                aria-hidden="true"
              />
            </button>

            {isProfileMenuOpen ? (
              <div
                id="profile-menu"
                className="absolute right-0 mt-2 w-72 rounded-lg border border-border bg-white p-2 shadow-lg"
              >
                <div className="px-3 py-2.5">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {fullName}
                  </p>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {INTERNAL_ROLE_LABELS[role]}
                  </p>
                  <p className="mt-2 truncate text-xs text-text-secondary">
                    {organizationName}
                  </p>
                </div>
                <div className="my-1 h-px bg-border" />
                <form action={logout}>
                  <button
                    type="submit"
                    className="flex min-h-10 w-full items-center gap-2 rounded-md px-3 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    <LogOut className="size-4" aria-hidden="true" />
                    Log out
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
