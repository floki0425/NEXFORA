"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireInternalMember } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

import { BUDGET_OPTIONS } from "./constants";
import {
  buildSubmitProjectInquiryBudgetArgs,
  isValidBudgetRange,
  normalizeLeadCreateBudgets,
  normalizeLeadUpdateBudgets,
  resolveLeadBudgetValues,
} from "./budget";
import { memberCanManageLeads } from "./permissions";
import {
  leadFormSchema,
  leadIdSchema,
  leadNoteSchema,
  leadStatusSchema,
  publicInquirySchema,
  type LeadFormInput,
  type PublicInquiryInput,
} from "./schemas";
import type { ActionResult } from "./types";

const GENERIC_ERROR =
  "We could not save your changes. Please review the form and try again.";
const INQUIRY_SUCCESS =
  "Thanks for reaching out. Your project details have been received, and the Nexfora team will follow up if the request is a fit.";

type LeadInsert = Database["public"]["Tables"]["leads"]["Insert"];
type LeadUpdate = Database["public"]["Tables"]["leads"]["Update"];
type SubmitProjectInquiryArgs =
  Database["public"]["Functions"]["submit_project_inquiry"]["Args"];

function validationFailure(error: z.ZodError): ActionResult {
  return {
    ok: false,
    message: "Please correct the highlighted fields.",
    fieldErrors: error.flatten().fieldErrors,
  };
}

function emptyToNull(value: string): string | null {
  return value === "" ? null : value;
}

function amountToNull(value: string): number | null {
  return value === "" ? null : Number(value);
}

function featuresFromText(value: string): string[] {
  return value
    .split(",")
    .map((feature) => feature.trim())
    .filter(Boolean)
    .slice(0, 30);
}

async function validateAssignee(
  organizationId: string,
  profileId: string | null,
): Promise<boolean> {
  if (!profileId) {
    return true;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_members")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", profileId)
    .eq("status", "active")
    .maybeSingle();

  return !error && Boolean(data);
}

export async function createLeadAction(
  input: LeadFormInput,
): Promise<ActionResult> {
  const parsed = leadFormSchema.safeParse(input);
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }

  try {
    const member = await requireInternalMember();
    if (!memberCanManageLeads(member)) {
      return { ok: false, message: "You do not have permission to create leads." };
    }

    const assignedTo = emptyToNull(parsed.data.assignedTo);
    if (!(await validateAssignee(member.organizationId, assignedTo))) {
      return {
        ok: false,
        message: "The selected assignee is not an active member of this organization.",
        fieldErrors: { assignedTo: ["Select a valid team member."] },
      };
    }

    const supabase = await createClient();
    const budgets = normalizeLeadCreateBudgets(parsed.data);
    const lead: LeadInsert = {
      organization_id: member.organizationId,
      full_name: parsed.data.fullName,
      business_name: emptyToNull(parsed.data.businessName),
      email: parsed.data.email,
      phone: emptyToNull(parsed.data.phone),
      industry: emptyToNull(parsed.data.industry),
      service_interest: parsed.data.serviceInterest,
      problem_summary: emptyToNull(parsed.data.problemSummary),
      requested_features: featuresFromText(parsed.data.requestedFeatures),
      budget_min: budgets.budget_min,
      budget_max: budgets.budget_max,
      target_timeline: emptyToNull(parsed.data.targetTimeline),
      source: parsed.data.source,
      source_detail: emptyToNull(parsed.data.sourceDetail),
      status: "new",
      lead_score: amountToNull(parsed.data.leadScore),
      assigned_to: assignedTo,
      lost_reason: null,
    };
    const { data, error } = await supabase
      .from("leads")
      .insert(lead)
      .select("id")
      .single();

    if (error || !data) {
      console.error("Lead creation failed.");
      return { ok: false, message: GENERIC_ERROR };
    }

    revalidatePath("/admin/leads");
    redirect(`/admin/leads/${data.id}`);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "digest" in error &&
      typeof error.digest === "string" &&
      error.digest.startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }

    console.error("Lead creation authorization or persistence failed.");
    return { ok: false, message: GENERIC_ERROR };
  }
}

