import "server-only";

import { serverEnv } from "@/config/env.server";

import { getResendClient, isEmailConfigured } from "./resend-client";
import {
  logEmailDiagnostics,
  normalizeAndValidateRecipient,
  recipientDomain,
  sendViaResendClient,
  type SendEmailResult,
} from "./resend-result";
import { renderClientInvitationEmailHtml } from "./templates/client-invitation-email";

export type { SendEmailResult } from "./resend-result";

export interface SendClientInvitationEmailInput {
  invitationId: string;
  tokenHash: string;
  toEmail: string;
  businessName: string;
  roleLabel: string;
  expiresAtLabel: string;
  acceptUrl: string;
}

/**
 * Centralized Resend integration for client invitation emails. Never
 * throws — a misconfigured, invalid-recipient, or failing provider degrades
 * to a safe result the caller can report without ever marking the
 * invitation as delivered or exposing raw provider errors to the browser.
 * The idempotency key is derived from the invitation id + its current
 * token_hash (never the raw token) so retrying the same in-flight send
 * cannot double-email, while a genuine resend (new token_hash) always sends
 * a fresh email.
 */
export async function sendClientInvitationEmail(
  input: SendClientInvitationEmailInput,
): Promise<SendEmailResult> {
  const operation = "sendClientInvitationEmail";
  const emailFromLoaded = Boolean(serverEnv.EMAIL_FROM);

  const recipient = normalizeAndValidateRecipient(input.toEmail);
  if (!recipient.ok) {
    logEmailDiagnostics(operation, {
      outcome: "invalid_recipient",
      emailFromLoaded,
      recipientDomain: recipientDomain(input.toEmail.trim().toLowerCase()),
    });
    return { ok: false, reason: "invalid_recipient" };
  }

  if (!isEmailConfigured()) {
    logEmailDiagnostics(operation, {
      outcome: "not_configured",
      emailFromLoaded,
      resendApiKeyLoaded: Boolean(serverEnv.RESEND_API_KEY),
    });
    return { ok: false, reason: "not_configured" };
  }

  const client = getResendClient();
  if (!client) {
    logEmailDiagnostics(operation, {
      outcome: "not_configured",
      emailFromLoaded,
      resendApiKeyLoaded: false,
    });
    return { ok: false, reason: "not_configured" };
  }

  return sendViaResendClient(
    client,
    {
      from: serverEnv.EMAIL_FROM as string,
      to: recipient.email,
      subject: `You've been invited to ${input.businessName}'s Nexfora portal`,
      html: renderClientInvitationEmailHtml({
        businessName: input.businessName,
        invitedEmail: recipient.email,
        roleLabel: input.roleLabel,
        expiresAtLabel: input.expiresAtLabel,
        acceptUrl: input.acceptUrl,
      }),
    },
    { operation, emailFromLoaded },
    { idempotencyKey: `client-invitation:${input.invitationId}:${input.tokenHash}` },
  );
}
