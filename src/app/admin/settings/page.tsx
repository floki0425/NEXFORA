import { Settings } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ModulePlaceholder } from "@/components/layout/module-placeholder";
import { SETTINGS_ROLES } from "@/config/admin-navigation";
import {
  AuthenticationRequiredError,
  AuthorizationDeniedError,
} from "@/lib/auth/errors";
import { requireInternalMember } from "@/lib/auth/server";

export const metadata: Metadata = {
  title: "Settings",
};

async function requireSettingsAccess() {
  let member;

  try {
    member = await requireInternalMember();
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect("/auth/login?reason=session_required");
    }

    if (error instanceof AuthorizationDeniedError) {
      redirect("/auth/login?reason=access_denied");
    }

    throw error;
  }

  if (!SETTINGS_ROLES.some((role) => role === member.role)) {
    redirect("/admin?notice=settings_access_denied");
  }

  return member;
}

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
    />
  );
}
