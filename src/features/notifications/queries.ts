import "server-only";

import { createClient } from "@/lib/supabase/server";

import {
  NOTIFICATION_EVENT_TYPES,
  NOTIFICATIONS_BELL_PREVIEW_SIZE,
  NOTIFICATIONS_MAX_LIMIT,
  type NotificationEventType,
} from "./constants";
import type { NotificationListItem, NotificationPreference } from "./types";

interface SupabaseErrorDetails {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

function logSupabaseError(
  operation: string,
  error: SupabaseErrorDetails,
): void {
  if (process.env.NODE_ENV !== "production") {
    console.error(`${operation} Supabase error`, {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
  }
}

function mapNotificationRow(row: {
  id: string;
  event_type: string;
  title: string;
  message: string | null;
  entity_type: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
}): NotificationListItem {
  return {
    id: row.id,
    eventType: row.event_type as NotificationEventType,
    title: row.title,
    message: row.message,
    entityType: row.entity_type,
    entityId: row.entity_id,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

export async function getMyNotifications(
  before?: string,
): Promise<NotificationListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_my_notifications", {
    p_limit: NOTIFICATIONS_MAX_LIMIT,
    p_before: before ?? undefined,
  });

  if (error) {
    logSupabaseError("getMyNotifications", error);
    throw new Error("Unable to load notifications.");
  }

  return (data ?? []).map(mapNotificationRow);
}

export async function getMyNotificationsPreview(): Promise<
  NotificationListItem[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_my_notifications", {
    p_limit: NOTIFICATIONS_BELL_PREVIEW_SIZE,
  });

  if (error) {
    logSupabaseError("getMyNotificationsPreview", error);
    throw new Error("Unable to load notifications.");
  }

  return (data ?? []).map(mapNotificationRow);
}

export async function getMyUnreadNotificationCount(): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "get_my_unread_notification_count",
  );

  if (error) {
    logSupabaseError("getMyUnreadNotificationCount", error);
    throw new Error("Unable to load unread notification count.");
  }

  return data ?? 0;
}

export async function getMyNotificationPreferences(): Promise<
  NotificationPreference[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("event_type, in_app, email");

  if (error) {
    logSupabaseError("getMyNotificationPreferences", error);
    throw new Error("Unable to load notification preferences.");
  }

  const saved = new Map(
    (data ?? []).map((row) => [
      row.event_type as NotificationEventType,
      { inApp: row.in_app, email: row.email },
    ]),
  );

  // Absent row = both channels enabled (the opt-out model set_notification_preference
  // and private.emit_event both assume) — fill every event type explicitly
  // so the preferences form always renders a complete, accurate list.
  return NOTIFICATION_EVENT_TYPES.map((eventType) => {
    const existing = saved.get(eventType);
    return {
      eventType,
      inApp: existing?.inApp ?? true,
      email: existing?.email ?? true,
    };
  });
}
