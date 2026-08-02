import { z } from "zod";

import { INVOICE_STATUSES, PAYMENT_METHODS } from "./constants.ts";

const optionalText = (max: number) => z.string().trim().max(max);

const dateText = z
  .string()
  .trim()
  .refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value), "Enter a valid date.");

const optionalDateText = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value),
    "Enter a valid date.",
  );

const nonNegativeAmountText = z
  .string()
  .trim()
  .refine(
    (value) => /^\d+(\.\d{1,2})?$/.test(value) && Number(value) >= 0,
    "Enter a valid non-negative amount.",
  );

const positiveAmountText = z
  .string()
  .trim()
  .refine(
    (value) => /^\d+(\.\d{1,2})?$/.test(value) && Number(value) > 0,
    "Enter an amount greater than zero.",
  );

const positiveQuantityText = z
  .string()
  .trim()
  .refine(
    (value) => /^\d+(\.\d{1,2})?$/.test(value) && Number(value) > 0,
    "Enter a quantity greater than zero.",
  );

export const invoiceIdSchema = z.uuid();

export const invoiceCreateSchema = z.object({
  clientId: z.uuid("Select a valid client."),
  projectId: z.union([z.literal(""), z.uuid()]).catch(""),
  dueDate: optionalDateText,
  discount: nonNegativeAmountText,
  tax: nonNegativeAmountText,
  notes: optionalText(5000),
});

export type InvoiceCreateInput = z.input<typeof invoiceCreateSchema>;

export const invoiceEditSchema = z.object({
  dueDate: optionalDateText,
  discount: nonNegativeAmountText,
  tax: nonNegativeAmountText,
  notes: optionalText(5000),
});

export type InvoiceEditInput = z.input<typeof invoiceEditSchema>;

export const invoiceFiltersSchema = z.object({
  query: z.string().trim().max(160).catch(""),
  status: z.union([z.literal(""), z.enum(INVOICE_STATUSES)]).catch(""),
  page: z.coerce.number().int().min(1).max(10000).catch(1),
});

export const invoiceItemFormSchema = z.object({
  description: z
    .string()
    .trim()
    .min(1, "A description is required.")
    .max(2000),
  quantity: positiveQuantityText,
  unitPrice: nonNegativeAmountText,
});

export type InvoiceItemFormInput = z.input<typeof invoiceItemFormSchema>;

export const recordPaymentSchema = z.object({
  amount: positiveAmountText,
  paymentMethod: z.enum(PAYMENT_METHODS, "Choose a valid payment method."),
  paidDate: dateText,
  providerReference: optionalText(200),
  notes: optionalText(2000),
});

export type RecordPaymentInput = z.input<typeof recordPaymentSchema>;
