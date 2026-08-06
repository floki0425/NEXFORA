import Link from "next/link";
import { BarChart3, Coins, FileText, TrendingUp, UsersRound } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { visibleReportsForRole, type ReportId } from "@/config/admin-navigation";
import { requireReportsIndexAccess } from "@/lib/auth/reports-access";

export const dynamic = "force-dynamic";

const REPORT_CARDS: Record<
  ReportId,
  { title: string; href: string; description: string; icon: typeof BarChart3 }
> = {
  lead_conversion: {
    title: "Lead Conversion",
    href: "/admin/reports/lead-conversion",
    description: "How many inquiries become clients, and how long that takes.",
    icon: UsersRound,
  },
  lead_source: {
    title: "Lead Sources",
    href: "/admin/reports/lead-sources",
    description: "Which channels produce leads that convert and earn.",
    icon: TrendingUp,
  },
  proposal_win_rate: {
    title: "Proposal Win Rate",
    href: "/admin/reports/proposal-win-rate",
    description: "How effective proposals are, and what a win is worth.",
    icon: FileText,
  },
  revenue: {
    title: "Revenue",
    href: "/admin/reports/revenue",
    description: "Money collected, billed, owed and at risk.",
    icon: Coins,
  },
  project_delivery: {
    title: "Project Delivery",
    href: "/admin/reports/project-delivery",
    description: "Schedule adherence, milestones and delivery throughput.",
    icon: BarChart3,
  },
};

export default async function ReportsIndexPage() {
  const member = await requireReportsIndexAccess();
  // Only cards this role may actually open are rendered -- an unauthorized
  // report is never linked, not merely disabled.
  const visible = visibleReportsForRole(member.role);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description={
          member.role === "project_manager"
            ? "Delivery reporting for the projects you manage."
            : "Operational reporting across leads, sales, finance and delivery."
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((reportId) => {
          const card = REPORT_CARDS[reportId];
          const Icon = card.icon;

          return (
            <Link
              key={reportId}
              href={card.href}
              className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              <Card className="h-full p-5 transition-colors hover:border-accent/50">
                <Icon className="size-5 text-accent" aria-hidden="true" />
                <h2 className="mt-3 text-base font-semibold text-text-primary">
                  {card.title}
                </h2>
                <p className="mt-1 text-sm text-text-secondary">{card.description}</p>
              </Card>
            </Link>
          );
        })}
      </div>

      <p className="text-xs text-text-muted">
        All reports are bucketed in Asia/Manila. Figures reflect data available at
        the time the page was loaded.
      </p>
    </div>
  );
}
