"use client";

import Link from "next/link";
import { useTransition } from "react";

import { cn } from "@/lib/utils/cn";

import { markNotificationReadAction } from "../actions";
import { NOTIFICATION_ENTITY_ROUTES } from "../constants";
import { formatNotificationDate } from "../format";
import type { NotificationListItem } from "../types";

interface NotificationItemProps {
  notification: NotificationListItem;
  onRead?: (notificationId: string) => void;
}

export function NotificationItem({
  notification,
  onRead,
}: NotificationItemProps) {
  const [isPending, startTransition] = useTransition();
  const isUnread = notification.readAt === null;
  const href =
    notification.entityType && notification.entityId
      ? NOTIFICATION_ENTITY_ROUTES[notification.entityType]?.(
          notification.entityId,
        )
      : undefined;

  function handleActivate() {
    if (!isUnread) {
      return;
    }
    startTransition(async () => {
      await markNotificationReadAction(notification.id);
      onRead?.(notification.id);
    });
  }

  const content = (
    <div className="flex items-start gap-3 px-4 py-3">
      <span
        aria-hidden="true"
        className={cn(
          "mt-1.5 size-2 shrink-0 rounded-full",
          isUnread ? "bg-accent" : "bg-transparent",
        )}
      />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-sm",
            isUnread
              ? "font-semibold text-foreground"
              : "font-medium text-text-secondary",
          )}
        >
          {notification.title}
        </p>
        {notification.message ? (
          <p className="mt-0.5 line-clamp-2 text-sm text-text-secondary">
            {notification.message}
          </p>
        ) : null}
        <p className="mt-1 text-xs text-text-muted">
          {formatNotificationDate(notification.createdAt)}
        </p>
      </div>
    </div>
  );

  const className = cn(
    "block w-full text-left transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent disabled:opacity-60",
  );

  // Exposes the already-fetched, stable entity identifier as a DOM
  // attribute so a specific row can be located unambiguously — the visible
  // title is a fixed, shared string per event type (e.g. every lead gets
  // "New lead received"), so text alone cannot distinguish one
  // notification from another of the same kind.
  const testAttributes = {
    "data-testid": "notification-item",
    "data-entity-id": notification.entityId ?? "",
  };

  if (href) {
    return (
      <Link
        href={href}
        onClick={handleActivate}
        className={className}
        aria-current={isPending ? "true" : undefined}
        {...testAttributes}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={handleActivate}
      disabled={isPending || !isUnread}
      className={className}
      {...testAttributes}
    >
      {content}
    </button>
  );
}
