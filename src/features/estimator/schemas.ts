import { z } from "zod";

import {
  REQUESTED_FEATURES,
  SERVICE_INTERESTS,
  TIMELINE_OPTIONS,
} from "../leads/constants.ts";

export const estimatorCalculationSchema = z.object({
  projectType: z.enum(SERVICE_INTERESTS),
  features: z.array(z.enum(REQUESTED_FEATURES)).max(8),
});

export type EstimatorCalculationInput = z.input<
  typeof estimatorCalculationSchema
>;

export const estimatorLeadCaptureSchema = z
  .object({
    projectType: z.enum(SERVICE_INTERESTS),
    features: z.array(z.enum(REQUESTED_FEATURES)).max(8),
    details: z
      .string()
      .trim()
      .min(20, "Tell us a little more about the project.")
      .max(5000),
    fullName: z.string().trim().min(2, "Enter your full name.").max(120),
    businessName: z.string().trim().max(160),
    email: z
      .email("Enter a valid email address.")
      .trim()
      .max(254)
      .transform((value) => value.toLowerCase()),
    phone: z.string().trim().max(40),
    targetTimeline: z.enum(TIMELINE_OPTIONS),
    companyWebsite: z.string().max(0),
    startedAt: z.coerce.number().int().positive(),
  })
  .refine((value) => Date.now() - value.startedAt >= 1500, {
    path: ["startedAt"],
    message: "Please review the form before submitting.",
  });

export type EstimatorLeadCaptureInput = z.input<
  typeof estimatorLeadCaptureSchema
>;
