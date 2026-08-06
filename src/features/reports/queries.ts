import "server-only";

import { createClient } from "@/lib/supabase/server";
import { resolveReportRange, type ReportRangeInput } from "@/lib/reporting/date-range";

import {
  leadConversionSchema,
  leadSourceSchema,
  projectDeliverySchema,
  proposalWinRateSchema,
  revenueSchema,
  toReportResult,
  type ReportResult,
} from "./response.ts";
import type {
  LeadConversionReport,
  LeadSourceReport,
  ProjectDeliveryReport,
  ProposalWinRateReport,
  RevenueReport,
} from "./types.ts";

// Every report goes through the same three steps: resolve and clamp the
// window, call the RPC as the signed-in user, then validate the payload.
//
// The database is the authorization boundary -- these functions never widen
// what the RPC returns, never recompute a metric in TypeScript, and never
// merge currencies. A P0001 becomes `denied`; anything else becomes `error`.

/** Dev-only structured diagnostics. Never reaches a user or a response. */
function logReportDiagnostics(operation: string, error: unknown): void {
  if (process.env.NODE_ENV !== "production" && error) {
    const detail = error as { code?: string; message?: string };
    console.error(`${operation} report RPC error`, {
      code: detail.code,
      message: detail.message,
    });
  }
}

/** Empty string filters (the schemas' default) become SQL nulls. */
function optional(value: string | undefined | null): string | undefined {
  return value ? value : undefined;
}

/**
 * Shape of a PostgREST RPC outcome, narrowed to what this module reads. The
 * RPCs return jsonb (surfaced as `Json`), so the payload stays `unknown` here
 * and the Zod schema is what narrows it.
 */
type RpcOutcome = { data: unknown; error: { code?: string | null } | null };

async function callReport<TSchema extends Parameters<typeof toReportResult>[0]>(
  operation: string,
  schema: TSchema,
  rpc: "get_lead_conversion_report"
    | "get_lead_source_report"
    | "get_proposal_win_rate_report"
    | "get_revenue_report"
    | "get_project_delivery_report",
  args: Record<string, unknown>,
) {
  const supabase = await createClient();
  const { data, error } = (await supabase.rpc(
    rpc,
    args as never,
  )) as unknown as RpcOutcome;

  if (error) logReportDiagnostics(operation, error);

  return toReportResult(schema, data, error);
}

function windowArgs(range: ReportRangeInput) {
  const { from, to } = resolveReportRange(range);
  return { p_from: from, p_to: to };
}

export interface LeadConversionFilterInput extends ReportRangeInput {
  source?: string;
  assignedTo?: string;
}

export async function getLeadConversionReport(
  filters: LeadConversionFilterInput,
): Promise<ReportResult<LeadConversionReport>> {
  return callReport("lead conversion", leadConversionSchema, "get_lead_conversion_report", {
    ...windowArgs(filters),
    p_source: optional(filters.source),
    p_assigned_to: optional(filters.assignedTo),
  }) as Promise<ReportResult<LeadConversionReport>>;
}

export interface LeadSourceFilterInput extends ReportRangeInput {
  assignedTo?: string;
}

export async function getLeadSourceReport(
  filters: LeadSourceFilterInput,
): Promise<ReportResult<LeadSourceReport>> {
  return callReport("lead source", leadSourceSchema, "get_lead_source_report", {
    ...windowArgs(filters),
    p_assigned_to: optional(filters.assignedTo),
  }) as Promise<ReportResult<LeadSourceReport>>;
}

export interface ProposalWinRateFilterInput extends ReportRangeInput {
  createdBy?: string;
}

export async function getProposalWinRateReport(
  filters: ProposalWinRateFilterInput,
): Promise<ReportResult<ProposalWinRateReport>> {
  return callReport("proposal win rate", proposalWinRateSchema, "get_proposal_win_rate_report", {
    ...windowArgs(filters),
    p_created_by: optional(filters.createdBy),
  }) as Promise<ReportResult<ProposalWinRateReport>>;
}

export interface RevenueFilterInput extends ReportRangeInput {
  clientId?: string;
}

export async function getRevenueReport(
  filters: RevenueFilterInput,
): Promise<ReportResult<RevenueReport>> {
  return callReport("revenue", revenueSchema, "get_revenue_report", {
    ...windowArgs(filters),
    p_client_id: optional(filters.clientId),
  }) as Promise<ReportResult<RevenueReport>>;
}

export interface ProjectDeliveryFilterInput extends ReportRangeInput {
  status?: string;
  projectManagerId?: string;
  clientId?: string;
}

export async function getProjectDeliveryReport(
  filters: ProjectDeliveryFilterInput,
): Promise<ReportResult<ProjectDeliveryReport>> {
  return callReport("project delivery", projectDeliverySchema, "get_project_delivery_report", {
    ...windowArgs(filters),
    p_status: optional(filters.status),
    p_project_manager_id: optional(filters.projectManagerId),
    p_client_id: optional(filters.clientId),
  }) as Promise<ReportResult<ProjectDeliveryReport>>;
}
