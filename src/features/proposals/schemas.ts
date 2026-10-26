import { z } from "zod";

import {
  isAllowedProposalAttachmentExtension,
  MAX_FILE_SIZE_BYTES,
  PROPOSAL_ATTACHMENT_MIME_TYPE,
} from "../../lib/storage/proposal-attachments.ts";

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

export const uploadProposalAttachmentFieldsSchema = z.object({
  // Client-generated once per upload attempt and resent unchanged on retry —
  // never trusted for authorization, only for idempotency (see
  // buildProposalAttachmentStoragePath).
  idempotencyKey: z.uuid(),
});

export interface ProposalAttachmentValidationError {
  ok: false;
  message: string;
}

export interface ProposalAttachmentValidationSuccess {
  ok: true;
}

/**
 * Validates the uploaded attachment before it is read into memory. file.size
 * and file.type come from the browser's File metadata, so both are re-checked
 * server-side against the real buffer (length, and a magic-byte signature
 * check) before anything is written to storage.
 */
export function validateUploadedProposalAttachment(
  file: File,
): ProposalAttachmentValidationError | ProposalAttachmentValidationSuccess {
  if (file.size <= 0) {
    return { ok: false, message: "Choose a PDF file to upload." };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      ok: false,
      message: `This file is too large. The maximum size is ${Math.floor(
        MAX_FILE_SIZE_BYTES / (1024 * 1024),
      )} MB.`,
    };
  }

  if (!isAllowedProposalAttachmentExtension(file.name)) {
    return {
      ok: false,
      message: "Only PDF files can be attached to a proposal.",
    };
  }

  if (file.type && file.type !== PROPOSAL_ATTACHMENT_MIME_TYPE) {
    return {
      ok: false,
      message: "Only PDF files can be attached to a proposal.",
    };
  }

  return { ok: true };
}

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
