"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SEARCH_MIN_QUERY_LENGTH } from "@/lib/search/sanitize";

import { searchWorkspaceAction } from "../actions.ts";
import type { SearchActionResult, SearchResult } from "../types.ts";
import { SearchResultList } from "./search-result-list.tsx";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

const DEBOUNCE_MS = 250;

export interface GlobalSearchDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GlobalSearchDialog({ isOpen, onClose }: GlobalSearchDialogProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Guards against a slow response overwriting a newer one.
  const requestSequence = useRef(0);

  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchActionResult>({ status: "empty" });
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPending, startTransition] = useTransition();

  const titleId = useId();
  const statusId = useId();
  const listboxId = useId();

  const isBelowMinimum =
    query.trim().length > 0 && query.trim().length < SEARCH_MIN_QUERY_LENGTH;

  // Derived during render rather than written back into state from an effect:
  // a query that is too short simply displays as empty, without a state write.
  const effectiveResult: SearchActionResult = useMemo(
    () =>
      query.trim().length < SEARCH_MIN_QUERY_LENGTH
        ? ({ status: "empty" } as const)
        : result,
    [query, result],
  );

  const results: readonly SearchResult[] = useMemo(
    () => (effectiveResult.status === "ok" ? effectiveResult.results : []),
    [effectiveResult],
  );

  const runSearch = useCallback((value: string) => {
    const sequence = requestSequence.current + 1;
    requestSequence.current = sequence;

    startTransition(async () => {
      let next: SearchActionResult;
      try {
        next = await searchWorkspaceAction(value);
      } catch {
        // The action itself never throws -- it maps every failure to the
        // `error` state. This catches the transport instead: a dropped
        // connection must render the designed error state, which keeps the
        // typed query and offers retry, rather than rejecting inside the
        // transition and taking out the whole route through its error
        // boundary.
        next = { status: "error" };
      }
      // Drop a stale response.
      if (requestSequence.current !== sequence) return;
      setResult(next);
      setActiveIndex(0);
    });
  }, []);

  // Debounced query -> server action.
  useEffect(() => {
    if (!isOpen) return;
    if (query.trim().length < SEARCH_MIN_QUERY_LENGTH) return;

    const timer = setTimeout(() => runSearch(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, isOpen, runSearch]);

  // Focus the input on open; restore body scroll on close.
  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    inputRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  // Escape to close, Tab to cycle within the dialog, arrows to navigate.
  useEffect(() => {
    if (!isOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (results.length === 0) return;
        event.preventDefault();
        setActiveIndex((current) => {
          const next = event.key === "ArrowDown" ? current + 1 : current - 1;
          return (next + results.length) % results.length;
        });
        return;
      }

      if (event.key === "Enter") {
        const target = results[activeIndex];
        if (target) {
          event.preventDefault();
          onClose();
          router.push(target.href);
        }
        return;
      }

      if (event.key === "Tab" && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
        ).filter((element) => element.offsetParent !== null);
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose, results, activeIndex, router]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[10vh]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
      >
        <h2 id={titleId} className="sr-only">
          Search the workspace
        </h2>

        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="size-4 shrink-0 text-text-muted" aria-hidden="true" />
          <Input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search leads, clients, projects…"
            aria-label="Search the workspace"
            aria-describedby={statusId}
            aria-controls={listboxId}
            aria-expanded={results.length > 0}
            autoComplete="off"
            className="border-0 focus-visible:ring-0"
          />
          {isPending ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-text-muted" aria-hidden="true" />
          ) : null}
        </div>

        <div id={listboxId} role="listbox" aria-label="Search results" className="max-h-[55vh] overflow-y-auto p-3">
          {isBelowMinimum ? (
            <p className="px-1 py-6 text-center text-sm text-text-muted">
              Type at least {SEARCH_MIN_QUERY_LENGTH} characters to search.
            </p>
          ) : null}

          {!isBelowMinimum && query.trim().length === 0 ? (
            <p className="px-1 py-6 text-center text-sm text-text-muted">
              Search leads, clients, projects, proposals, invoices and tickets.
            </p>
          ) : null}

          {effectiveResult.status === "ok" ? (
            <SearchResultList
              results={results}
              activeIndex={activeIndex}
              onSelect={onClose}
              interactive
            />
          ) : null}

          {effectiveResult.status === "empty" && !isBelowMinimum && query.trim().length >= SEARCH_MIN_QUERY_LENGTH && !isPending ? (
            <p className="px-1 py-6 text-center text-sm text-text-muted">
              No matches for “{query.trim()}”.
            </p>
          ) : null}

          {effectiveResult.status === "denied" ? (
            <p className="px-1 py-6 text-center text-sm text-text-secondary">
              You don&apos;t have access to workspace search.
            </p>
          ) : null}

          {effectiveResult.status === "error" ? (
            <div className="px-1 py-6 text-center">
              <p className="text-sm text-text-secondary">
                We couldn&apos;t run that search.
              </p>
              {/* The query is deliberately preserved so a retry costs nothing. */}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={() => runSearch(query)}
              >
                Try again
              </Button>
            </div>
          ) : null}
        </div>

        <p id={statusId} aria-live="polite" className="sr-only">
          {effectiveResult.status === "ok"
            ? `${results.length} result${results.length === 1 ? "" : "s"}`
            : effectiveResult.status === "empty"
              ? "No results"
              : effectiveResult.status === "denied"
                ? "Access denied"
                : "Search failed"}
        </p>
      </div>
    </div>
  );
}
