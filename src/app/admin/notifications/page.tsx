import { Bell } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MarkAllReadButton } from "@/features/notifications/components/mark-all-read-button";
import { NotificationList } from "@/features/notifications/components/notification-list";
import { RunRemindersButton } from "@/features/notifications/components/run-reminders-button";
import { canRunRemindersManually } from "@/features/notifications/permissions";
import { getMyNotifications } from "@/features/notifications/queries";
import { requireInternalMember } from "@/lib/auth/server";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = {
  title: "Notifications",
  description: "Activity across leads, clients, projects, and billing.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const member = await requireInternalMember();
  const raw = await searchParams;
  const filter = one(raw.filter) === "unread" ? "unread" : "all";

  const allNotifications = await getMyNotifications();
  const notifications =
    filter === "unread"
      ? allNotifications.filter((notification) => notification.readAt === null)
      : allNotifications;

  const tabClass = (active: boolean) =>
    cn(
      "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
      active
        ? "bg-nexfora-black text-white"
        : "text-text-secondary hover:bg-surface-muted hover:text-foreground",
    );

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Workspace"
        title="Notifications"
        description="Everything that needs your attention across leads, clients, projects, and billing."
        action={
          <div className="flex flex-wrap items-start gap-3">
            {canRunRemindersManually(member) ? <RunRemindersButton /> : null}
            <MarkAllReadButton />
          </div>
        }
      />

      <div className="flex gap-2" role="tablist" aria-label="Notification filter">
        <Link
          href="/admin/notifications"
          role="tab"
          aria-selected={filter === "all"}
          className={tabClass(filter === "all")}
        >
          All
        </Link>
        <Link
          href="/admin/notifications?filter=unread"
          role="tab"
          aria-selected={filter === "unread"}
          className={tabClass(filter === "unread")}
        >
          Unread
        </Link>
      </div>

      <Card className="overflow-hidden">
        {notifications.length === 0 ? (
          <EmptyState
            icon={Bell}
            title={filter === "unread" ? "No unread notifications" : "No notifications yet"}
            description={
              filter === "unread"
                ? "You're all caught up."
                : "Activity on leads, clients, projects, and billing will show up here."
            }
          />
        ) : (
          <NotificationList notifications={notifications} />
        )}
      </Card>
    </div>
  );
}
