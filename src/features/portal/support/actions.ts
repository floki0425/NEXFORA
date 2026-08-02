"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getPortalProjectDetail } from "@/features/portal/projects/queries";
import { requirePortalMember } from "@/lib/auth/portal";
import { createClient } from "@/lib/supabase/server";

import { getPortalSupportTicketSummary } from "./queries";
import {
  portalSupportReopenSchema,
  portalSupportTicketCreateSchema,
  portalSupportTicketIdSchema,
} from "./schemas";
import type { PortalSupportActionResult } from "./types";

const GENERIC_ERROR =
  "We could not update this support ticket. Please try again.";

const SAFE_RPC_MESSAGES = new Set([
  "An active client membership is required.",
  "You do not have permission to open support tickets.",
  "You do not have permission to update this ticket.",
  "This client could not be found.",
  "This project could not be found.",
  "This ticket could not be found.",
  "A title is required.",
  "A description is required.",
  "Choose a valid priority.",
  "Only a resolved ticket can be confirmed and closed.",
  "Only a resolved ticket can be reopened.",
  "Please describe what is still not working.",
]);

interface RpcError {
  message?: string | null;
}

interface PortalSupportWriteRpcClient {
  rpc: {
    (
      name: "create_client_support_ticket",
      args: {
        p_title: string;
        p_description: string;
        p_priority: string;
        p_category: string;
        target_project_id?: string;
      },
    ): Promise<{
      data:
        | { id: string; ticket_number: string; created_at: string }[]
        | null;
      error: RpcError | null;
    }>;
    (
      name: "close_ticket_by_client",
      args: { target_ticket_id: string },
    ): Promise<{
      data: { status: string; already_closed: boolean }[] | null;
      error: RpcError | null;
    }>;
    (
      name: "reopen_ticket_by_client",
      args: { target_ticket_id: string; p_comment: string },
    ): Promise<{
      data: { status: string }[] | null;
      error: RpcError | null;
    }>;
  };
}

function validationFailure(error: z.ZodError): PortalSupportActionResult {
  return {
    ok: false,
    message: "Please correct the highlighted fields.",
    fieldErrors: error.flatten().fieldErrors,
  };
}

function safeRpcMessage(error: RpcError | null | undefined): string {
  return error?.message && SAFE_RPC_MESSAGES.has(error.message)
    ? error.message
    : GENERIC_ERROR;
}

function revalidatePortalTicket(ticketId: string): void {
  revalidatePath("/portal/support");
  revalidatePath(`/portal/support/${ticketId}`);
  revalidatePath("/admin/support");
  revalidatePath(`/admin/support/${ticketId}`);
}

export async function createPortalSupportTicketAction(
  input: unknown,
): Promise<PortalSupportActionResult> {
  const parsed = portalSupportTicketCreateSchema.safeParse(input);
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }

  try {
    const member = await requirePortalMember();
    if (member.role !== "owner" && member.role !== "manager") {
      return {
        ok: false,
        message: "You do not have permission to open support tickets.",
      };
    }

    if (parsed.data.projectId) {
      const project = await getPortalProjectDetail(parsed.data.projectId);
      if (!project) {
        return {
          ok: false,
          message: "Select a project available to your account.",
          fieldErrors: { projectId: ["This project is not available."] },
        };
      }
    }

    const supabase = await createClient();
    const supportRpc = supabase as unknown as PortalSupportWriteRpcClient;
    const { data, error } = await supportRpc.rpc(
      "create_client_support_ticket",
      {
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
      return { ok: false, message: safeRpcMessage(error) };
    }

    revalidatePortalTicket(createdTicket.id);
    return {
      ok: true,
      message: "Your support request has been sent.",
      ticketId: createdTicket.id,
    };
  } catch {
    console.error("Portal support creation authorization or persistence failed.");
    return { ok: false, message: GENERIC_ERROR };
  }
}

export async function closePortalSupportTicketAction(
  ticketId: string,
): Promise<PortalSupportActionResult> {
  const idResult = portalSupportTicketIdSchema.safeParse(ticketId);
  if (!idResult.success) {
    return { ok: false, message: "This support ticket could not be found." };
  }

  try {
    const member = await requirePortalMember();
    if (member.role !== "owner" && member.role !== "manager") {
      return {
        ok: false,
        message: "You do not have permission to update support tickets.",
      };
    }

    const ticket = await getPortalSupportTicketSummary(idResult.data);
    if (!ticket) {
      return { ok: false, message: "This support ticket could not be found." };
    }

    const supabase = await createClient();
    const supportRpc = supabase as unknown as PortalSupportWriteRpcClient;
    const { error } = await supportRpc.rpc("close_ticket_by_client", {
      target_ticket_id: idResult.data,
    });

    if (error) {
      return { ok: false, message: safeRpcMessage(error) };
    }

    revalidatePortalTicket(idResult.data);
    return { ok: true, message: "Thanks for confirming the resolution." };
  } catch {
    console.error("Portal support close authorization or persistence failed.");
    return { ok: false, message: GENERIC_ERROR };
  }
}

export async function reopenPortalSupportTicketAction(
  ticketId: string,
  input: unknown,
): Promise<PortalSupportActionResult> {
  const idResult = portalSupportTicketIdSchema.safeParse(ticketId);
  const parsed = portalSupportReopenSchema.safeParse(input);
  if (!idResult.success || !parsed.success) {
    return parsed.success
      ? { ok: false, message: "This support ticket could not be found." }
      : validationFailure(parsed.error);
  }

  try {
    const member = await requirePortalMember();
    if (member.role !== "owner" && member.role !== "manager") {
      return {
        ok: false,
        message: "You do not have permission to update support tickets.",
      };
    }

    const ticket = await getPortalSupportTicketSummary(idResult.data);
    if (!ticket) {
      return { ok: false, message: "This support ticket could not be found." };
    }

    const supabase = await createClient();
    const supportRpc = supabase as unknown as PortalSupportWriteRpcClient;
    const { error } = await supportRpc.rpc("reopen_ticket_by_client", {
      target_ticket_id: idResult.data,
      p_comment: parsed.data.comment,
    });

    if (error) {
      return { ok: false, message: safeRpcMessage(error) };
    }

    revalidatePortalTicket(idResult.data);
    return {
      ok: true,
      message: "We reopened the ticket and sent your note to the team.",
    };
  } catch {
    console.error("Portal support reopen authorization or persistence failed.");
    return { ok: false, message: GENERIC_ERROR };
  }
}
