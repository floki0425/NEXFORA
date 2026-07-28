import { z } from "zod";

import {
  LEAD_SOURCES,
  LEAD_STATUSES,
  REQUESTED_FEATURES,
  SERVICE_INTERESTS,
  TIMELINE_OPTIONS,
} from "./constants.ts";
import {
  isValidBudgetRange,
  normalizeLeadCreateBudgets,
} from "./budget.ts";

const optionalText = (max: number) =>
  z.string().trim().max(max);

const optionalNumberText = z
  .string()
  .trim()
  .refine(
    (value) =>
      value === "" ||
      (/^\d+(\.\d{1,2})?$/.test(value) && Number(value) >= 0),
    "Enter a valid non-negative amount.",
  );

export const leadIdSchema = z.uuid();

export const leadFormSchema = z
  .object({
    fullName: z.string().trim().min(1, "Full name is required.").max(120),
    businessName: optionalText(160),
    email: z
      .email("Enter a valid email address.")
      .trim()
      .max(254)
      .transform((value) => value.toLowerCase()),
    phone: optionalText(40),
    industry: optionalText(120),
    serviceInterest: z
      .string()
      .trim()
      .min(1, "Service interest is required.")
      .max(120),
    problemSummary: optionalText(5000),
    requestedFeatures: z
      .string()
      .trim()
      .max(1500),
    budgetMin: optionalNumberText.optional(),
    budgetMax: optionalNumberText.optional(),
    targetTimeline: optionalText(120),
    source: z.enum(LEAD_SOURCES),
    sourceDetail: optionalText(500),
    leadScore: z
      .string()
      .trim()
      .refine(
        (value) =>
          value === "" ||
          (/^\d+$/.test(value) && Number(value) >= 0 && Number(value) <= 100),
        "Lead score must be from 0 to 100.",
      ),
    assignedTo: z.union([
      z.literal(""),
      z.uuid("Select a valid team member."),
    ]),
  })
  .superRefine((value, context) => {
    const budgets = normalizeLeadCreateBudgets(value);

    if (!isValidBudgetRange(budgets)) {
      context.addIssue({
        code: "custom",
        path: ["budgetMax"],
        message: "Maximum budget must be at least the minimum.",
      });
    }
  });

export type LeadFormInput = z.input<typeof leadFormSchema>;
export type LeadFormValues = z.output<typeof leadFormSchema>;

export const leadStatusSchema = z
  .object({
    status: z.enum(LEAD_STATUSES),
    lostReason: optionalText(500),
  })
  .superRefine((value, context) => {
    if (value.status === "lost" && !value.lostReason.trim()) {
      context.addIssue({
        code: "custom",
        path: ["lostReason"],
        message: "A reason is required when a lead is lost.",
      });
    }
  });

export const leadNoteSchema = z.object({
  note: z.string().trim().min(1, "Note cannot be empty.").max(5000),
});

export const leadFiltersSchema = z.object({
  query: z.string().trim().max(120).catch(""),
  status: z.union([z.literal(""), z.enum(LEAD_STATUSES)]).catch(""),
  source: z.union([z.literal(""), z.enum(LEAD_SOURCES)]).catch(""),
  assignedTo: z.union([z.literal(""), z.uuid()]).catch(""),
  page: z.coerce.number().int().min(1).max(10000).catch(1),
});

export const publicInquirySchema = z
  .object({
    fullName: z.string().trim().min(2, "Enter your full name.").max(120),
    businessName: z.string().trim().max(160),
    email: z
      .email("Enter a valid email address.")
      .trim()
      .max(254)
      .transform((value) => value.toLowerCase()),
    phone: z.string().trim().max(40),
    industry: z.string().trim().max(120),
    serviceInterest: z.enum(SERVICE_INTERESTS),
    problemSummary: z
      .string()
      .trim()
      .min(20, "Tell us a little more about the problem.")
      .max(5000),
    requestedFeatures: z.array(z.enum(REQUESTED_FEATURES)).max(8),
    budget: z.string().trim().min(1, "Choose a budget range."),
    targetTimeline: z.enum(TIMELINE_OPTIONS),
    companyWebsite: z.string().max(0),
    startedAt: z.coerce.number().int().positive(),
  })
  .refine((value) => Date.now() - value.startedAt >= 1500, {
    path: ["startedAt"],
    message: "Please review the form before submitting.",
  });

export type PublicInquiryInput = z.input<typeof publicInquirySchema>;
export type PublicInquiryValues = z.output<typeof publicInquirySchema>;
