// Shapes returned by the Phase 12A report RPCs
// (supabase/migrations/20260807000000_phase_12a_reporting.sql).
//
// The RPCs return jsonb, which the generated Supabase types surface as the
// loose `Json` type. These interfaces are the contract the query layer
// validates that payload against rather than trusting it.
//
// Every rate is `number | null`: null means the denominator was zero, i.e.
// "no data", which is distinct from a rate of zero.

export interface ReportWindow {
  report_from: string;
  report_to: string;
  timezone: "Asia/Manila";
}

export interface CurrencyTotal {
  currency: string;
  total: number;
}

export interface LeadFunnelBucket {
  status: string;
  total: number;
}

export interface LeadConversionReport extends ReportWindow {
  leads_created: number;
  leads_converted_from_cohort: number;
  conversion_rate: number | null;
  conversions_in_period: number;
  won: number;
  lost: number;
  win_rate: number | null;
  /**
   * Leads marked won that never produced a client record. Surfaced rather
   * than hidden: conversion is keyed on converted_at, not status.
   */
  won_not_converted: number;
  avg_days_to_convert: number | null;
  median_days_to_convert: number | null;
  funnel: LeadFunnelBucket[];
}

export interface LeadSourceRow {
  source: string;
  lead_count: number;
  qualified_count: number;
  won_count: number;
  lost_count: number;
  converted_count: number;
  conversion_rate: number | null;
  avg_lead_score: number | null;
  attributed_paid_total: CurrencyTotal[];
}

export interface LeadSourceReport extends ReportWindow {
  /** First-touch: credits a client's whole history to its originating lead. */
  attribution_model: "first_touch";
  sources: LeadSourceRow[];
}

export interface ProposalValueByCurrency {
  currency: string;
  pipeline_total: number;
  won_total: number;
  avg_won_total: number | null;
}

export interface ProposalWinRateReport extends ReportWindow {
  sent: number;
  viewed: number;
  accepted: number;
  declined: number;
  /** Expired is NOT a decline; it is excluded from win_rate_decided. */
  expired: number;
  changes_requested: number;
  accepted_in_period: number;
  /** Headline: accepted / (accepted + declined). */
  win_rate_decided: number | null;
  /** Secondary: accepted / everything sent. Expired dilutes this one. */
  win_rate_sent: number | null;
  view_rate: number | null;
  avg_days_to_decision: number | null;
  value_by_currency: ProposalValueByCurrency[];
}

export interface InvoiceCohortRow {
  currency: string;
  cohort_billed: number;
  cohort_collected: number;
  cohort_outstanding: number;
  cohort_collection_rate: number | null;
}

export interface LedgerOpenRow {
  currency: string;
  outstanding: number;
  overdue: number;
}

export interface RevenueMonthlyPoint {
  month: string;
  currency: string;
  collected: number;
}

export interface RevenueTopClient {
  client_id: string;
  business_name: string | null;
  currency: string;
  collected: number;
}

export interface RevenueProviderSplit {
  provider: string;
  currency: string;
  collected: number;
}

export interface RevenueReport extends ReportWindow {
  /**
   * The cohort rate counts payments against cohort invoices whenever they
   * landed, so it rises over time. The UI must label it accordingly.
   */
  cohort_collection_rate_basis: "as_of_today";
  /** Cash basis: settled payments whose paid_at falls inside the window. */
  collected_in_period: CurrencyTotal[];
  /** Accrual basis: non-draft, non-void invoices issued inside the window. */
  invoice_cohort: InvoiceCohortRow[];
  /** Point-in-time ledger facts. Not scoped to the window. */
  ledger_open: LedgerOpenRow[];
  monthly_series: RevenueMonthlyPoint[];
  top_clients: RevenueTopClient[];
  provider_split: RevenueProviderSplit[];
  /** Refunds are counted, never netted out of collected totals. */
  refunded_count: number;
  mrr: CurrencyTotal[];
  mrr_excluded_custom_cycle_count: number;
}

export interface ProjectStatusBucket {
  status: string;
  total: number;
}

export interface ProjectProgressDrift {
  project_id: string;
  project_name: string;
  stored_progress_percent: number;
  derived_progress_percent: number;
  drift: number;
}

export interface ProjectDeliveryReport extends ReportWindow {
  metric_label: string;
  metric_caveat: string;
  completed_in_period: number;
  /** Schedule adherence only. See metric_caveat. */
  schedule_on_time_rate: number | null;
  on_schedule_count: number;
  /** Completed projects that had a target_date, i.e. the rate's denominator. */
  rated_count: number;
  no_target_date_count: number;
  avg_delivery_days: number | null;
  active_by_status: ProjectStatusBucket[];
  overdue_active_count: number;
  milestone_completion_rate: number | null;
  overdue_milestone_count: number;
  tasks_completed_in_period: number;
  open_tasks_by_status: ProjectStatusBucket[];
  /** Reported only. progress_percent is never written by a report. */
  progress_drift: ProjectProgressDrift[];
}
