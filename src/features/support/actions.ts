"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireInternalMember } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";

import {
  SUPPORT_INTERNAL_TRANSITIONS,
  type SupportTicketStatus,
} from "./constants";
import {
  canAssignSupportTicket,
  canCreateInternalSupportTicket,
  canTransitionSupportTicket,
} from "./permissions";
import {
  internalSupportTicketCreateSchema,
  supportTicketAssignSchema,
  supportTicketIdSchema,
  supportTicketTransitionSchema,
} from "./schemas";
import { asSupportSupabaseClient } from "./supabase";
import type { SupportActionResult } from "./types";
import { hasSupportProjectAccess } from "./queries";

const GENERIC_ERROR =
  "We could not save this support ticket. Please try again.";

const SAFE_RPC_MESSAGES = new Set([
  "Authentication is required.",
  "An active client membership is required.",
  "You do not have permission to create support tickets.",
  "You do not have permission to open support tickets for this client.",
  "You do not have permission to update this ticket.",
  "This client could not be found.",
  "This project could not be found.",
  "This project could not be found for the selected client.",
  "This ticket could not be found.",
  "This ticket could not be found or you do not have permission to update it.",
  "A title is required.",
  "A title is required and must be 200 characters or fewer.",
  "A description is required.",
  "A description is required and must be 5000 characters or fewer.",
  "Choose a valid priority.",
  "The category must be 60 characters or fewer.",
  "This status cannot be set directly.",
  "That status change is not allowed from the current status.",
  "A resolution note is required when resolving a ticket.",
  "The resolution note must be 3000 characters or fewer.",
  "Assign this ticket to a team member before marking it assigned.",
]);

