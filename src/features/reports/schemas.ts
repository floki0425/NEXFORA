import { z } from "zod";

import { REPORT_RANGE_PRESETS } from "@/lib/reporting/date-range";

import { ACTIVE_PROJECT_STATUSES, LEAD_SOURCES } from "./constants.ts";

const DATE_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Filter schemas parse untrusted URL search params, so every field carries a
 * `.catch()` default AND the object itself carries one. The result never
 * throws for any input -- including a non-object -- so a malformed query
 * string degrades to the default view instead of crashing the route. This
 * matches leadFiltersSchema and the seven other filter schemas in this
 * repository.
 *
 * Only shape is guaranteed here. Calendar validity (rejecting 2026-02-30)
 * and the 366-day cap belong to resolveReportRange in
 * src/lib/reporting/date-range.ts, which owns every date decision.
 */
const dateInput = z.string().trim().regex(DATE_INPUT_PATTERN).catch("");

const uuidInput = z.union([z.literal(""), z.uuid()]).catch("");

const reportFiltersObject = z.object({
  preset: z.enum(REPORT_RANGE_PRESETS).catch("last_30_days"),
  from: dateInput,
  to: dateInput,
});

const REPORT_FILTERS_DEFAULTS = {
  preset: "last_30_days",
  from: "",
  to: "",
} as const;

export const reportFiltersSchema = reportFiltersObject.catch(
  REPORT_FILTERS_DEFAULTS,
);

export type ReportFilters = z.infer<typeof reportFiltersObject>;

const leadConversionFiltersObject = reportFiltersObject.extend({
  source: z.union([z.literal(""), z.enum(LEAD_SOURCES)]).catch(""),
  assignedTo: uuidInput,
});

export const leadConversionFiltersSchema = leadConversionFiltersObject.catch({
  ...REPORT_FILTERS_DEFAULTS,
  source: "",
  assignedTo: "",
});

export type LeadConversionFilters = z.infer<typeof leadConversionFiltersObject>;

const leadSourceFiltersObject = reportFiltersObject.extend({
  assignedTo: uuidInput,
});

export const leadSourceFiltersSchema = leadSourceFiltersObject.catch({
  ...REPORT_FILTERS_DEFAULTS,
  assignedTo: "",
});

export type LeadSourceFilters = z.infer<typeof leadSourceFiltersObject>;

const proposalWinRateFiltersObject = reportFiltersObject.extend({
  createdBy: uuidInput,
});

export const proposalWinRateFiltersSchema = proposalWinRateFiltersObject.catch({
  ...REPORT_FILTERS_DEFAULTS,
  createdBy: "",
});

export type ProposalWinRateFilters = z.infer<typeof proposalWinRateFiltersObject>;

const revenueFiltersObject = reportFiltersObject.extend({
  clientId: uuidInput,
});

export const revenueFiltersSchema = revenueFiltersObject.catch({
  ...REPORT_FILTERS_DEFAULTS,
  clientId: "",
});

export type RevenueFilters = z.infer<typeof revenueFiltersObject>;

const projectDeliveryFiltersObject = reportFiltersObject.extend({
  status: z.union([z.literal(""), z.enum(ACTIVE_PROJECT_STATUSES)]).catch(""),
  projectManagerId: uuidInput,
  clientId: uuidInput,
});

export const projectDeliveryFiltersSchema = projectDeliveryFiltersObject.catch({
  ...REPORT_FILTERS_DEFAULTS,
  status: "",
  projectManagerId: "",
  clientId: "",
});

export type ProjectDeliveryFilters = z.infer<typeof projectDeliveryFiltersObject>;
