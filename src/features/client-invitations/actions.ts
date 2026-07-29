"use server";

import { revalidatePath } from "next/cache";

import { publicEnv } from "@/config/env.public";
import { getClientDetail } from "@/features/clients/queries";
import { sendClientInvitationEmail } from "@/lib/email/send-client-invitation-email";
import { requireInternalMember } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";

import {
  CLIENT_INVITATION_DEFAULT_TTL_DAYS,
  CLIENT_ROLE_LABELS,
  type ClientRole,
} from "./constants.ts";
import { generateClientInvitationToken } from "@/lib/tokens/client-invitation-token";

import { memberCanManageClientInvitations } from "./permissions.ts";
import {
  clientIdParamSchema,
  invitationIdSchema,
  inviteClientUserSchema,
} from "./schemas.ts";
import type { ClientInvitationActionResult } from "./types.ts";

const GENERIC_ERROR =
  "We could not send this invitation. Please review the form and try again.";
const GENERIC_ACTION_ERROR =
  "We could not complete this action. Please try again.";

// public.create_or_resend_client_invitation and public.revoke_client_invitation
// raise these exact, already user-safe messages for known business-rule
// rejections. Anything not in this allowlist falls back to a generic
// message so raw database errors never reach the browser.
const SAFE_RPC_MESSAGES = new Set([
  "Authentication is required.",
  "A valid invitation token hash is required.",
  "A valid client role is required.",
  "A valid email address is required.",
  "A valid future expiration is required.",
  "You do not have permission to invite client users.",
  "You do not have permission to revoke this invitation.",
  "This client could not be found.",
  "This person already has active portal access for this client.",
]);

function safeRpcErrorMessage(
  error: { message?: string | null } | null | undefined,
  fallback: string,
): string {
  if (error?.message && SAFE_RPC_MESSAGES.has(error.message)) {
    return error.message;
  }
  return fallback;
}

function logRpcDiagnostics(
  operation: string,
  error:
    | { code?: string | null; message?: string | null; details?: string | null; hint?: string | null }
    | null
    | undefined,
): void {
  if (process.env.NODE_ENV !== "production") {
    console.error(`${operation} Supabase error`, {
      code: error?.code,
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
    });
  }
}

async function sendInvitationEmail(params: {
  invitationId: string;
  tokenHash: string;
  rawToken: string;
  email: string;
  role: ClientRole;
  businessName: string;
  expiresAt: string;
}): Promise<ClientInvitationActionResult> {
  const acceptUrl = `${publicEnv.NEXT_PUBLIC_APP_URL}/portal/invitations/accept/${params.rawToken}`;
  const emailResult = await sendClientInvitationEmail({
    invitationId: params.invitationId,
    tokenHash: params.tokenHash,
    toEmail: params.email,
    businessName: params.businessName,
    roleLabel: CLIENT_ROLE_LABELS[params.role],
    expiresAtLabel: new Date(params.expiresAt).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    acceptUrl,
  });

  if (!emailResult.ok) {
    const message =
      emailResult.reason === "not_configured"
        ? "The invitation was created, but email delivery is not configured yet. Set up Resend, then use Resend invitation to deliver it."
        : emailResult.reason === "invalid_recipient"
          ? "The invitation was created, but this email address is invalid. Correct it and send a new invitation."
          : "The invitation was created, but the email could not be delivered. Use Resend invitation to try again.";
    return { ok: true, message };
  }

  return { ok: true, message: "Invitation sent." };
}

