import "server-only";

import { redirect } from "next/navigation";

import { SETTINGS_ROLES } from "@/config/admin-navigation";

import { AuthenticationRequiredError, AuthorizationDeniedError } from "./errors";
import { requireInternalMember } from "./server";
import type { InternalMember } from "./types";

// Extracted from src/app/admin/settings/page.tsx so /admin/settings/audit-log
// (Phase 11) shares the exact same super_admin/admin gate instead of a
// second, possibly-drifting copy of it.
export async function requireSettingsAccess(): Promise<InternalMember> {
  let member: InternalMember;

  try {
    member = await requireInternalMember();
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect("/auth/login?reason=session_required");
    }

    if (error instanceof AuthorizationDeniedError) {
      redirect("/auth/login?reason=access_denied");
    }

    throw error;
  }

  if (!SETTINGS_ROLES.some((role) => role === member.role)) {
    redirect("/admin?notice=settings_access_denied");
  }

  return member;
}
