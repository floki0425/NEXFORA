import { z } from "zod";

import {
  BILLING_CYCLES,
  SUBSCRIPTION_CREATE_STATUSES,
  SUBSCRIPTION_STATUSES,
} from "./constants.ts";

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

const dateText = z
  .string()
  .trim()
  .refine(isCalendarDate, "Enter a valid date.");

const optionalDateText = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || isCalendarDate(value),
    "Enter a valid date.",
  );

const nonNegativeAmountText = z
  .string()
  .trim()
  .refine(
    (value) =>
      /^\d+(\.\d{1,2})?$/.test(value) &&
      Number(value) >= 0 &&
      Number(value) <= 999999999999.99,
    "Enter a valid non-negative amount with no more than two decimals.",
  );

const optionalIncludedHoursText = z
  .string()
  .trim()
  .refine(
    (value) =>
      value === "" ||
      (/^\d+(\.\d{1,2})?$/.test(value) &&
        Number(value) >= 0 &&
        Number(value) <= 999999.99),
    "Enter zero or more hours with no more than two decimals.",
  );

const positiveHoursText = z
  .string()
  .trim()
  .refine(
    (value) =>
      /^\d+(\.\d{1,2})?$/.test(value) &&
      Number(value) > 0 &&
      Number(value) <= 1000,
    "Enter more than zero and no more than 1,000 hours.",
  );

const editableSubscriptionFields = {
  planName: z
    .string()
    .trim()
    .min(1, "A plan name is required.")
    .max(160),
  status: z.enum(SUBSCRIPTION_STATUSES, "Choose a valid status."),
  billingCycle: z.enum(BILLING_CYCLES, "Choose a valid billing cycle."),
  amount: nonNegativeAmountText,
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Use a three-letter currency code."),
  includedHours: optionalIncludedHoursText,
  startedAt: optionalDateText,
  renewalAt: optionalDateText,
  notes: z.string().trim().max(5000),
};

export const subscriptionIdSchema = z.uuid();

export const subscriptionCreateSchema = z.object({
  clientId: z.uuid("Select a valid client."),
  projectId: z.union([z.literal(""), z.uuid()]),
  ...editableSubscriptionFields,
  status: z.enum(SUBSCRIPTION_CREATE_STATUSES, "Choose a valid initial status."),
});

export type SubscriptionCreateInput = z.input<
  typeof subscriptionCreateSchema
>;

export const subscriptionEditSchema = z.object(editableSubscriptionFields);

export type SubscriptionEditInput = z.input<typeof subscriptionEditSchema>;

export const subscriptionUsageSchema = z.object({
  description: z
    .string()
    .trim()
    .min(1, "A description is required.")
    .max(2000),
  hoursUsed: positiveHoursText,
  usageDate: dateText,
});

export type SubscriptionUsageInput = z.input<typeof subscriptionUsageSchema>;

export const subscriptionFiltersSchema = z.object({
  query: z.string().trim().max(160).catch(""),
  status: z.union([z.literal(""), z.enum(SUBSCRIPTION_STATUSES)]).catch(""),
  page: z.coerce.number().int().min(1).max(10000).catch(1),
});
