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
import { renderNotificationEmailHtml } from "./templates/notification-email";

export type { SendEmailResult } from "./resend-result";

export interface SendNotificationEmailInput {
  toEmail: string;
  // Passed through to Resend's idempotencyKey (ResendSendOptions) so a retried
  // send for the same outbox row can never double-deliver at the provider —
  // the fourth of the four independent duplicate-prevention layers described
  // in the Phase 11 handoff SS11.
  deliveryId: string;
  title: string;
  message: string | null;
  actionUrl: string | null;
  actionLabel: string | null;
}

/**
 * Centralized Resend integration for Phase 11 notification emails. Never
 * throws — mirrors sendInvoiceEmail / sendProposalEmail exactly. The caller
 * (src/lib/reminders/run-reminders.ts) is responsible for mapping a
 * non-ok `reason` onto notification_deliveries.last_error_code via
 * mark_email_delivery_result.
 */
export async function sendNotificationEmail(
  input: SendNotificationEmailInput,
): Promise<SendEmailResult> {
  const operation = "sendNotificationEmail";
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
      subject: input.title,
      html: renderNotificationEmailHtml({
        title: input.title,
        message: input.message,
        actionUrl: input.actionUrl,
        actionLabel: input.actionLabel,
      }),
    },
    { operation, emailFromLoaded },
    { idempotencyKey: input.deliveryId },
  );
}
