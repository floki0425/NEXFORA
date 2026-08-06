// Shared query sanitization for search inputs.
//
// Two different escaping problems live here because the codebase has two
// different search paths, and conflating them is how injection bugs happen:
//
//   safeSearchValue   -- for PostgREST `.or()` filter strings, where the term
//                        is interpolated into a comma/paren-delimited filter
//                        grammar. Metacharacters must be REMOVED, because
//                        there is no escape syntax in that grammar.
//
//   escapeLikePattern -- for the `search_workspace` RPC, where the term is
//                        passed as a bound parameter and only needs its LIKE
//                        wildcards neutralized. Metacharacters are ESCAPED,
//                        not removed, so a user searching for a literal "%"
//                        or "_" finds it instead of matching everything.
//
// This module must not import from src/features -- src/lib never depends on
// src/features in this repository.

export const SEARCH_MIN_QUERY_LENGTH = 2;

export const SEARCH_MAX_QUERY_LENGTH = 120;

/**
 * Strips characters that would break out of PostgREST's `.or()` filter
 * grammar. Used by the existing per-entity list queries.
 */
export function safeSearchValue(value: string): string {
  return value
    .replace(/[%_,().]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Escapes LIKE/ILIKE metacharacters so they match literally. Pairs with an
 * `escape '\'` clause on the SQL side.
 *
 * Backslash is escaped first; doing it later would double-escape the
 * backslashes introduced when escaping % and _.
 */
export function escapeLikePattern(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

/**
 * Trims and truncates a raw search input to the bounds the RPC enforces.
 * Over-long input is truncated rather than rejected: a user pasting a long
 * string should get results for its start, not an error.
 */
export function normalizeSearchQuery(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > SEARCH_MAX_QUERY_LENGTH
    ? trimmed.slice(0, SEARCH_MAX_QUERY_LENGTH)
    : trimmed;
}

/**
 * Whether a normalized query is long enough to be worth sending. A shorter
 * query is below threshold, not invalid -- callers render an idle/empty
 * state rather than an error.
 */
export function isSearchableQuery(value: string): boolean {
  return normalizeSearchQuery(value).length >= SEARCH_MIN_QUERY_LENGTH;
}
