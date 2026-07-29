import { z } from "zod";

import { PROPOSAL_STATUSES } from "./constants.ts";

const optionalText = (max: number) => z.string().trim().max(max);

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

const positiveQuantityText = z
  .string()
  .trim()
  .refine(
    (value) => /^\d+(\.\d{1,2})?$/.test(value) && Number(value) > 0,
    "Enter a quantity greater than zero.",
  );

export const proposalIdSchema = z.uuid();

const proposalBaseFields = {
  title: z.string().trim().min(1, "Project title is required.").max(200),
  summary: optionalText(5000),
  scope: optionalText(5000),
  deliverables: optionalText(1500),
  timelineText: optionalText(2000),
  paymentTermsText: optionalText(3000),
  termsText: optionalText(5000),
  validUntil: optionalDateText,
  discount: nonNegativeAmountText,
  tax: nonNegativeAmountText,
};

export const proposalCreateSchema = z.object({
  leadId: z.uuid("Select a valid qualified lead."),
  ...proposalBaseFields,
});

export type ProposalCreateInput = z.input<typeof proposalCreateSchema>;

export const proposalEditSchema = z.object(proposalBaseFields);

export type ProposalEditInput = z.input<typeof proposalEditSchema>;

export const proposalFiltersSchema = z.object({
  query: z.string().trim().max(160).catch(""),
  status: z.union([z.literal(""), z.enum(PROPOSAL_STATUSES)]).catch(""),
  page: z.coerce.number().int().min(1).max(10000).catch(1),
});

export const proposalItemFormSchema = z.object({
  name: z.string().trim().min(1, "Item name is required.").max(200),
  description: optionalText(2000),
  quantity: positiveQuantityText,
  unitPrice: nonNegativeAmountText,
});

export type ProposalItemFormInput = z.input<typeof proposalItemFormSchema>;

export const requestProposalChangesSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "Describe the changes you would like to request.")
    .max(3000),
});

export type RequestProposalChangesInput = z.input<
  typeof requestProposalChangesSchema
>;
