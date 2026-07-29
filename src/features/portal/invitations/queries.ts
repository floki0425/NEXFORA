import "server-only";

import { CLIENT_ROLE_LABELS } from "@/features/client-invitations/constants";
import { hashClientInvitationToken } from "@/lib/tokens/client-invitation-token";
import { createClient } from "@/lib/supabase/server";
import type { ClientRole } from "@/lib/auth/types";

export interface InvitationPreview {
  clientId: string;
  businessName: string;
  email: string;
  roleLabel: string;
  expiresAt: string;
}

interface InvitationPreviewRow {
  client_id: string;
  business_name: string;
  email: string;
  role: string;
  expires_at: string;
}

/**
 * Public, pre-authentication lookup for the accept-invitation page — safe
 * for an unauthenticated visitor, since get_client_invitation_by_token is a
 * SECURITY DEFINER function granted to anon (never a direct table read, so
 * raw token-hash scanning is never possible). Invalid, expired, and revoked
 * tokens all return null uniformly.
 */
export async function getInvitationPreview(
  rawToken: string,
): Promise<InvitationPreview | null> {
  const tokenHash = hashClientInvitationToken(rawToken);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "get_client_invitation_by_token",
    { p_token_hash: tokenHash },
  );

  if (error || !data) {
    return null;
  }

  const row = data as unknown as InvitationPreviewRow;

  return {
    clientId: row.client_id,
    businessName: row.business_name,
    email: row.email,
    roleLabel: CLIENT_ROLE_LABELS[row.role as ClientRole],
    expiresAt: row.expires_at,
  };
}
