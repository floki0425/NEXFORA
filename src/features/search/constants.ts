import {
  SEARCH_MAX_QUERY_LENGTH,
  SEARCH_MIN_QUERY_LENGTH,
} from "@/lib/search/sanitize";

export { SEARCH_MAX_QUERY_LENGTH, SEARCH_MIN_QUERY_LENGTH };

/**
 * The six entities public.search_workspace returns. Adding one is additive:
 * a new UNION branch in the RPC plus an entry here and in the maps below.
 */
export const SEARCH_ENTITY_TYPES = [
  "lead",
  "client",
  "project",
  "proposal",
  "invoice",
  "support_ticket",
] as const;

export type SearchEntityType = (typeof SEARCH_ENTITY_TYPES)[number];

export const SEARCH_ENTITY_LABELS: Record<SearchEntityType, string> = {
  lead: "Leads",
  client: "Clients",
  project: "Projects",
  proposal: "Proposals",
  invoice: "Invoices",
  support_ticket: "Support tickets",
};

/**
 * Entity to admin detail route. Deliberately mirrors the shape of
 * NOTIFICATION_ENTITY_ROUTES in src/features/notifications/constants.ts.
 */
export const SEARCH_ENTITY_ROUTES: Record<
  SearchEntityType,
  (entityId: string) => string
> = {
  lead: (entityId) => `/admin/leads/${entityId}`,
  client: (entityId) => `/admin/clients/${entityId}`,
  project: (entityId) => `/admin/projects/${entityId}`,
  proposal: (entityId) => `/admin/proposals/${entityId}`,
  invoice: (entityId) => `/admin/invoices/${entityId}`,
  support_ticket: (entityId) => `/admin/support/${entityId}`,
};

/** Mirrors the clamp inside public.search_workspace. */
export const SEARCH_LIMIT_PER_ENTITY = 5;

/** Mirrors the hard total cap inside public.search_workspace. */
export const SEARCH_TOTAL_CAP = 30;

export const SEARCH_RPC_NAME = "search_workspace";

export function isSearchEntityType(value: unknown): value is SearchEntityType {
  return (
    typeof value === "string" &&
    (SEARCH_ENTITY_TYPES as readonly string[]).includes(value)
  );
}

export function searchResultHref(
  entityType: SearchEntityType,
  entityId: string,
): string {
  return SEARCH_ENTITY_ROUTES[entityType](entityId);
}
