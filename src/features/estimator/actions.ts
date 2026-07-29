"use server";

import { z } from "zod";

import type { ActionResult } from "@/features/leads/types";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

import { computeEstimateRange, type EstimateRange } from "./pricing";
import {
  estimatorCalculationSchema,
  estimatorLeadCaptureSchema,
} from "./schemas";

const GENERIC_ERROR =
  "We could not submit your details right now. Please wait a moment and try again.";
const SUCCESS_MESSAGE =
  "Thanks — Nexfora will review your estimate request and follow up if it's a fit.";

type SubmitProjectInquiryArgs =
  Database["public"]["Functions"]["submit_project_inquiry"]["Args"];

export type EstimateResult =
  | { ok: true; range: EstimateRange }
  | { ok: false; message: string };

/**
 * Server-controlled, non-final estimate calculation. Pricing rules live only
 * in src/features/estimator/pricing.ts and are never duplicated in UI code.
 */
export async function estimateProjectCostAction(
  input: unknown,
): Promise<EstimateResult> {
  const parsed = estimatorCalculationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Select a project type to see an indicative estimate.",
    };
  }

  const range = computeEstimateRange(parsed.data.projectType, parsed.data.features);
  return { ok: true, range };
}

function validationFailure(error: z.ZodError): ActionResult {
  return {
    ok: false,
    message: "Please correct the highlighted fields.",
    fieldErrors: error.flatten().fieldErrors,
  };
}

/**
 * Lead capture for the cost estimator. Reuses the exact same
 * submit_project_inquiry mechanism as /start-a-project (same anti-abuse
 * rate limiting, same lead creation path, same 'website' source), so no
 * separate lead pipeline or duplicate-prevention logic is introduced.
 */
export async function submitEstimatorLeadAction(
  input: unknown,
): Promise<ActionResult> {
  if (
    typeof input === "object" &&
    input !== null &&
    "companyWebsite" in input &&
    (input as { companyWebsite?: unknown }).companyWebsite
  ) {
    return { ok: true, message: SUCCESS_MESSAGE };
  }

  const parsed = estimatorLeadCaptureSchema.safeParse(input);
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }

  const range = computeEstimateRange(
    parsed.data.projectType,
    parsed.data.features,
  );

  try {
    const supabase = await createClient();
    const payload: SubmitProjectInquiryArgs = {
      inquiry_full_name: parsed.data.fullName,
      inquiry_business_name: parsed.data.businessName,
      inquiry_email: parsed.data.email,
      inquiry_phone: parsed.data.phone,
      inquiry_industry: "",
      inquiry_service_interest: parsed.data.projectType,
      inquiry_problem_summary: parsed.data.details,
      inquiry_requested_features: parsed.data.features,
      inquiry_target_timeline: parsed.data.targetTimeline,
      inquiry_budget_min: range.min,
      inquiry_budget_max: range.max,
    };
    const { error } = await supabase.rpc("submit_project_inquiry", payload);

    if (error) {
      console.error("Cost estimator lead submission failed.");
      return { ok: false, message: GENERIC_ERROR };
    }

    return { ok: true, message: SUCCESS_MESSAGE };
  } catch {
    console.error("Cost estimator lead submission failed.");
    return { ok: false, message: GENERIC_ERROR };
  }
}