export async function inviteClientUserAction(
  clientId: string,
  input: unknown,
): Promise<ClientInvitationActionResult> {
  const idResult = clientIdParamSchema.safeParse(clientId);
  const parsed = inviteClientUserSchema.safeParse(input);

  if (!idResult.success) {
    return { ok: false, message: "This client could not be found." };
  }

  if (!parsed.success) {
    return {
      ok: false,
      message: "Please correct the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const member = await requireInternalMember();
    if (!memberCanManageClientInvitations(member)) {
      return {
        ok: false,
        message: "You do not have permission to invite client users.",
      };
    }

    const client = await getClientDetail(member.organizationId, idResult.data);
    if (!client) {
      return { ok: false, message: "This client could not be found." };
    }

    const supabase = await createClient();
    const { rawToken, tokenHash } = generateClientInvitationToken();
    const expiresAt = new Date(
      Date.now() + Number(parsed.data.expiresInDays) * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { data: result, error } = await supabase.rpc(
      "create_or_resend_client_invitation",
      {
        target_client_id: idResult.data,
        p_email: parsed.data.email,
        p_role: parsed.data.role,
        p_expires_at: expiresAt,
        p_token_hash: tokenHash,
      },
    );

    if (error || !result || result.length === 0) {
      logRpcDiagnostics("inviteClientUserAction", error);
      return { ok: false, message: safeRpcErrorMessage(error, GENERIC_ERROR) };
    }

    revalidatePath(`/admin/clients/${idResult.data}`);

    return sendInvitationEmail({
      invitationId: result[0].invitation_id,
      tokenHash,
      rawToken,
      email: parsed.data.email,
      role: parsed.data.role,
      businessName: client.business_name,
      expiresAt,
    });
  } catch {
    console.error("Client invitation creation authorization or persistence failed.");
    return { ok: false, message: GENERIC_ERROR };
  }
}

export async function resendClientInvitationAction(
  clientId: string,
  invitationId: string,
): Promise<ClientInvitationActionResult> {
  const clientIdResult = clientIdParamSchema.safeParse(clientId);
  const invitationIdResult = invitationIdSchema.safeParse(invitationId);

  if (!clientIdResult.success || !invitationIdResult.success) {
    return { ok: false, message: "This invitation could not be found." };
  }

  try {
    const member = await requireInternalMember();
    if (!memberCanManageClientInvitations(member)) {
      return {
        ok: false,
        message: "You do not have permission to resend this invitation.",
      };
    }

    const client = await getClientDetail(
      member.organizationId,
      clientIdResult.data,
    );
    if (!client) {
      return { ok: false, message: "This client could not be found." };
    }

    const supabase = await createClient();
    const { data: existing, error: existingError } = await supabase
      .from("client_invitations")
      .select("email, role, status")
      .eq("id", invitationIdResult.data)
      .eq("client_id", clientIdResult.data)
      .maybeSingle();

    if (existingError || !existing) {
      return { ok: false, message: "This invitation could not be found." };
    }

    if (existing.status !== "pending") {
      return {
        ok: false,
        message: "Only a pending invitation can be resent.",
      };
    }

    const { rawToken, tokenHash } = generateClientInvitationToken();
    const expiresAt = new Date(
      Date.now() +
        CLIENT_INVITATION_DEFAULT_TTL_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { data: result, error } = await supabase.rpc(
      "create_or_resend_client_invitation",
      {
        target_client_id: clientIdResult.data,
        p_email: existing.email,
        p_role: existing.role,
        p_expires_at: expiresAt,
        p_token_hash: tokenHash,
      },
    );

    if (error || !result || result.length === 0) {
      logRpcDiagnostics("resendClientInvitationAction", error);
      return {
        ok: false,
        message: safeRpcErrorMessage(
          error,
          "We could not resend this invitation. Please try again.",
        ),
      };
    }

    revalidatePath(`/admin/clients/${clientIdResult.data}`);

    return sendInvitationEmail({
      invitationId: result[0].invitation_id,
      tokenHash,
      rawToken,
      email: existing.email,
      role: existing.role as ClientRole,
      businessName: client.business_name,
      expiresAt,
    });
  } catch {
    console.error("Client invitation resend authorization or persistence failed.");
    return {
      ok: false,
      message: "We could not resend this invitation. Please try again.",
    };
  }
}

export async function revokeClientInvitationAction(
  clientId: string,
  invitationId: string,
): Promise<ClientInvitationActionResult> {
  const clientIdResult = clientIdParamSchema.safeParse(clientId);
  const invitationIdResult = invitationIdSchema.safeParse(invitationId);

  if (!clientIdResult.success || !invitationIdResult.success) {
    return { ok: false, message: "This invitation could not be found." };
  }

  try {
    const member = await requireInternalMember();
    if (!memberCanManageClientInvitations(member)) {
      return {
        ok: false,
        message: "You do not have permission to revoke this invitation.",
      };
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc("revoke_client_invitation", {
      target_invitation_id: invitationIdResult.data,
    });

    if (error) {
      logRpcDiagnostics("revokeClientInvitationAction", error);
      return {
        ok: false,
        message: safeRpcErrorMessage(error, GENERIC_ACTION_ERROR),
      };
    }

    revalidatePath(`/admin/clients/${clientIdResult.data}`);
    return { ok: true, message: "Invitation revoked." };
  } catch {
    console.error("Client invitation revoke authorization or persistence failed.");
    return { ok: false, message: GENERIC_ACTION_ERROR };
  }
}
