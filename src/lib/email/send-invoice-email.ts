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
import { renderInvoiceEmailHtml } from "./templates/invoice-email";

export type { SendEmailResult } from "./resend-result";

export interface SendInvoiceEmailInput {
  toEmail: string;
  recipientName: string;
  invoiceNumber: string;
  total: number;
  currency: string;
  dueDate: string | null;
  invoiceUrl: string;
}

/**
 * Centralized Resend integration for invoice emails. Never throws — a
 * misconfigured, invalid-recipient, or failing provider degrades to a safe
 * result the caller can report without ever marking the invoice as
 * successfully emailed or exposing raw provider errors to the browser.
 * Mirrors sendProposalEmail exactly.
 */
export async function sendInvoiceEmail(
  input: SendInvoiceEmailInput,
): Promise<SendEmailResult> {
  const operation = "sendInvoiceEmail";
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
      subject: `Invoice ${input.invoiceNumber} from Nexfora`,
      html: renderInvoiceEmailHtml({
        recipientName: input.recipientName,
        invoiceNumber: input.invoiceNumber,
        total: input.total,
        currency: input.currency,
        dueDate: input.dueDate,
        invoiceUrl: input.invoiceUrl,
      }),
    },
    { operation, emailFromLoaded },
  );
}
