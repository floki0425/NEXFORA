import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { NotificationPreferencesForm } from "@/features/notifications/components/notification-preferences-form";
import { getMyNotificationPreferences } from "@/features/notifications/queries";
import { requireInternalMember } from "@/lib/auth/server";

export const metadata: Metadata = {
  title: "Notification preferences",
  description: "Choose which events notify you in-app and by email.",
};

export default async function AdminNotificationPreferencesPage() {
  await requireInternalMember();
  const preferences = await getMyNotificationPreferences();

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Workspace"
        title="Notification preferences"
        description="Choose which events notify you in-app and by email. Changes apply to future notifications only."
      />

      <Card>
        <CardContent>
          <NotificationPreferencesForm initialPreferences={preferences} />
        </CardContent>
      </Card>
    </div>
  );
}