interface RpcError {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

function validationFailure(error: z.ZodError): SupportActionResult {
  return {
    ok: false,
    message: "Please correct the highlighted fields.",
    fieldErrors: error.flatten().fieldErrors,
  };
}

function safeRpcMessage(
  error: RpcError | null | undefined,
  fallback = GENERIC_ERROR,
): string {
  return error?.message && SAFE_RPC_MESSAGES.has(error.message)
    ? error.message
    : fallback;
}

function logRpcDiagnostics(operation: string, error: RpcError | null): void {
  if (process.env.NODE_ENV !== "production") {
    console.error(`${operation} Supabase error`, {
      code: error?.code,
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
    });
  }
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

async function getOwnedTicketContext(
  organizationId: string,
  ticketId: string,
): Promise<{
  id: string;
  status: SupportTicketStatus;
  assignedTo: string | null;
  projectId: string | null;
} | null> {
  const supabase = asSupportSupabaseClient(await createClient());
  const { data, error } = await supabase
    .from("support_tickets")
    .select("id, status, assigned_to, project_id")
    .eq("organization_id", organizationId)
    .eq("id", ticketId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    status: data.status as SupportTicketStatus,
    assignedTo: data.assigned_to,
    projectId: data.project_id,
  };
}

function revalidateSupportTicket(ticketId: string): void {
  revalidatePath("/admin/support");
  revalidatePath(`/admin/support/${ticketId}`);
  revalidatePath("/portal/support");
  revalidatePath(`/portal/support/${ticketId}`);
}

export async function createInternalSupportTicketAction(
  input: unknown,
): Promise<SupportActionResult> {
  const parsed = internalSupportTicketCreateSchema.safeParse(input);
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }

  try {
    const member = await requireInternalMember();
    if (!canCreateInternalSupportTicket(member)) {
      return {
        ok: false,
        message: "You do not have permission to create support tickets.",
      };
    }

    const supabase = await createClient();
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id")
      .eq("id", parsed.data.clientId)
      .eq("organization_id", member.organizationId)
      .eq("status", "active")
      .maybeSingle();

    if (clientError || !client) {
      return {
        ok: false,
        message: "Select a valid client in your organization.",
        fieldErrors: { clientId: ["This client is not available."] },
      };
    }

    if (parsed.data.projectId) {
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .select("id")
        .eq("id", parsed.data.projectId)
        .eq("organization_id", member.organizationId)
        .eq("client_id", parsed.data.clientId)
        .maybeSingle();

      if (projectError || !project) {
        return {
          ok: false,
          message: "Select a project that belongs to this client.",
          fieldErrors: { projectId: ["This project is not available."] },
        };
      }
    }

    // The support-scoped additive schema view keeps this new RPC typed until
    // the verified remote schema is used to regenerate repository types.
    const supportRpc = asSupportSupabaseClient(supabase);
    const { data, error } = await supportRpc.rpc(
      "create_internal_support_ticket",
      {
        target_client_id: parsed.data.clientId,
        p_title: parsed.data.title,
        p_description: parsed.data.description,
        p_priority: parsed.data.priority,
        p_category: parsed.data.category,
        ...(parsed.data.projectId
          ? { target_project_id: parsed.data.projectId }
          : {}),
      },
    );

    const createdTicket = data?.[0];
    if (error || !createdTicket) {
      logRpcDiagnostics("createInternalSupportTicketAction", error);
      return { ok: false, message: safeRpcMessage(error) };
    }

    revalidatePath("/admin/support");
    redirect(`/admin/support/${createdTicket.id}`);
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    console.error("Support ticket creation authorization or persistence failed.");
    return { ok: false, message: GENERIC_ERROR };
  }
}

export async function assignSupportTicketAction(
  ticketId: string,
  input: unknown,
): Promise<SupportActionResult> {
  const idResult = supportTicketIdSchema.safeParse(ticketId);
  const parsed = supportTicketAssignSchema.safeParse(input);
  if (!idResult.success || !parsed.success) {
    return parsed.success
      ? { ok: false, message: "This support ticket could not be found." }
      : validationFailure(parsed.error);
  }

  try {
    const member = await requireInternalMember();
    const ticket = await getOwnedTicketContext(
      member.organizationId,
      idResult.data,
    );
    if (!ticket) {
      return { ok: false, message: "This support ticket could not be found." };
    }

    const hasProjectAccess = await hasSupportProjectAccess(
      member.organizationId,
      ticket.projectId,
      member.profileId,
    );
    if (
      !canAssignSupportTicket(member, {
        assignedTo: ticket.assignedTo,
        hasProjectAccess,
      })
    ) {
      return {
        ok: false,
        message: "You do not have permission to assign support tickets.",
      };
    }

    const assigneeId = parsed.data.assigneeId || null;
    const supabase = await createClient();

    if (assigneeId) {
      const { data: membership, error: membershipError } = await supabase
        .from("organization_members")
        .select("id")
        .eq("organization_id", member.organizationId)
        .eq("user_id", assigneeId)
        .eq("status", "active")
        .maybeSingle();

      if (membershipError || !membership) {
        return {
          ok: false,
          message: "Select an active member of this organization.",
          fieldErrors: { assigneeId: ["This team member is not available."] },
        };
      }
    }

    const supportSupabase = asSupportSupabaseClient(supabase);
    const { data: updatedTicket, error } = await supportSupabase
      .from("support_tickets")
      .update({ assigned_to: assigneeId })
      .eq("organization_id", member.organizationId)
      .eq("id", ticket.id)
      .select("id")
      .maybeSingle();

    if (error || !updatedTicket) {
      console.error("Support ticket assignment failed.");
      return { ok: false, message: GENERIC_ERROR };
    }

    revalidateSupportTicket(ticket.id);
    return { ok: true, message: "Ticket assignment updated." };
  } catch {
    console.error("Support ticket assignment authorization or persistence failed.");
    return { ok: false, message: GENERIC_ERROR };
  }
}

export async function transitionSupportTicketAction(
  ticketId: string,
  input: unknown,
): Promise<SupportActionResult> {
  const idResult = supportTicketIdSchema.safeParse(ticketId);
  const parsed = supportTicketTransitionSchema.safeParse(input);
  if (!idResult.success || !parsed.success) {
    return parsed.success
      ? { ok: false, message: "This support ticket could not be found." }
      : validationFailure(parsed.error);
  }

  try {
    const member = await requireInternalMember();
    const ticket = await getOwnedTicketContext(
      member.organizationId,
      idResult.data,
    );
    if (!ticket) {
      return { ok: false, message: "This support ticket could not be found." };
    }

    const hasProjectAccess = await hasSupportProjectAccess(
      member.organizationId,
      ticket.projectId,
      member.profileId,
    );
    if (
      !canTransitionSupportTicket(member, {
        assignedTo: ticket.assignedTo,
        hasProjectAccess,
      })
    ) {
      return {
        ok: false,
        message: "You do not have permission to update this support ticket.",
      };
    }

    if (!SUPPORT_INTERNAL_TRANSITIONS[ticket.status].includes(parsed.data.status)) {
      return {
        ok: false,
        message: "That status change is not allowed from the current status.",
      };
    }

    if (parsed.data.status === "assigned" && !ticket.assignedTo) {
      return {
        ok: false,
        message: "Assign this ticket before marking it assigned.",
      };
    }

    const supabase = asSupportSupabaseClient(await createClient());
    const { error } = await supabase.rpc("transition_ticket_status", {
      target_ticket_id: ticket.id,
      p_new_status: parsed.data.status,
      ...(parsed.data.resolutionNote
        ? { p_resolution_note: parsed.data.resolutionNote }
        : {}),
    });

    if (error) {
      logRpcDiagnostics("transitionSupportTicketAction", error);
      return { ok: false, message: safeRpcMessage(error) };
    }

    revalidateSupportTicket(ticket.id);
    return { ok: true, message: "Support ticket status updated." };
  } catch {
    console.error("Support ticket status authorization or persistence failed.");
    return { ok: false, message: GENERIC_ERROR };
  }
}
