import "server-only";

import { requireInternalMember } from "@/lib/auth/server";
import {
  isSearchableQuery,
  normalizeSearchQuery,
} from "@/lib/search/sanitize";
import { createClient } from "@/lib/supabase/server";

import { SEARCH_LIMIT_PER_ENTITY } from "./constants.ts";
import { resolveSearchActionResult, type SearchWorkspaceRow } from "./result.ts";
import type { SearchActionResult } from "./types.ts";

// The organization is resolved SERVER-SIDE from the caller's own membership
// and is never accepted from the client. Passing a client-supplied id would
// let a caller aim the search at another tenant -- the RPC's guard would
// still refuse it, but the application must not be the thing relying on that.
//
// Application-side bounds here are defence in depth. The database enforces
// the authoritative min/max query length, the per-entity limit and the total
// cap; duplicating them cheaply avoids a pointless round trip.

/** Dev-only structured diagnostics. Never reaches the client. */
function logSearchDiagnostics(error: unknown): void {
  if (process.env.NODE_ENV !== "production" && error) {
    const detail = error as { code?: string; message?: string };
    console.error("search_workspace RPC error", {
      code: detail.code,
      message: detail.message,
    });
  }
}

export async function searchWorkspace(rawQuery: string): Promise<SearchActionResult> {
  const query = normalizeSearchQuery(rawQuery ?? "");

  // Below the minimum length is not an error -- it is simply nothing to do.
  if (!isSearchableQuery(query)) {
    return { status: "empty" };
  }

  let organizationId: string;
  try {
    const member = await requireInternalMember();
    organizationId = member.organizationId;
  } catch {
    // Portal users, suspended members and callers without exactly one active
    // internal membership all land here, matching the RPC's own P0001.
    return { status: "denied" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_workspace", {
    p_organization_id: organizationId,
    p_query: query,
    p_limit: SEARCH_LIMIT_PER_ENTITY,
  });

  if (error) logSearchDiagnostics(error);

  return resolveSearchActionResult(
    (data ?? null) as SearchWorkspaceRow[] | null,
    error,
  );
}
