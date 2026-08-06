import "server-only";

import { redirect } from "next/navigation";

import {
  canViewAnyReport,
  canViewReport,
  type ReportId,
} from "@/config/admin-navigation";

import { AuthenticationRequiredError, AuthorizationDeniedError } from "./errors";
import { requireInternalMember } from "./server";
import type { InternalMember } from "./types";

// Route-level gate for /admin/reports/*, modelled on requireSettingsAccess so
// both surfaces share one shape.
//
// This is defence in depth, NOT the boundary. Each report RPC re-derives the
// caller's single active internal membership and re-checks the role itself,
// raising P0001 on denial, so a caller who bypasses the UI entirely still
// fails at the database. requireInternalMember() already rejects a suspended
// or ambiguous membership (it fails closed unless exactly one active
// membership exists), so neither is re-implemented here.
//
// Redirects are deliberately coarse: an unauthorized visitor is sent to a
// page they can see, never shown a Supabase or PostgreSQL error.

async function resolveMember(): Promise<InternalMember> {
  try {
    return await requireInternalMember();
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect("/auth/login?reason=session_required");
    }

    if (error instanceof AuthorizationDeniedError) {
      redirect("/auth/login?reason=access_denied");
    }

    throw error;
  }
}

/** Gate for the reports index. Any role with at least one visible report. */
export async function requireReportsIndexAccess(): Promise<InternalMember> {
  const member = await resolveMember();

  if (!canViewAnyReport(member.role)) {
    redirect("/admin?notice=reports_access_denied");
  }

  return member;
}

/** Gate for one specific report route. */
export async function requireReportAccess(
  reportId: ReportId,
): Promise<InternalMember> {
  const member = await resolveMember();

  if (!canViewReport(member.role, reportId)) {
    redirect("/admin?notice=reports_access_denied");
  }

  return member;
}

/**
 * Gate for the admin search surface. Every internal role may search; results
 * self-limit per entity inside the RPC.
 */
export async function requireAdminSearchAccess(): Promise<InternalMember> {
  return resolveMember();
}