export async function updateLeadAction(
  leadId: string,
  input: LeadFormInput,
): Promise<ActionResult> {
  const idResult = leadIdSchema.safeParse(leadId);
  const parsed = leadFormSchema.safeParse(input);
  if (!idResult.success || !parsed.success) {
    return parsed.success
      ? { ok: false, message: "This lead could not be found." }
      : validationFailure(parsed.error);
  }

  try {
    const member = await requireInternalMember();
    if (!memberCanManageLeads(member)) {
      return { ok: false, message: "You do not have permission to update leads." };
    }

    const assignedTo = emptyToNull(parsed.data.assignedTo);
    if (!(await validateAssignee(member.organizationId, assignedTo))) {
      return {
        ok: false,
        message: "The selected assignee is not an active member of this organization.",
        fieldErrors: { assignedTo: ["Select a valid team member."] },
      };
    }

    const supabase = await createClient();
    const { data: existing } = await supabase
      .from("leads")
      .select("id, assigned_to, budget_min, budget_max")
      .eq("id", idResult.data)
      .eq("organization_id", member.organizationId)
      .maybeSingle();

    if (!existing) {
      return { ok: false, message: "This lead could not be found." };
    }

    const budgetUpdates = normalizeLeadUpdateBudgets(parsed.data);
    const effectiveBudgets = resolveLeadBudgetValues(
      {
        budget_min: existing.budget_min,
        budget_max: existing.budget_max,
      },
      budgetUpdates,
    );

    if (!isValidBudgetRange(effectiveBudgets)) {
      return {
        ok: false,
        message: "Please correct the highlighted fields.",
        fieldErrors: {
          budgetMax: [
            "Maximum budget must be at least the minimum.",
          ],
        },
      };
    }

    const updates: LeadUpdate = {
      full_name: parsed.data.fullName,
      business_name: emptyToNull(parsed.data.businessName),
      email: parsed.data.email,
      phone: emptyToNull(parsed.data.phone),
      industry: emptyToNull(parsed.data.industry),
      service_interest: parsed.data.serviceInterest,
      problem_summary: emptyToNull(parsed.data.problemSummary),
      requested_features: featuresFromText(parsed.data.requestedFeatures),
      ...budgetUpdates,
      target_timeline: emptyToNull(parsed.data.targetTimeline),
      source: parsed.data.source,
      source_detail: emptyToNull(parsed.data.sourceDetail),
      lead_score: amountToNull(parsed.data.leadScore),
      assigned_to: assignedTo,
    };
    const { data, error } = await supabase
      .from("leads")
      .update(updates)
      .eq("id", idResult.data)
      .eq("organization_id", member.organizationId)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      console.error("Lead update failed.");
      return { ok: false, message: GENERIC_ERROR };
    }

    revalidatePath("/admin/leads");
    revalidatePath(`/admin/leads/${data.id}`);
    redirect(`/admin/leads/${data.id}`);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "digest" in error &&
      typeof error.digest === "string" &&
      error.digest.startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }

    console.error("Lead update authorization or persistence failed.");
    return { ok: false, message: GENERIC_ERROR };
  }
}

export async function updateLeadStatusAction(
  leadId: string,
  input: unknown,
): Promise<ActionResult> {
  const idResult = leadIdSchema.safeParse(leadId);
  const parsed = leadStatusSchema.safeParse(input);
  if (!idResult.success || !parsed.success) {
    return parsed.success
      ? { ok: false, message: "This lead could not be found." }
      : validationFailure(parsed.error);
  }

  try {
    const member = await requireInternalMember();
    if (!memberCanManageLeads(member)) {
      return { ok: false, message: "You do not have permission to change status." };
    }

    const supabase = await createClient();
    const { data: existing } = await supabase
      .from("leads")
      .select("id, status")
      .eq("id", idResult.data)
      .eq("organization_id", member.organizationId)
      .maybeSingle();

    if (!existing) {
      return { ok: false, message: "This lead could not be found." };
    }

    const { data, error } = await supabase
      .from("leads")
      .update({
        status: parsed.data.status,
        lost_reason:
          parsed.data.status === "lost" ? parsed.data.lostReason : null,
      })
      .eq("id", idResult.data)
      .eq("organization_id", member.organizationId)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      return { ok: false, message: GENERIC_ERROR };
    }

    revalidatePath("/admin/leads");
    revalidatePath(`/admin/leads/${data.id}`);
    return { ok: true, message: "Lead status updated." };
  } catch {
    console.error("Lead status update failed.");
    return { ok: false, message: GENERIC_ERROR };
  }
}

