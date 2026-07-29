"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  isPortalNavigationItemActive,
  PORTAL_NAVIGATION,
} from "@/config/portal-navigation";
import { cn } from "@/lib/utils/cn";

interface PortalNavigationLinksProps {
  onNavigate?: () => void;
}

export function PortalNavigationLinks({
  onNavigate,
}: PortalNavigationLinksProps) {
  const pathname = usePathname();

  return (
    <ul className="space-y-1">
      {PORTAL_NAVIGATION.map((item) => {
        const isActive = isPortalNavigationItemActive(pathname, item.href);
        const Icon = item.icon;

        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "group relative flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                isActive
                  ? "bg-white/10 text-white"
                  : "text-nexfora-gray-200 hover:bg-white/5 hover:text-white",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent transition-opacity",
                  isActive ? "opacity-100" : "opacity-0",
                )}
              />
              <Icon
                className={cn(
                  "size-[1.125rem] shrink-0",
                  isActive
                    ? "text-accent"
                    : "text-text-muted group-hover:text-nexfora-gray-200",
                )}
                aria-hidden="true"
              />
              <span>{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

interface PortalSidebarProps {
  businessName: string;
}

export function PortalSidebar({ businessName }: PortalSidebarProps) {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-white/10 bg-surface-dark text-white lg:flex">
      <div className="flex min-h-20 items-center border-b border-white/10 px-5">
        <Link
          href="/portal"
          className="flex items-center gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        >
          <span
            aria-hidden="true"
            className="flex size-9 items-center justify-center rounded-md bg-white text-sm font-semibold text-nexfora-black"
          >
            N
          </span>
          <span>
            <span className="block text-sm font-semibold tracking-[0.16em]">
              NEXFORA
            </span>
            <span className="mt-0.5 block text-[0.65rem] font-medium uppercase tracking-[0.22em] text-nexfora-gray-200/60">
              Client Portal
            </span>
          </span>
        </Link>
      </div>

      <nav
        aria-label="Portal navigation"
        className="flex-1 overflow-y-auto px-4 py-6"
      >
        <PortalNavigationLinks />
      </nav>

      <div className="border-t border-white/10 px-5 py-5">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-nexfora-gray-200/60">
          Your business
        </p>
        <p className="mt-2 truncate text-sm font-medium text-nexfora-gray-200">
          {businessName}
        </p>
      </div>
    </aside>
  );
}
