"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Search } from "lucide-react";

import { GlobalSearchDialog } from "./global-search-dialog.tsx";

/** True when focus sits somewhere that should keep its own keystrokes. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

/** navigator is client-only and never changes, so it never emits. */
const subscribeToNothing = () => () => {};
const readIsApplePlatform = () =>
  /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent);
/** Server snapshot: assume the Ctrl form, so SSR and hydration agree. */
const readIsApplePlatformOnServer = () => false;

export function GlobalSearchTrigger() {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // useSyncExternalStore reads a client-only value without a hydration
  // mismatch and without setting state from an effect.
  const isApplePlatform = useSyncExternalStore(
    subscribeToNothing,
    readIsApplePlatform,
    readIsApplePlatformOnServer,
  );
  const shortcutLabel = isApplePlatform ? "⌘ K" : "Ctrl K";

  const close = useCallback(() => {
    setIsOpen(false);
    // Return focus to where the user left it.
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const isShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (!isShortcut) return;

      // Never steal the keystroke from a field the user is typing in.
      if (isTypingTarget(event.target)) return;

      event.preventDefault();
      setIsOpen((open) => !open);
    }

    // A single listener, added once and removed on unmount, so remounting
    // the topbar cannot stack duplicates.
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className="inline-flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-sm text-text-muted outline-none transition-colors hover:border-border-strong hover:text-text-secondary focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Search className="size-4" aria-hidden="true" />
        <span className="hidden sm:inline">Search</span>
        <kbd className="hidden rounded border border-border px-1 text-[10px] tabular-nums md:inline">
          {shortcutLabel}
        </kbd>
        <span className="sr-only">Search the workspace</span>
      </button>

      <GlobalSearchDialog isOpen={isOpen} onClose={close} />
    </>
  );
}
