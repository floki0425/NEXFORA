import type { Database } from "@/types/database";

import type { ClientRole, InvitationStatus } from "./constants.ts";

export type ClientInvitationRow =
  Database["public"]["Tables"]["client_invitations"]["Row"];
export type ClientUserRow = Database["public"]["Tables"]["client_users"]["Row"];

export interface PendingInvitationListItem {
  id: string;
  email: string;
  role: ClientRole;
  status: InvitationStatus;
  expiresAt: string;
  createdAt: string;
}

export interface ClientPortalMemberListItem {
  id: string;
  role: ClientRole;
  status: "active" | "invited" | "suspended";
  createdAt: string;
  fullName: string;
}

export interface ClientPortalAccessData {
  pendingInvitations: PendingInvitationListItem[];
  members: ClientPortalMemberListItem[];
}

export interface ClientInvitationActionResult {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string[]>;
}
