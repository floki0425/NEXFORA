import {
  SEARCH_ENTITY_LABELS,
  SEARCH_ENTITY_TYPES,
  SEARCH_TOTAL_CAP,
  isSearchEntityType,
  searchResultHref,
} from "./constants.ts";
import type {
  SearchActionResult,
  SearchResult,
  SearchResultGroup,
} from "./types.ts";

/** A raw row as returned by public.search_workspace. */
export interface SearchWorkspaceRow {
  entity_type: string | null;
  entity_id: string | null;
  title: string | null;
  subtitle: string | null;
  status: string | null;
  updated_at: string | null;
}

/** The subset of a PostgREST error this module is allowed to look at. */
export interface SearchRpcError {
  code?: string | null;
}

/**
 * The RPC's only P0001 is the internal-membership denial, so the code alone
 * identifies it. The error MESSAGE is never inspected or propagated -- the
 * result union carries no message field, which makes leaking database text
 * structurally impossible rather than merely discouraged.
 */
const PERMISSION_DENIED_CODE = "P0001";

export function mapSearchRow(row: SearchWorkspaceRow): SearchResult | null {
  if (!isSearchEntityType(row.entity_type) || !row.entity_id || !row.updated_at) {
    return null;
  }

  return {
    entityType: row.entity_type,
    entityId: row.entity_id,
    title: row.title?.trim() || "Untitled",
    subtitle: row.subtitle?.trim() || null,
    status: row.status ?? null,
    updatedAt: row.updated_at,
    href: searchResultHref(row.entity_type, row.entity_id),
  };
}

export function mapSearchRows(rows: readonly SearchWorkspaceRow[]): SearchResult[] {
  return rows
    .map(mapSearchRow)
    .filter((result): result is SearchResult => result !== null)
    .slice(0, SEARCH_TOTAL_CAP);
}

/** Groups results in the canonical entity order, dropping empty groups. */
export function groupSearchResults(
  results: readonly SearchResult[],
): SearchResultGroup[] {
  return SEARCH_ENTITY_TYPES.map((entityType) => ({
    entityType,
    label: SEARCH_ENTITY_LABELS[entityType],
    results: results.filter((result) => result.entityType === entityType),
  })).filter((group) => group.results.length > 0);
}

/**
 * Maps an RPC outcome to exactly one of the four search states.
 *
 * An error is never flattened into an empty result set: a denial and an
 * outage are both real conditions the user is entitled to be told about,
 * just not in database terms.
 */
export function resolveSearchActionResult(
  rows: readonly SearchWorkspaceRow[] | null | undefined,
  error: SearchRpcError | null | undefined,
): SearchActionResult {
  if (error) {
    return error.code === PERMISSION_DENIED_CODE
      ? { status: "denied" }
      : { status: "error" };
  }

  if (!rows) {
    return { status: "error" };
  }

  const results = mapSearchRows(rows);

  return results.length > 0 ? { status: "ok", results } : { status: "empty" };
}
