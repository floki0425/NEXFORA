import { ShieldCheck, Settings } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ModulePlaceholder } from "@/components/layout/module-placeholder";
import { Card, CardContent } from "@/components/ui/card";
import { requireSettingsAccess } from "@/lib/auth/settings-access";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  await requireSettingsAccess();

  return (
    <ModulePlaceholder
      title="Settings"
      description="This restricted workspace is reserved for organization and administrative configuration."
      phase="Admin only"
      icon={Settings}
      emptyTitle="Settings are not available yet"
      emptyDescription="Organization, team, and system settings will be implemented in a later authorized phase. No configuration data is fetched during Phase 2."
    >
      <Card>
        <CardContent className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ShieldCheck
              className="size-5 shrink-0 text-text-secondary"
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-semibold text-foreground">
                Audit log
              </p>
              <p className="text-sm text-text-secondary">
                Review sensitive actions across your organization.
              </p>
            </div>
          </div>
          <Link
            href="/admin/settings/audit-log"
            className="text-sm font-medium text-accent hover:underline"
          >
            View audit log
          </Link>
        </CardContent>
      </Card>
    </ModulePlaceholder>
  );
}
