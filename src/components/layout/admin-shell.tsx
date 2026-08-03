"use client";

import { useCallback, useState, type ReactNode } from "react";

import { AdminSidebar } from "@/components/layout/admin-sidebar";
import { AdminTopbar } from "@/components/layout/admin-topbar";
import { MobileNavigation } from "@/components/layout/mobile-navigation";
import type { InternalRole } from "@/lib/auth/types";

interface AdminShellProps {
  children: ReactNode;
  fullName: string;
  initialUnreadNotificationCount: number;
  organizationName: string;
  role: InternalRole;
}

export function AdminShell({
  children,
  fullName,
  initialUnreadNotificationCount,
  organizationName,
  role,
}: AdminShellProps) {
  const [isMobileNavigationOpen, setIsMobileNavigationOpen] =
    useState(false);
  const closeMobileNavigation = useCallback(
    () => setIsMobileNavigationOpen(false),
    [],
  );

  return (
    <div className="min-h-svh bg-surface-muted">
      <a
        href="#admin-main-content"
        className="fixed left-4 top-3 z-[60] -translate-y-20 rounded-md bg-nexfora-black px-4 py-2 text-sm font-medium text-white transition-transform focus:translate-y-0 focus:outline-2 focus:outline-offset-2 focus:outline-accent"
      >
        Skip to main content
      </a>

      <AdminSidebar organizationName={organizationName} role={role} />
      <MobileNavigation
        isOpen={isMobileNavigationOpen}
        organizationName={organizationName}
        role={role}
        onClose={closeMobileNavigation}
      />

      <div className="min-w-0 lg:pl-64">
        <AdminTopbar
          fullName={fullName}
          initialUnreadNotificationCount={initialUnreadNotificationCount}
          isNavigationOpen={isMobileNavigationOpen}
          organizationName={organizationName}
          role={role}
          onOpenNavigation={() => setIsMobileNavigationOpen(true)}
        />
        <main
          id="admin-main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-[100rem] px-4 py-6 outline-none sm:px-6 sm:py-8 lg:px-8 lg:py-10"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
