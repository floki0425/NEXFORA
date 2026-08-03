import type { NotificationEventType } from "./constants";

export interface NotificationListItem {
  id: string;
  eventType: NotificationEventType;
  title: string;
  message: string | null;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPreference {
  eventType: NotificationEventType;
  inApp: boolean;
  email: boolean;
}

export interface NotificationActionResult {
  ok: boolean;
  message: string;
}

export interface RunRemindersResult {
  ok: boolean;
  message: string;
  raised?: {
    invoiceReminders: number;
    renewalReminders: number;
    leadFollowUps: number;
  };
  sent?: number;
  failed?: number;
}
