"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";

import { useDismissablePopover } from "@/components/ui/use-dismissable-popover";
import { cn } from "@/lib/utils/cn";

import {
  getNotificationsPreviewAction,
  getUnreadNotificationCountAction,
  markAllNotificationsReadAction,
} from "../actions";
import type { NotificationListItem } from "../types";
import { NotificationList } from "./notification-list";

interface NotificationBellProps {
  initialUnreadCount: number;
}

export function NotificationBell({
  initialUnreadCount,
}: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  // null = not loaded yet for the current mount (renders the loading
  // skeleton); previously-loaded data is kept across a close/reopen so the
  // popover shows last-known content immediately while it refreshes, rather
  // than flashing back to a skeleton every time it opens.
  const [notifications, setNotifications] = useState<
    NotificationListItem[] | null
  >(null);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [isMarkingAllRead, startMarkAllRead] = useTransition();

  const close = useCallback(() => setIsOpen(false), []);
  const { containerRef, triggerRef } = useDismissablePopover<
    HTMLDivElement,
    HTMLButtonElement
  >(isOpen, close);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;

    getNotificationsPreviewAction()
      .then((data) => {
        if (!cancelled) {
          setNotifications(data);
          setHasLoadError(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHasLoadError(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  function handleItemRead(notificationId: string) {
    setNotifications((current) =>
      current === null
        ? current
        : current.map((notification) =>
            notification.id === notificationId
              ? { ...notification, readAt: new Date().toISOString() }
              : notification,
          ),
    );
    setUnreadCount((count) => Math.max(0, count - 1));
  }

  function handleMarkAllRead() {
    startMarkAllRead(async () => {
      await markAllNotificationsReadAction();
      const [freshCount, freshPreview] = await Promise.all([
        getUnreadNotificationCountAction(),
        getNotificationsPreviewAction(),
      ]);
      setUnreadCount(freshCount);
      setNotifications(freshPreview);
    });
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-controls="notification-bell-menu"
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : "Notifications"
        }
        onClick={() => setIsOpen((open) => !open)}
        className="relative flex size-11 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <Bell className="size-5" aria-hidden="true" />
        {unreadCount > 0 ? (
          <span
            aria-hidden="true"
            className="absolute right-1.5 top-1.5 flex min-w-[18px] items-center justify-center rounded-full bg-error px-1 text-[10px] font-semibold leading-[18px] text-white"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div
          id="notification-bell-menu"
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-white shadow-lg"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <p className="text-sm font-semibold text-foreground">
              Notifications
            </p>
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={isMarkingAllRead || unreadCount === 0}
              className="text-xs font-medium text-accent transition-colors hover:text-accent-hover disabled:pointer-events-none disabled:opacity-50"
            >
              Mark all read
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications === null && !hasLoadError ? (
              <div
                className="space-y-3 px-4 py-4"
                aria-label="Loading notifications"
              >
                {[0, 1, 2].map((index) => (
                  <div
                    key={index}
                    className="h-12 animate-pulse rounded-md bg-nexfora-gray-200/80"
                  />
                ))}
              </div>
            ) : hasLoadError ? (
              <p className="px-4 py-6 text-center text-sm text-text-secondary">
                We couldn&apos;t load your notifications. Try again shortly.
              </p>
            ) : (
              <NotificationList
                notifications={notifications ?? []}
                onRead={handleItemRead}
              />
            )}
          </div>

          <div className="border-t border-border px-4 py-2.5">
            <Link
              href="/admin/notifications"
              onClick={close}
              className={cn(
                "block text-center text-sm font-medium text-accent transition-colors hover:text-accent-hover",
              )}
            >
              View all
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
