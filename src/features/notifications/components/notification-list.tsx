import { BellOff } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";

import type { NotificationListItem } from "../types";
import { NotificationItem } from "./notification-item";

interface NotificationListProps {
  notifications: NotificationListItem[];
  onRead?: (notificationId: string) => void;
  emptyTitle?: string;
  emptyDescription?: string;
}

export function NotificationList({
  notifications,
  onRead,
  emptyTitle = "No notifications yet",
  emptyDescription = "You're all caught up. New activity will show up here.",
}: NotificationListProps) {
  if (notifications.length === 0) {
    return (
      <EmptyState
        icon={BellOff}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  return (
    <ul className="divide-y divide-border">
      {notifications.map((notification) => (
        <li key={notification.id}>
          <NotificationItem notification={notification} onRead={onRead} />
        </li>
      ))}
    </ul>
  );
}
