"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { AdminNavigationLinks } from "@/components/layout/admin-sidebar";
import { Button } from "@/components/ui/button";
import type { InternalRole } from "@/lib/auth/types";

interface MobileNavigationProps {
  isOpen: boolean;
  organizationName: string;
  role: InternalRole;
  onClose: () => void;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function MobileNavigation({
  isOpen,
  organizationName,
  role,
  onClose,
}: MobileNavigationProps) {
  const drawerRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previouslyFocusedElement =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !drawerRef.current) {
        return;
      }

      const focusableElements = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          FOCUSABLE_SELECTOR,
        ),
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1);

      if (!firstElement || !lastElement) {
        return;
      }

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (
        !event.shiftKey &&
        document.activeElement === lastElement
      ) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocusedElement?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        aria-label="Close navigation"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-nexfora-black/55"
      />
      <aside
        id="mobile-navigation"
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-navigation-title"
        className="relative flex h-full w-[min(20rem,88vw)] flex-col border-r border-white/10 bg-surface-dark text-white shadow-lg"
      >
        <div className="flex min-h-20 items-center justify-between gap-4 border-b border-white/10 px-5">
          <Link
            href="/admin"
            onClick={onClose}
            className="flex items-center gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
          >
            <span
              aria-hidden="true"
              className="flex size-9 items-center justify-center rounded-md bg-white text-sm font-semibold text-nexfora-black"
            >
              N
            </span>
            <span id="mobile-navigation-title">
              <span className="block text-sm font-semibold tracking-[0.16em]">
                NEXFORA
              </span>
              <span className="mt-0.5 block text-[0.65rem] font-medium uppercase tracking-[0.22em] text-nexfora-gray-200/60">
                Operating System
              </span>
            </span>
          </Link>
          <Button
            ref={closeButtonRef}
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close navigation"
            className="text-nexfora-gray-200 hover:bg-white/10 hover:text-white"
          >
            <X className="size-5" aria-hidden="true" />
          </Button>
        </div>

        <nav
          aria-label="Mobile admin navigation"
          className="flex-1 overflow-y-auto px-4 py-6"
        >
          <p className="mb-3 px-3 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-nexfora-gray-200/60">
            Workspace
          </p>
          <AdminNavigationLinks role={role} onNavigate={onClose} />
        </nav>

        <div className="border-t border-white/10 px-5 py-5">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-nexfora-gray-200/60">
            Organization
          </p>
          <p className="mt-2 truncate text-sm font-medium text-nexfora-gray-200">
            {organizationName}
          </p>
        </div>
      </aside>
    </div>
  );
}
