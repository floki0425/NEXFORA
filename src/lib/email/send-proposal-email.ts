import "server-only";

import { serverEnv } from "@/config/env.server";

import { getResendClient, isEmailConfigured } from "./resend-client";
import {
  logEmailDiagnostics,
  normalizeAndValidateRecipient,
  recipientDomain,
  sendViaResendClient,
  type SendProposalEmailResult,
} from "./resend-result";
import { renderProposalEmailHtml } from "./templates/proposal-email";

export type { SendProposalEmailResult } from "./resend-result";

export interface SendProposalEmailInput {
  toEmail: string;
  recipientName: string;
  proposalTitle: string;
  proposalNumber: string;
  proposalUrl: string;
  validUntil: string | null;
}

/**
 * Centralized Resend integration for proposal emails. Never throws — a
 * misconfigured, invalid-recipient, or failing provider degrades to a safe
 * result the caller can report without ever marking the proposal as
 * successfully emailed or exposing raw provider errors to the browser.
 */
export async function sendProposalEmail(
  input: SendProposalEmailInput,
): Promise<SendProposalEmailResult> {
  const operation = "sendProposalEmail";
  const emailFromLoaded = Boolean(serverEnv.EMAIL_FROM);

  // Defense in depth: leads.email is already normalized (lower + trimmed) by
  // a database CHECK constraint, but the send path re-normalizes and
  // validates independently rather than trusting that invariant blindly.
  // Validated before the configuration check below since it's a cheap,
  // pure check that doesn't depend on external service state.
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
      subject: `Your proposal from Nexfora — ${input.proposalNumber}`,
      html: renderProposalEmailHtml({
        recipientName: input.recipientName,
        proposalTitle: input.proposalTitle,
        proposalNumber: input.proposalNumber,
        proposalUrl: input.proposalUrl,
        validUntil: input.validUntil,
      }),
    },
    { operation, emailFromLoaded },
  );
}
