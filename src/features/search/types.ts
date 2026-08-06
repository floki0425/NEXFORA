import type { SearchEntityType } from "./constants";

/** One row from public.search_workspace, mapped for the UI. */
export interface SearchResult {
  entityType: SearchEntityType;
  entityId: string;
  title: string;
  subtitle: string | null;
  status: string | null;
  updatedAt: string;
  href: string;
}

export interface SearchResultGroup {
  entityType: SearchEntityType;
  label: string;
  results: SearchResult[];
}

/**
 * Search outcomes are four distinct states, never collapsed into one.
 *
 * Returning an empty array on failure -- the obvious shortcut -- makes "no
 * matches", "you are not permitted", and "the database is unreachable" look
 * identical to the user, which hides real breakage behind a normal-looking
 * empty state. Each state gets its own UI treatment:
 *
 *   ok      -- render the grouped results
 *   empty   -- "No matches for ..."
 *   denied  -- an authorization message; the caller is not an internal member
 *   error   -- a generic retry message; details are logged server-side only
 */
export type SearchActionResult =
  | { status: "ok"; results: SearchResult[] }
  | { status: "empty" }
  | { status: "denied" }
  | { status: "error" };

export type SearchActionStatus = SearchActionResult["status"];
