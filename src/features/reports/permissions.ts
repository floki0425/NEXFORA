import {
  canViewAnyReport,
  canViewReport,
  visibleReportsForRole,
  type ReportId,
} from "@/config/admin-navigation";
import type { InternalMember } from "@/lib/auth/types";

// The predicates themselves live alongside the matrix in config/ so the
// route gate in src/lib/auth and this feature cannot disagree. Re-exported
// here for feature-local imports.
//
// These are the UI/route convenience gate. Each report RPC re-checks the role
// itself and raises P0001 on denial, so a caller who navigates straight to
// the database still fails closed.
export { canViewAnyReport, canViewReport, visibleReportsForRole };

export function memberCanViewReport(
  member: InternalMember,
  reportId: ReportId,
): boolean {
  return canViewReport(member.role, reportId);
}

export function memberCanViewAnyReport(member: InternalMember): boolean {
  return canViewAnyReport(member.role);
}
