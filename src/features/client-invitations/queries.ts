import "server-only";

import { createClient } from "@/lib/supabase/server";

import type { ClientRole, InvitationStatus } from "./constants.ts";
import type {
  ClientPortalAccessData,
  ClientPortalMemberListItem,
  PendingInvitationListItem,
} from "./types.ts";

interface PendingInvitationRow {
  id: string;
  email: string;
  role: string;
  status: string;
  expires_at: string;
  created_at: string;
}

interface ClientUserJoinRow {
  id: string;
  role: string;
  status: string;
  created_at: string;
  profiles: { full_name: string } | { full_name: string }[] | null;
}

function firstOrNull<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * Read-only visibility for the client detail page: existing pending
 * invitations and active/suspended portal members for one client. Relies on
 * client_invitations/client_users' own RLS (organization-scoped via a join
 * to clients) rather than a direct organization_id filter, since neither
 * table carries its own organization_id column.
 */
export async function getClientPortalAccess(
  clientId: string,
): Promise<ClientPortalAccessData> {
  const supabase = await createClient();

  const [invitationsResult, membersResult] = await Promise.all([
    supabase
      .from("client_invitations")
      .select("id, email, role, status, expires_at, created_at")
      .eq("client_id", clientId)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    supabase
      .from("client_users")
      .select("id, role, status, created_at, profiles(full_name)")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false }),
  ]);

  const pendingInvitations = (
    (invitationsResult.data ?? []) as unknown as PendingInvitationRow[]
  ).map(
    (row): PendingInvitationListItem => ({
      id: row.id,
      email: row.email,
      role: row.role as ClientRole,
      status: row.status as InvitationStatus,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    }),
  );

  const members = ((membersResult.data ?? []) as unknown as ClientUserJoinRow[]).map(
    (row): ClientPortalMemberListItem => ({
      id: row.id,
      role: row.role as ClientRole,
      status: row.status as ClientPortalMemberListItem["status"],
      createdAt: row.created_at,
      fullName: firstOrNull(row.profiles)?.full_name ?? "Unknown",
    }),
  );

  return { pendingInvitations, members };
}
