"use client";

import { useEffect, useRef } from "react";

/**
 * Shared pointerdown-outside + Escape-to-close + focus-return behavior for
 * any popover/dropdown menu. Originally implemented once for
 * AdminTopbar's profile menu (src/components/layout/admin-topbar.tsx);
 * extracted here so the Phase 11 notification bell reuses the exact same
 * dismissal behavior instead of a second, subtly different implementation.
 */
export function useDismissablePopover<
  TContainer extends HTMLElement = HTMLDivElement,
  TTrigger extends HTMLElement = HTMLButtonElement,
>(isOpen: boolean, onClose: () => void) {
  const containerRef = useRef<TContainer>(null);
  const triggerRef = useRef<TTrigger>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !containerRef.current?.contains(event.target)
      ) {
        onClose();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  return { containerRef, triggerRef };
}
