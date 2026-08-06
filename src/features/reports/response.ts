import { z } from "zod";

// Report RPCs return jsonb, which the generated Supabase types surface as the
// loose `Json` type. These schemas are the contract the query layer validates
// that payload against rather than trusting it: a shape change in the
// database becomes a caught error, not a page that renders `undefined`.
//
// Numbers arrive as JSON numbers for integers and may arrive as strings for
// numeric(14,2) money columns depending on the driver, so money and rate
// fields are coerced. Rates stay nullable throughout -- null means "no data"
// and must never be flattened to 0.

const numeric = z.coerce.number();
const nullableNumeric = z.union([z.null(), z.coerce.number()]);

const reportWindow = {
  report_from: z.string(),
  report_to: z.string(),
  timezone: z.literal("Asia/Manila"),
};

const currencyTotal = z.object({
  currency: z.string(),
  total: numeric,
});

export const leadConversionSchema = z.object({
  ...reportWindow,
  leads_created: numeric,
  leads_converted_from_cohort: numeric,
  conversion_rate: nullableNumeric,
  conversions_in_period: numeric,
  won: numeric,
  lost: numeric,
  win_rate: nullableNumeric,
  won_not_converted: numeric,
  avg_days_to_convert: nullableNumeric,
  median_days_to_convert: nullableNumeric,
  funnel: z.array(z.object({ status: z.string(), total: numeric })),
});

export const leadSourceSchema = z.object({
  ...reportWindow,
  attribution_model: z.literal("first_touch"),
  sources: z.array(
    z.object({
      source: z.string(),
      lead_count: numeric,
      qualified_count: numeric,
      won_count: numeric,
      lost_count: numeric,
      converted_count: numeric,
      conversion_rate: nullableNumeric,
      avg_lead_score: nullableNumeric,
      attributed_paid_total: z.array(currencyTotal),
    }),
  ),
});

export const proposalWinRateSchema = z.object({
  ...reportWindow,
  sent: numeric,
  viewed: numeric,
  accepted: numeric,
  declined: numeric,
  expired: numeric,
  changes_requested: numeric,
  accepted_in_period: numeric,
  win_rate_decided: nullableNumeric,
  win_rate_sent: nullableNumeric,
  view_rate: nullableNumeric,
  avg_days_to_decision: nullableNumeric,
  value_by_currency: z.array(
    z.object({
      currency: z.string(),
      pipeline_total: numeric,
      won_total: numeric,
      avg_won_total: nullableNumeric,
    }),
  ),
});

export const revenueSchema = z.object({
  ...reportWindow,
  cohort_collection_rate_basis: z.literal("as_of_today"),
  collected_in_period: z.array(currencyTotal),
  invoice_cohort: z.array(
    z.object({
      currency: z.string(),
      cohort_billed: numeric,
      cohort_collected: numeric,
      cohort_outstanding: numeric,
      cohort_collection_rate: nullableNumeric,
    }),
  ),
  ledger_open: z.array(
    z.object({ currency: z.string(), outstanding: numeric, overdue: numeric }),
  ),
  monthly_series: z.array(
    z.object({ month: z.string(), currency: z.string(), collected: numeric }),
  ),
  top_clients: z.array(
    z.object({
      client_id: z.string(),
      business_name: z.string().nullable(),
      currency: z.string(),
      collected: numeric,
    }),
  ),
  provider_split: z.array(
    z.object({ provider: z.string(), currency: z.string(), collected: numeric }),
  ),
  refunded_count: numeric,
  mrr: z.array(currencyTotal),
  mrr_excluded_custom_cycle_count: numeric,
});

const statusBucket = z.object({ status: z.string(), total: numeric });

export const projectDeliverySchema = z.object({
  ...reportWindow,
  metric_label: z.string(),
  metric_caveat: z.string(),
  completed_in_period: numeric,
  schedule_on_time_rate: nullableNumeric,
  on_schedule_count: numeric,
  rated_count: numeric,
  no_target_date_count: numeric,
  avg_delivery_days: nullableNumeric,
  active_by_status: z.array(statusBucket),
  overdue_active_count: numeric,
  milestone_completion_rate: nullableNumeric,
  overdue_milestone_count: numeric,
  tasks_completed_in_period: numeric,
  open_tasks_by_status: z.array(statusBucket),
  progress_drift: z.array(
    z.object({
      project_id: z.string(),
      project_name: z.string(),
      stored_progress_percent: numeric,
      derived_progress_percent: numeric,
      drift: numeric,
    }),
  ),
});

/**
 * A report load is exactly one of three outcomes. `denied` and `error` are
 * kept distinct so the UI can say "you don't have access" rather than
 * "something broke", and neither ever carries database text.
 */
export type ReportResult<TData> =
  | { status: "ok"; data: TData }
  | { status: "denied" }
  | { status: "error" };

/** The RPCs' only P0001 is an authorization or input-validation refusal. */
const PERMISSION_DENIED_CODE = "P0001";

export interface ReportRpcError {
  code?: string | null;
}

/**
 * Maps a raw RPC outcome to a typed result. The payload is validated against
 * its schema; a shape mismatch is an `error`, never a partially-rendered page.
 *
 * The result union carries no message field, so leaking database text is
 * structurally impossible rather than merely discouraged.
 */
export function toReportResult<TSchema extends z.ZodType>(
  schema: TSchema,
  payload: unknown,
  error: ReportRpcError | null | undefined,
): ReportResult<z.infer<TSchema>> {
  if (error) {
    return error.code === PERMISSION_DENIED_CODE
      ? { status: "denied" }
      : { status: "error" };
  }

  const parsed = schema.safeParse(payload);
  return parsed.success ? { status: "ok", data: parsed.data } : { status: "error" };
}
