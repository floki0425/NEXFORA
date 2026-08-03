import type { InternalMember } from "@/lib/auth/types";

// Mirrors the RLS policy on audit_logs (SS9 of the Phase 11 handoff):
// super_admin/admin only, within their own organization. list_audit_logs()
// re-checks this same rule server-side, so this function only controls
// whether the admin UI renders the audit log at all — it is never the sole
// authorization boundary.
export function canReadAuditLog(member: InternalMember): boolean {
  return member.role === "super_admin" || member.role === "admin";
}
