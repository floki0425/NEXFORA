import type { InternalMember, InternalRole } from "@/lib/auth/types";

import { SEARCH_ENTITY_TYPES, type SearchEntityType } from "./constants.ts";

/**
 * Which entity types a role can ever receive results for.
 *
 * This MIRRORS the per-entity product-role predicates inside
 * public.search_workspace (supabase/migrations/20260807010000_phase_12a_global_search.sql).
 * It is presentation metadata -- which group headers are worth rendering --
 * and is never the boundary. The RPC enforces the same matrix in SQL, behind
 * an internal-membership guard and base-table RLS.
 *
 * support_ticket is included for every internal role because its RLS policy
 * already scopes rows to admins, the assignee, and the managing project
 * manager. A team_member can legitimately match their own tickets.
 */
export const SEARCH_ENTITY_ROLE_ACCESS: Record<
  InternalRole,
  readonly SearchEntityType[]
> = {
  super_admin: SEARCH_ENTITY_TYPES,
  admin: SEARCH_ENTITY_TYPES,
  project_manager: ["client", "project", "support_ticket"],
  team_member: ["project", "support_ticket"],
};

/** Every internal role may open search; results self-limit per entity. */
export function canUseGlobalSearch(role: InternalRole): boolean {
  return SEARCH_ENTITY_ROLE_ACCESS[role].length > 0;
}

export function canSearchEntity(
  role: InternalRole,
  entityType: SearchEntityType,
): boolean {
  return SEARCH_ENTITY_ROLE_ACCESS[role].includes(entityType);
}

export function searchableEntitiesForRole(
  role: InternalRole,
): readonly SearchEntityType[] {
  return SEARCH_ENTITY_ROLE_ACCESS[role];
}

export function memberCanUseGlobalSearch(member: InternalMember): boolean {
  return canUseGlobalSearch(member.role);
}
