import Link from "next/link";

import { cn } from "@/lib/utils/cn";

import { groupSearchResults } from "../result.ts";
import type { SearchResult } from "../types.ts";

export interface SearchResultListProps {
  results: readonly SearchResult[];
  /** Index within the flattened result order, for keyboard highlighting. */
  activeIndex?: number;
  onSelect?: () => void;
  /** Set when rendered inside the dialog's listbox. */
  interactive?: boolean;
}

/**
 * Grouped results. Only groups with rows are rendered, so a role that cannot
 * see an entity never sees an empty heading hinting that it exists.
 */
export function SearchResultList({
  results,
  activeIndex = -1,
  onSelect,
  interactive = false,
}: SearchResultListProps) {
  const groups = groupSearchResults(results);

  // Flattened position of each result, precomputed so nothing is mutated
  // during render. Keyboard highlighting indexes into this same order.
  const flatOrder = new Map<string, number>();
  groups
    .flatMap((group) => group.results)
    .forEach((result, index) => {
      flatOrder.set(`${result.entityType}-${result.entityId}`, index);
    });

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section key={group.entityType} aria-labelledby={`search-group-${group.entityType}`}>
          <h3
            id={`search-group-${group.entityType}`}
            className="px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-text-muted"
          >
            {group.label}
          </h3>
          <ul role={interactive ? "group" : undefined} className="space-y-1">
            {group.results.map((result) => {
              const key = `${result.entityType}-${result.entityId}`;
              const flatIndex = flatOrder.get(key) ?? -1;
              const isActive = flatIndex === activeIndex;

              return (
                <li key={key}>
                  <Link
                    href={result.href}
                    onClick={onSelect}
                    id={interactive ? `search-option-${flatIndex}` : undefined}
                    role={interactive ? "option" : undefined}
                    aria-selected={interactive ? isActive : undefined}
                    data-active={isActive ? "true" : undefined}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm outline-none",
                      "hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-accent",
                      isActive && "bg-surface-muted",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-text-primary">
                        {result.title}
                      </span>
                      {result.subtitle ? (
                        <span className="block truncate text-xs text-text-muted">
                          {result.subtitle}
                        </span>
                      ) : null}
                    </span>
                    {result.status ? (
                      <span className="shrink-0 text-xs capitalize text-text-muted">
                        {result.status.replace(/_/g, " ")}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
