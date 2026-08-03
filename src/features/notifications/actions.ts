"use server";

import { revalidatePath } from "next/cache";

import { requireInternalMember } from "@/lib/auth/server";
import { runReminders } from "@/lib/reminders/run-reminders";
import { createClient } from "@/lib/supabase/server";

import { canRunRemindersManually } from "./permissions";
import { getMyNotificationsPreview, getMyUnreadNotificationCount } from "./queries";
import {
  notificationIdSchema,
  notificationPreferenceUpdateSchema,
} from "./schemas";
import type {
  NotificationActionResult,
  NotificationListItem,
  RunRemindersResult,
} from "./types";

const GENERIC_ERROR =
  "We could not update your notifications. Please try again.";

const SAFE_RPC_MESSAGES = new Set(["Authentication is required."]);

interface RpcError {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
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

// Read-only "use server" actions. The notification bell is a Client
// Component (it needs interactive open/close + focus management) and
// src/features/notifications/queries.ts is server-only, so the bell reaches
// it through these thin action wrappers rather than importing queries.ts
// directly, which Next.js would reject from client code at build time.

export async function getNotificationsPreviewAction(): Promise<
  NotificationListItem[]
> {
  try {
    await requireInternalMember();
    return await getMyNotificationsPreview();
  } catch {
    return [];
  }
}

export async function getUnreadNotificationCountAction(): Promise<number> {
  try {
    await requireInternalMember();
    return await getMyUnreadNotificationCount();
  } catch {
    return 0;
  }
}

export async function markNotificationReadAction(
  notificationId: unknown,
): Promise<NotificationActionResult> {
  const parsed = notificationIdSchema.safeParse(notificationId);
  if (!parsed.success) {
    return { ok: false, message: "This notification could not be found." };
  }

  try {
    await requireInternalMember();

    const supabase = await createClient();
    const { error } = await supabase.rpc("mark_notification_read", {
      p_notification_id: parsed.data,
    });

    if (error) {
      logRpcDiagnostics("markNotificationReadAction", error);
      return { ok: false, message: safeRpcMessage(error) };
    }

    revalidatePath("/admin/notifications");
    return { ok: true, message: "Notification marked as read." };
  } catch {
    console.error("Mark-notification-read authorization or persistence failed.");
    return { ok: false, message: GENERIC_ERROR };
  }
}

export async function markAllNotificationsReadAction(): Promise<NotificationActionResult> {
  try {
    await requireInternalMember();

    const supabase = await createClient();
    const { error } = await supabase.rpc("mark_all_notifications_read");

    if (error) {
      logRpcDiagnostics("markAllNotificationsReadAction", error);
      return { ok: false, message: safeRpcMessage(error) };
    }

    revalidatePath("/admin/notifications");
    return { ok: true, message: "All notifications marked as read." };
  } catch {
    console.error(
      "Mark-all-notifications-read authorization or persistence failed.",
    );
    return { ok: false, message: GENERIC_ERROR };
  }
}

export async function setNotificationPreferenceAction(
  input: unknown,
): Promise<NotificationActionResult> {
  const parsed = notificationPreferenceUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Please choose a valid notification preference.",
    };
  }

  try {
    await requireInternalMember();

    const supabase = await createClient();
    const { error } = await supabase.rpc("set_notification_preference", {
      p_event_type: parsed.data.eventType,
      p_in_app: parsed.data.inApp,
      p_email: parsed.data.email,
    });

    if (error) {
      logRpcDiagnostics("setNotificationPreferenceAction", error);
      return { ok: false, message: safeRpcMessage(error) };
    }

    revalidatePath("/admin/notifications/preferences");
    return { ok: true, message: "Preference saved." };
  } catch {
    console.error(
      "Set-notification-preference authorization or persistence failed.",
    );
    return { ok: false, message: GENERIC_ERROR };
  }
}

// super_admin-only (unresolved decision #5 in the Phase 11 handoff, resolved
// as super_admin-only — see src/features/notifications/permissions.ts).
// Exists so reminders work before CRON_SECRET / Vercel Cron are configured,
// and calls the exact same runReminders() the cron route calls, so behavior
// never diverges between the two entry points.
export async function runRemindersNowAction(): Promise<RunRemindersResult> {
  try {
    const member = await requireInternalMember();
    if (!canRunRemindersManually(member)) {
      return {
        ok: false,
        message: "You do not have permission to run reminders.",
      };
    }

    const summary = await runReminders();
    revalidatePath("/admin/notifications");

    return {
      ok: true,
      message: `Raised ${summary.raised.invoiceReminders + summary.raised.renewalReminders + summary.raised.leadFollowUps} reminder(s), sent ${summary.sent}, failed ${summary.failed}.`,
      raised: summary.raised,
      sent: summary.sent,
      failed: summary.failed,
    };
  } catch {
    console.error("Run-reminders-now authorization or execution failed.");
    return { ok: false, message: GENERIC_ERROR };
  }
}
