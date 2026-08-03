import "server-only";

import { serverEnv } from "@/config/env.server";
import { sendNotificationEmail } from "@/lib/email/send-notification-email";
import { createAdminClient } from "@/lib/supabase/admin";

const EMAIL_BATCH_SIZE = 20;

// Only entity types with a real admin detail page get a link in the email —
// mirrors src/features/notifications/constants.ts's NOTIFICATION_ENTITY_ROUTES.
// Duplicated (not imported) because src/lib/ code does not depend on
// src/features/ code in this repo.
const ENTITY_ROUTES: Partial<Record<string, (entityId: string) => string>> = {
  lead: (id) => `/admin/leads/${id}`,
  client: (id) => `/admin/clients/${id}`,
  project: (id) => `/admin/projects/${id}`,
  proposal: (id) => `/admin/proposals/${id}`,
  invoice: (id) => `/admin/invoices/${id}`,
  revision: (id) => `/admin/revisions/${id}`,
  support_ticket: (id) => `/admin/support/${id}`,
  subscription: (id) => `/admin/subscriptions/${id}`,
};

export interface RunRemindersSummary {
  raised: {
    invoiceReminders: number;
    renewalReminders: number;
    leadFollowUps: number;
  };
  sent: number;
  failed: number;
}

function buildActionUrl(
  entityType: string | null,
  entityId: string | null,
): string | null {
  if (!entityType || !entityId) {
    return null;
  }
  const buildPath = ENTITY_ROUTES[entityType];
  if (!buildPath) {
    return null;
  }
  return `${serverEnv.NEXT_PUBLIC_APP_URL}${buildPath(entityId)}`;
}

/**
 * Shared by POST /api/cron/reminders and the super_admin "Run reminders now"
 * manual action — see reconciliation note 7 in
 * supabase/migrations/20260806000000_phase_11_notifications_audit.sql for why
 * this does not call public.refresh_overdue_invoices() (that function is
 * scoped to the caller's session organization and no-ops under the
 * service-role connection used here). Idempotent: safe to call any number of
 * times, any number of times concurrently — every layer of duplicate
 * prevention lives in the database (private.reminder_runs, the notifications
 * dedupe index, `for update skip locked`), not here.
 */
export async function runReminders(): Promise<RunRemindersSummary> {
  const admin = createAdminClient();

  const [invoiceResult, renewalResult, leadResult] = await Promise.all([
    admin.rpc("raise_due_invoice_reminders"),
    admin.rpc("raise_due_renewal_reminders"),
    admin.rpc("raise_due_lead_follow_ups"),
  ]);

  const raised = {
    invoiceReminders: invoiceResult.data ?? 0,
    renewalReminders: renewalResult.data ?? 0,
    leadFollowUps: leadResult.data ?? 0,
  };

  let sent = 0;
  let failed = 0;

  // Drain the outbox in fixed-size batches until a batch comes back short,
  // so one run empties the current backlog instead of only ever processing
  // one batch per invocation.
  for (;;) {
    const { data: deliveries, error: claimError } = await admin.rpc(
      "claim_pending_email_deliveries",
      { p_limit: EMAIL_BATCH_SIZE },
    );

    if (claimError || !deliveries || deliveries.length === 0) {
      break;
    }

    for (const delivery of deliveries) {
      const result = await sendNotificationEmail({
        toEmail: delivery.recipient_email,
        deliveryId: delivery.delivery_id,
        title: delivery.title,
        message: delivery.message,
        actionUrl: buildActionUrl(delivery.entity_type, delivery.entity_id),
        actionLabel: "View in Nexfora",
      });

      // delivery.claimed_at is this claim's identity, passed straight back as
      // the raw string the claim RPC returned. mark_email_delivery_result
      // compare-and-sets on it, so a result from a claim that has since been
      // superseded (this runner stalled past its 10-minute lease and the row
      // was reclaimed and re-claimed by another worker) matches zero rows and
      // changes nothing. Never wrap this in `new Date(...)`: that truncates
      // PostgreSQL's microsecond precision and the comparison would miss.
      if (result.ok) {
        sent += 1;
        await admin.rpc("mark_email_delivery_result", {
          p_delivery_id: delivery.delivery_id,
          p_status: "sent",
          p_claimed_at: delivery.claimed_at,
        });
      } else {
        failed += 1;
        await admin.rpc("mark_email_delivery_result", {
          p_delivery_id: delivery.delivery_id,
          p_status: "failed",
          p_claimed_at: delivery.claimed_at,
          p_error_code: result.reason,
        });
      }
    }

    if (deliveries.length < EMAIL_BATCH_SIZE) {
      break;
    }
  }

  return { raised, sent, failed };
}
