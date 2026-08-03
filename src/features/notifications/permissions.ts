import type { InternalMember } from "@/lib/auth/types";

// Every internal role (super_admin, admin, project_manager, team_member) can
// read their own notification feed and manage their own preferences — the
// feed and preferences are scoped per-profile by the underlying RPCs
// regardless of role, so there is nothing to gate beyond being an active
// internal member at all (already enforced by requireInternalMember() at
// every call site).

// Unresolved decision #5 in the Phase 11 handoff ("whether admin as well as
// super_admin may trigger a manual reminder run") is resolved as
// super_admin-only, per the handoff's own stated assumption.
export function canRunRemindersManually(member: InternalMember): boolean {
  return member.role === "super_admin";
}