export async function addLeadNoteAction(
  leadId: string,
  input: unknown,
): Promise<ActionResult> {
  const idResult = leadIdSchema.safeParse(leadId);
  const parsed = leadNoteSchema.safeParse(input);
  if (!idResult.success || !parsed.success) {
    return parsed.success
      ? { ok: false, message: "This lead could not be found." }
      : validationFailure(parsed.error);
  }

  try {
    const member = await requireInternalMember();
    if (!memberCanManageLeads(member)) {
      return { ok: false, message: "You do not have permission to add notes." };
    }

    const supabase = await createClient();
    const { data: lead } = await supabase
      .from("leads")
      .select("id")
      .eq("id", idResult.data)
      .eq("organization_id", member.organizationId)
      .maybeSingle();

    if (!lead) {
      return { ok: false, message: "This lead could not be found." };
    }

    const { error } = await supabase.from("lead_activities").insert({
      organization_id: member.organizationId,
      lead_id: lead.id,
      activity_type: "note_added",
      title: "Note added",
      description: parsed.data.note,
      created_by: member.profileId,
    });

    if (error) {
      return { ok: false, message: GENERIC_ERROR };
    }

    revalidatePath(`/admin/leads/${lead.id}`);
    return { ok: true, message: "Note added." };
  } catch {
    console.error("Lead note creation failed.");
    return { ok: false, message: GENERIC_ERROR };
  }
}

export async function submitProjectInquiryAction(
  input: PublicInquiryInput,
): Promise<ActionResult> {
  if (
    typeof input === "object" &&
    input !== null &&
    "companyWebsite" in input &&
    input.companyWebsite
  ) {
    return { ok: true, message: INQUIRY_SUCCESS };
  }

  const parsed = publicInquirySchema.safeParse(input);
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }

  const budget = BUDGET_OPTIONS.find(
    (option) => option.label === parsed.data.budget,
  );
  if (!budget) {
    return {
      ok: false,
      message: "Please correct the highlighted fields.",
      fieldErrors: { budget: ["Choose a valid budget range."] },
    };
  }

  try {
    const supabase = await createClient();
    const budgets = normalizeLeadCreateBudgets({
      budgetMin: budget.min,
      budgetMax: budget.max,
    });
    const inquiryPayload: SubmitProjectInquiryArgs = {
      inquiry_full_name: parsed.data.fullName,
      inquiry_business_name: parsed.data.businessName,
      inquiry_email: parsed.data.email,
      inquiry_phone: parsed.data.phone,
      inquiry_industry: parsed.data.industry,
      inquiry_service_interest: parsed.data.serviceInterest,
      inquiry_problem_summary: parsed.data.problemSummary,
      inquiry_requested_features: parsed.data.requestedFeatures,
      inquiry_target_timeline: parsed.data.targetTimeline,
      ...buildSubmitProjectInquiryBudgetArgs(budgets),
    };
    const { error } = await supabase.rpc(
      "submit_project_inquiry",
      inquiryPayload,
    );

    if (error) {
      console.error("Public project inquiry submission failed.");
      return {
        ok: false,
        message:
          "We could not submit the inquiry right now. Please wait a moment and try again.",
      };
    }

    return { ok: true, message: INQUIRY_SUCCESS };
  } catch {
    console.error("Public project inquiry submission failed.");
    return {
      ok: false,
      message:
        "We could not submit the inquiry right now. Please wait a moment and try again.",
    };
  }
}
