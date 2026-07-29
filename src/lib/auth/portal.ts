import "server-only";

import type { User } from "@supabase/supabase-js";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

import {
  AuthenticationRequiredError,
  AuthorizationDeniedError,
  AuthorizationLookupError,
} from "./errors.ts";
import { getCurrentProfile } from "./server.ts";
import {
  CLIENT_ROLES,
  type CurrentProfile,
  type PortalMember,
} from "./types.ts";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

const membershipRowSchema = z.object({
  client_id: z.uuid(),
  business_name: z.string(),
  client_role: z.enum(CLIENT_ROLES),
  client_status: z.literal("active"),
});

async function getVerifiedUser(
  supabase: ServerSupabaseClient,
): Promise<User | null> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

/**
 * Resolves the caller's active client-portal membership via
 * get_active_client_membership() — a SECURITY DEFINER function, not a
 * direct table read, so clients/projects internal columns are never within
 * reach of this lookup. Mirrors requireInternalMember()'s exact fail-closed
 * shape (throws AuthenticationRequiredError / AuthorizationDeniedError /
 * AuthorizationLookupError), but for client_users instead of
 * organization_members. Internal organization membership and client
 * membership are resolved independently — holding one never implies the
 * other.
 */
export async function requirePortalMember(): Promise<PortalMember> {
  const supabase = await createClient();
  const user = await getVerifiedUser(supabase);

  if (!user) {
    throw new AuthenticationRequiredError();
  }

  const profile = await getCurrentProfile();

  if (!profile) {
    throw new AuthorizationDeniedError();
  }

  const { data, error } = await supabase.rpc("get_active_client_membership");

  if (error) {
    throw new AuthorizationLookupError();
  }

  const membershipRow = (data ?? [])[0];

  if (!membershipRow) {
    throw new AuthorizationDeniedError();
  }

  const membershipResult = membershipRowSchema.safeParse(membershipRow);

  if (!membershipResult.success) {
    throw new AuthorizationLookupError();
  }

  const membership = membershipResult.data;

  return {
    clientId: membership.client_id,
    businessName: membership.business_name,
    role: membership.client_role,
    status: membership.client_status,
    profile,
  };
}

export type { CurrentProfile, PortalMember };
