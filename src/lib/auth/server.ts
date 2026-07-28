import "server-only";

import type { User } from "@supabase/supabase-js";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

import {
  AuthenticationRequiredError,
  AuthorizationDeniedError,
  AuthorizationLookupError,
} from "./errors";
import {
  INTERNAL_ROLES,
  type CurrentProfile,
  type InternalMember,
  type InternalRole,
} from "./types";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

const profileRowSchema = z.object({
  id: z.uuid(),
  auth_user_id: z.uuid(),
  full_name: z.string(),
  avatar_url: z.string().nullable(),
  phone: z.string().nullable(),
  timezone: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

const membershipRowSchema = z.object({
  id: z.uuid(),
  organization_id: z.uuid(),
  user_id: z.uuid(),
  role: z.enum(INTERNAL_ROLES),
  status: z.literal("active"),
});

const organizationRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  status: z.literal("active"),
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

async function findProfile(
  supabase: ServerSupabaseClient,
  authUserId: string,
): Promise<CurrentProfile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, auth_user_id, full_name, avatar_url, phone, timezone, created_at, updated_at",
    )
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error) {
    throw new AuthorizationLookupError();
  }

  if (!data) {
    return null;
  }

  const profileResult = profileRowSchema.safeParse(data);

  if (!profileResult.success) {
    throw new AuthorizationLookupError();
  }

  const profile = profileResult.data;

  return {
    id: profile.id,
    authUserId: profile.auth_user_id,
    fullName: profile.full_name,
    avatarUrl: profile.avatar_url,
    phone: profile.phone,
    timezone: profile.timezone,
    createdAt: profile.created_at,
    updatedAt: profile.updated_at,
  };
}

export async function getInternalMemberForUser(
  supabase: ServerSupabaseClient,
  authUserId: string,
): Promise<InternalMember | null> {
  const profile = await findProfile(supabase, authUserId);

  if (!profile) {
    return null;
  }

  const { data: membershipData, error: membershipError } = await supabase
    .from("organization_members")
    .select("id, organization_id, user_id, role, status")
    .eq("user_id", profile.id)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(2);

  if (membershipError) {
    throw new AuthorizationLookupError();
  }

  if (!membershipData || membershipData.length === 0) {
    return null;
  }

  // Phase 1 has one Nexfora organization and no organization switcher.
  // Fail closed instead of selecting an arbitrary role if data is misconfigured.
  if (membershipData.length !== 1) {
    throw new AuthorizationLookupError();
  }

  const membershipResult = membershipRowSchema.safeParse(membershipData[0]);

  if (!membershipResult.success) {
    throw new AuthorizationLookupError();
  }

  const membership = membershipResult.data;
  const { data: organizationData, error: organizationError } = await supabase
    .from("organizations")
    .select("id, name, slug, status")
    .eq("id", membership.organization_id)
    .eq("status", "active")
    .maybeSingle();

  if (organizationError) {
    throw new AuthorizationLookupError();
  }

  if (!organizationData) {
    return null;
  }

  const organizationResult =
    organizationRowSchema.safeParse(organizationData);

  if (!organizationResult.success) {
    throw new AuthorizationLookupError();
  }

  const organization = organizationResult.data;

  return {
    membershipId: membership.id,
    organizationId: membership.organization_id,
    profileId: membership.user_id,
    role: membership.role,
    status: membership.status,
    profile,
    organization,
  };
}

export async function requireUser(): Promise<User> {
  const supabase = await createClient();
  const user = await getVerifiedUser(supabase);

  if (!user) {
    throw new AuthenticationRequiredError();
  }

  return user;
}

export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  const supabase = await createClient();
  const user = await getVerifiedUser(supabase);

  if (!user) {
    return null;
  }

  return findProfile(supabase, user.id);
}

export async function requireInternalMember(): Promise<InternalMember> {
  const supabase = await createClient();
  const user = await getVerifiedUser(supabase);

  if (!user) {
    throw new AuthenticationRequiredError();
  }

  const membership = await getInternalMemberForUser(supabase, user.id);

  if (!membership) {
    throw new AuthorizationDeniedError();
  }

  return membership;
}

export async function requireRole(
  allowedRoles: readonly InternalRole[],
): Promise<InternalMember> {
  const membership = await requireInternalMember();

  if (
    allowedRoles.length === 0 ||
    !allowedRoles.includes(membership.role)
  ) {
    throw new AuthorizationDeniedError();
  }

  return membership;
}

export type { CurrentProfile, InternalMember, InternalRole } from "./types";
