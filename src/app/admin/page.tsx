import {
  Activity,
  BriefcaseBusiness,
  FolderKanban,
  ListTodo,
  UsersRound,
} from "lucide-react";
import type { Metadata } from "next";

import { QuickActionCard } from "@/components/dashboard/quick-action-card";
import { StatCard } from "@/components/dashboard/stat-card";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireInternalMember } from "@/lib/auth/server";

export const metadata: Metadata = {
  title: "Dashboard",
};

interface AdminPageProps {
  searchParams: Promise<{
    notice?: string | string[];
  }>;
}

const SUMMARY_CARDS = [
  {
    label: "Active Leads",
    value: "—",
    description: "Available when lead management launches.",
    icon: UsersRound,
  },
  {
    label: "Active Clients",
    value: "—",
    description: "Available when client records launch.",
    icon: BriefcaseBusiness,
  },
  {
    label: "Active Projects",
    value: "—",
    description: "Available when project tracking launches.",
    icon: FolderKanban,
  },
  {
    label: "Pending Tasks",
    value: "—",
    description: "Available when project tasks launch.",
    icon: ListTodo,
  },
] as const;

const QUICK_ACTIONS = [
  {
    title: "Open Leads",
    description:
      "Preview the reserved workspace for lead management and CRM.",
    href: "/admin/leads",
    icon: UsersRound,
    status: "Phase 3",
  },
  {
    title: "Open Clients",
    description:
      "Preview the reserved workspace for future client records.",
    href: "/admin/clients",
    icon: BriefcaseBusiness,
    status: "Phase 4",
  },
  {
    title: "Open Projects",
    description:
      "Preview the reserved workspace for project delivery tools.",
    href: "/admin/projects",
    icon: FolderKanban,
    status: "Phase 5",
  },
] as const;

export default async function AdminPage({
  searchParams,
}: AdminPageProps) {
  const [member, params] = await Promise.all([
    requireInternalMember(),
    searchParams,
  ]);
  const notice = Array.isArray(params.notice)
    ? params.notice[0]
    : params.notice;

  return (
    <div className="space-y-8 lg:space-y-10">
      {notice === "logout_failed" ? (
        <div
          role="alert"
          className="rounded-lg border border-warning/25 bg-warning-soft px-4 py-3 text-sm text-warning"
        >
          We couldn&apos;t sign you out. Please try again.
        </div>
      ) : null}

      {notice === "settings_access_denied" ? (
        <div
          role="alert"
          className="rounded-lg border border-error/25 bg-error-soft px-4 py-3 text-sm text-error"
        >
          Settings are available only to administrators.
        </div>
      ) : null}

      <PageHeader
        eyebrow="NEXFORA OS"
        title={`Welcome, ${member.profile.fullName}`}
        description="Your secure operations workspace is ready. Business modules will be introduced in their planned phases without inventing activity or metrics."
        action={<Badge variant="accent">Phase 2 · Admin Foundation</Badge>}
      />

      <section aria-labelledby="workspace-summary-title">
        <div className="mb-4">
          <h2
            id="workspace-summary-title"
            className="text-lg font-semibold text-foreground"
          >
            Workspace summary
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Metrics remain unavailable until their source modules launch.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {SUMMARY_CARDS.map((summaryCard) => (
            <StatCard key={summaryCard.label} {...summaryCard} />
          ))}
        </div>
      </section>

      <section aria-labelledby="quick-actions-title">
        <div className="mb-4">
          <h2
            id="quick-actions-title"
            className="text-lg font-semibold text-foreground"
          >
            Quick actions
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Navigate to the reserved module workspaces.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {QUICK_ACTIONS.map((quickAction) => (
            <QuickActionCard key={quickAction.href} {...quickAction} />
          ))}
        </div>
      </section>

      <section aria-labelledby="recent-activity-title">
        <Card>
          <CardHeader>
            <CardTitle id="recent-activity-title">
              Recent activity
            </CardTitle>
            <CardDescription>
              Meaningful business events will appear here once operational
              modules are available.
            </CardDescription>
          </CardHeader>
          <EmptyState
            icon={Activity}
            title="No recent activity"
            description="There is no operational activity to show during the admin foundation phase."
            className="pt-10"
          />
        </Card>
      </section>
    </div>
  );
}
