"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireInternalMember } from "@/lib/auth/server";

import type {
  SubscriptionInsert,
  SubscriptionUpdate,
  SubscriptionUsageInsert,
} from "./database";
import { createSubscriptionClient } from "./database";
import { dateInputToTimestamp } from "./format";
import {
  memberCanManageSubscriptions,
  memberCanRecordSubscriptionUsage,
} from "./permissions";
import {
  subscriptionCreateSchema,
  subscriptionEditSchema,
  subscriptionIdSchema,
  subscriptionUsageSchema,
} from "./schemas";
import type { SubscriptionActionResult } from "./types";

const GENERIC_ERROR =
  "We could not save this maintenance subscription. Please try again.";
const USAGE_ERROR =
  "We could not record this maintenance usage. Please try again.";

function validationFailure(error: z.ZodError): SubscriptionActionResult {
  return {
    ok: false,
    message: "Please correct the highlighted fields.",
    fieldErrors: error.flatten().fieldErrors,
  };
}

function emptyToNull(value: string): string | null {
  return value === "" ? null : value;
}

function optionalHours(value: string): number | null {
  return value === "" ? null : Number(value);
}

function isRedirectError(error: unknown): error is { digest: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof error.digest === "string" &&
    error.digest.startsWith("NEXT_REDIRECT")
  );
}

async function validateClientAndProject(
  organizationId: string,
  clientId: string,
  projectId: string,
): Promise<SubscriptionActionResult | null> {
  const supabase = await createSubscriptionClient();
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .maybeSingle();

  if (clientError || !client) {
    return {
      ok: false,
      message: "Select a valid client in your organization.",
      fieldErrors: { clientId: ["This client is not available."] },
    };
  }

  if (!projectId) {
    return null;
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("organization_id", organizationId)
    .eq("client_id", clientId)
    .maybeSingle();

  if (projectError || !project) {
    return {
      ok: false,
      message: "Select a project that belongs to this client.",
      fieldErrors: { projectId: ["This project is not available."] },
    };
  }

  return null;
}

export async function createSubscriptionAction(
  input: unknown,
): Promise<SubscriptionActionResult> {
  const parsed = subscriptionCreateSchema.safeParse(input);
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }

  try {
    const member = await requireInternalMember();
    if (!memberCanManageSubscriptions(member)) {
      return {
        ok: false,
        message: "You do not have permission to create maintenance subscriptions.",
      };
    }

    const relationshipError = await validateClientAndProject(
      member.organizationId,
      parsed.data.clientId,
      parsed.data.projectId,
    );
    if (relationshipError) {
      return relationshipError;
    }

    const subscription: SubscriptionInsert = {
      organization_id: member.organizationId,
      client_id: parsed.data.clientId,
      project_id: emptyToNull(parsed.data.projectId),
      plan_name: parsed.data.planName,
      status: parsed.data.status,
      billing_cycle: parsed.data.billingCycle,
      amount: Number(parsed.data.amount),
      currency: parsed.data.currency,
      included_hours: optionalHours(parsed.data.includedHours),
      notes: emptyToNull(parsed.data.notes),
      started_at: dateInputToTimestamp(parsed.data.startedAt),
      renewal_at: dateInputToTimestamp(parsed.data.renewalAt),
      created_by: member.profileId,
    };

    const supabase = await createSubscriptionClient();
    const { data, error } = await supabase
      .from("subscriptions")
      .insert(subscription)
      .select("id")
      .single();

    if (error || !data) {
      console.error("Maintenance subscription creation failed.");
      return { ok: false, message: GENERIC_ERROR };
    }

    revalidatePath("/admin/subscriptions");
    revalidatePath("/portal/subscriptions");
    redirect(`/admin/subscriptions/${data.id}`);
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    console.error(
      "Maintenance subscription creation authorization or persistence failed.",
    );
    return { ok: false, message: GENERIC_ERROR };
  }
}

