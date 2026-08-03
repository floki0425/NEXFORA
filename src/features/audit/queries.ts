import "server-only";

import { createClient } from "@/lib/supabase/server";

import type { AuditLogEntry, AuditLogFilters, AuditLogPageData } from "./types";

const AUDIT_LOG_PAGE_SIZE = 50;

interface SupabaseErrorDetails {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

function logSupabaseError(
  operation: string,
  error: SupabaseErrorDetails,
): void {
  if (process.env.NODE_ENV !== "production") {
    console.error(`${operation} Supabase error`, {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
  }
}

function mapAuditLogRow(row: {
  id: string;
  actor_user_id: string | null;
  actor_type: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: unknown;
  created_at: string;
}): AuditLogEntry {
  return {
    id: row.id,
    actorUserId: row.actor_user_id,
    actorType: row.actor_type as AuditLogEntry["actorType"],
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: row.created_at,
  };
}

// list_audit_logs() re-checks super_admin/admin membership itself and raises
// a plain error otherwise, so an unauthorized caller reaching this function
// (e.g. a direct navigation past a UI gate) fails closed here too, not only
// in the page component.
export async function getAuditLogPage(
  filters: AuditLogFilters,
): Promise<AuditLogPageData> {
  const supabase = await createClient();
  const offset = (filters.page - 1) * AUDIT_LOG_PAGE_SIZE;

  const { data, error } = await supabase.rpc("list_audit_logs", {
    p_limit: AUDIT_LOG_PAGE_SIZE,
    p_offset: offset,
    p_entity_type: filters.entityType || undefined,
    p_action: filters.action || undefined,
  });

  if (error) {
    logSupabaseError("getAuditLogPage", error);
    throw new Error("Unable to load the audit log.");
  }

  const entries = (data ?? []).map(mapAuditLogRow);

  // list_audit_logs() does not return a total count (it is a security
  // definer RPC, not a table read, so PostgREST's exact-count header does
  // not apply). "Has another page" is inferred from whether this page came
  // back full, which is enough for prev/next pagination without an extra
  // COUNT(*) round trip.
  const pageCount =
    entries.length === AUDIT_LOG_PAGE_SIZE
      ? filters.page + 1
      : filters.page;

  return { entries, page: filters.page, pageCount };
}
