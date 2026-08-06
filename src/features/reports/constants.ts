// The role matrix itself lives in src/config/admin-navigation.ts so that
// src/lib/auth (which must never import from src/features) and this feature
// share one definition. Re-exported here so feature code has a single import
// surface.
//
// project_delivery is the only report a project_manager may open, and their
// rows are scoped by the RPC to projects where project_manager_id is their
// own profile. team_member has no reporting access at all.
import type { ReportId } from "@/config/admin-navigation";

export {
  REPORT_IDS,
  REPORT_INDEX_ROLES,
  REPORT_ROLE_ACCESS,
  type ReportId,
} from "@/config/admin-navigation";

export const REPORT_LABELS: Record<ReportId, string> = {
  lead_conversion: "Lead Conversion",
  lead_source: "Lead Sources",
  proposal_win_rate: "Proposal Win Rate",
  revenue: "Revenue",
  project_delivery: "Project Delivery",
};

export const REPORT_ROUTES: Record<ReportId, string> = {
  lead_conversion: "/admin/reports/lead-conversion",
  lead_source: "/admin/reports/lead-sources",
  proposal_win_rate: "/admin/reports/proposal-win-rate",
  revenue: "/admin/reports/revenue",
  project_delivery: "/admin/reports/project-delivery",
};

export const REPORT_RPC_NAMES: Record<ReportId, string> = {
  lead_conversion: "get_lead_conversion_report",
  lead_source: "get_lead_source_report",
  proposal_win_rate: "get_proposal_win_rate_report",
  revenue: "get_revenue_report",
  project_delivery: "get_project_delivery_report",
};

export const LEAD_SOURCES = [
  "website",
  "facebook",
  "messenger",
  "email",
  "referral",
  "networking",
  "manual",
  "existing_client",
  "other",
] as const;

export const LEAD_STATUSES = [
  "new",
  "contacted",
  "discovery",
  "qualified",
  "proposal",
  "negotiation",
  "won",
  "lost",
] as const;

/** Project statuses counted as active -- excludes completed and cancelled. */
export const ACTIVE_PROJECT_STATUSES = [
  "planning",
  "design",
  "development",
  "integration",
  "testing",
  "client_review",
  "deployment",
  "on_hold",
] as const;

export const OPEN_TASK_STATUSES = ["todo", "in_progress", "blocked", "review"] as const;

/**
 * The Schedule On-Time Rate measures schedule adherence only. The schema
 * carries no client-dependency field, no blocked-reason, and no timestamped
 * hold ledger, so a delay caused by a client waiting on content is
 * indistinguishable from one caused by the team. Delay attribution is F-111
 * and is explicitly out of scope for Phase 12A.
 */
export const SCHEDULE_ON_TIME_RATE_LABEL = "Schedule On-Time Rate";

export const SCHEDULE_ON_TIME_RATE_CAVEAT =
  "Measures schedule adherence only. The current schema cannot distinguish client-caused delays from internal delays. Do not use for performance review.";

/**
 * The invoice-cohort collection rate counts payments against cohort invoices
 * regardless of when those payments landed, so it rises over time as older
 * invoices settle. The UI must say so rather than present a moving number as
 * a fixed one.
 */
export const COHORT_COLLECTION_RATE_BASIS_LABEL = "as of today";