export async function updateSubscriptionAction(
  subscriptionId: string,
  input: unknown,
): Promise<SubscriptionActionResult> {
  const idResult = subscriptionIdSchema.safeParse(subscriptionId);
  const parsed = subscriptionEditSchema.safeParse(input);
  if (!idResult.success || !parsed.success) {
    return parsed.success
      ? { ok: false, message: "This maintenance subscription could not be found." }
      : validationFailure(parsed.error);
  }

  try {
    const member = await requireInternalMember();
    if (!memberCanManageSubscriptions(member)) {
      return {
        ok: false,
        message: "You do not have permission to update maintenance subscriptions.",
      };
    }

    const supabase = await createSubscriptionClient();
    const { data: existing, error: existingError } = await supabase
      .from("subscriptions")
      .select("id, cancelled_at")
      .eq("id", idResult.data)
      .eq("organization_id", member.organizationId)
      .maybeSingle();

    if (existingError || !existing) {
      return {
        ok: false,
        message: "This maintenance subscription could not be found.",
      };
    }

    const updates: SubscriptionUpdate = {
      plan_name: parsed.data.planName,
      status: parsed.data.status,
      billing_cycle: parsed.data.billingCycle,
      amount: Number(parsed.data.amount),
      currency: parsed.data.currency,
      included_hours: optionalHours(parsed.data.includedHours),
      notes: emptyToNull(parsed.data.notes),
      started_at: dateInputToTimestamp(parsed.data.startedAt),
      renewal_at: dateInputToTimestamp(parsed.data.renewalAt),
      cancelled_at:
        parsed.data.status === "cancelled"
          ? (existing.cancelled_at ?? new Date().toISOString())
          : null,
    };

    const { data, error } = await supabase
      .from("subscriptions")
      .update(updates)
      .eq("id", idResult.data)
      .eq("organization_id", member.organizationId)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      console.error("Maintenance subscription update failed.");
      return { ok: false, message: GENERIC_ERROR };
    }

    revalidatePath("/admin/subscriptions");
    revalidatePath(`/admin/subscriptions/${idResult.data}`);
    revalidatePath("/portal/subscriptions");
    revalidatePath(`/portal/subscriptions/${idResult.data}`);
    return {
      ok: true,
      message: "Maintenance subscription updated.",
      subscriptionId: idResult.data,
    };
  } catch {
    console.error(
      "Maintenance subscription update authorization or persistence failed.",
    );
    return { ok: false, message: GENERIC_ERROR };
  }
}

export async function recordSubscriptionUsageAction(
  subscriptionId: string,
  input: unknown,
): Promise<SubscriptionActionResult> {
  const idResult = subscriptionIdSchema.safeParse(subscriptionId);
  const parsed = subscriptionUsageSchema.safeParse(input);
  if (!idResult.success || !parsed.success) {
    return parsed.success
      ? { ok: false, message: "This maintenance subscription could not be found." }
      : validationFailure(parsed.error);
  }

  try {
    const member = await requireInternalMember();
    if (!memberCanRecordSubscriptionUsage(member)) {
      return {
        ok: false,
        message: "You do not have permission to record maintenance usage.",
      };
    }

    const supabase = await createSubscriptionClient();
    const { data: subscription, error: subscriptionError } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("id", idResult.data)
      .eq("organization_id", member.organizationId)
      .maybeSingle();

    if (subscriptionError || !subscription) {
      return {
        ok: false,
        message: "This maintenance subscription could not be found.",
      };
    }

    const usage: SubscriptionUsageInsert = {
      organization_id: member.organizationId,
      subscription_id: idResult.data,
      description: parsed.data.description,
      hours_used: Number(parsed.data.hoursUsed),
      usage_date: parsed.data.usageDate,
      recorded_by: member.profileId,
    };

    const { error } = await supabase.from("subscription_usage").insert(usage);
    if (error) {
      console.error("Maintenance usage creation failed.");
      return { ok: false, message: USAGE_ERROR };
    }

    revalidatePath("/admin/subscriptions");
    revalidatePath(`/admin/subscriptions/${idResult.data}`);
    revalidatePath("/portal/subscriptions");
    revalidatePath(`/portal/subscriptions/${idResult.data}`);
    return {
      ok: true,
      message: "Maintenance usage recorded.",
      subscriptionId: idResult.data,
    };
  } catch {
    console.error(
      "Maintenance usage authorization or persistence failed.",
    );
    return { ok: false, message: USAGE_ERROR };
  }
}
