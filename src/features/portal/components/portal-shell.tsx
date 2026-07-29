"use client";

import { useCallback, useState, type ReactNode } from "react";

import { PortalMobileNavigation } from "@/features/portal/components/portal-mobile-navigation";
import { PortalSidebar } from "@/features/portal/components/portal-sidebar";
import { PortalTopbar } from "@/features/portal/components/portal-topbar";

interface PortalShellProps {
  children: ReactNode;
  fullName: string;
  businessName: string;
}

export function PortalShell({
  children,
  fullName,
  businessName,
}: PortalShellProps) {
  const [isMobileNavigationOpen, setIsMobileNavigationOpen] = useState(false);
  const closeMobileNavigation = useCallback(
    () => setIsMobileNavigationOpen(false),
    [],
  );

  return (
    <div className="min-h-svh bg-surface-muted">
      <a
        href="#portal-main-content"
        className="fixed left-4 top-3 z-[60] -translate-y-20 rounded-md bg-nexfora-black px-4 py-2 text-sm font-medium text-white transition-transform focus:translate-y-0 focus:outline-2 focus:outline-offset-2 focus:outline-accent"
      >
        Skip to main content
      </a>

      <PortalSidebar businessName={businessName} />
      <PortalMobileNavigation
        isOpen={isMobileNavigationOpen}
        businessName={businessName}
        onClose={closeMobileNavigation}
      />

      <div className="min-w-0 lg:pl-64">
        <PortalTopbar
          fullName={fullName}
          isNavigationOpen={isMobileNavigationOpen}
          onOpenNavigation={() => setIsMobileNavigationOpen(true)}
        />
        <main
          id="portal-main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-5xl px-4 py-6 outline-none sm:px-6 sm:py-8 lg:px-8 lg:py-10"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
