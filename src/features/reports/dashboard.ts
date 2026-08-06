import "server-only";

import type { InternalRole } from "@/lib/auth/types";

import { dashboardSummariesForRole } from "./dashboard-visibility.ts";
import { formatReportCount, formatReportMoney, formatReportPercent } from "./format.ts";
import {
  getLeadConversionReport,
  getProjectDeliveryReport,
  getProposalWinRateReport,
  getRevenueReport,
} from "./queries.ts";

// Dashboard summary tiles.
//
// Only the RPCs a role may actually see are called: an admin gets four, a
// project manager gets one (their own delivery scope), and a team member gets
// none. That keeps the dashboard from firing every report on every request
// and keeps restricted figures away from roles that must not receive them.

export interface DashboardTile {
  label: string;
  value: string;
  description: string;
}

export { dashboardSummariesForRole };

/** Month-to-date window, in the same Asia/Manila basis the reports use. */
function thisMonth() {
  return { preset: "this_month" as const };
}

export async function getDashboardTiles(
  role: InternalRole,
): Promise<DashboardTile[]> {
  const allowed = dashboardSummariesForRole(role);
  if (allowed.length === 0) return [];

  const tiles: DashboardTile[] = [];

  if (allowed.includes("leads")) {
    const leads = await getLeadConversionReport(thisMonth());
    tiles.push(
      leads.status === "ok"
        ? {
            label: "Leads this month",
            value: formatReportCount(leads.data.leads_created),
            description: `${formatReportPercent(leads.data.conversion_rate)} converted so far`,
          }
        : { label: "Leads this month", value: "—", description: "Unavailable right now." },
    );
  }

  if (allowed.includes("proposals")) {
    const proposals = await getProposalWinRateReport(thisMonth());
    tiles.push(
      proposals.status === "ok"
        ? {
            label: "Proposal win rate",
            value: formatReportPercent(proposals.data.win_rate_decided),
            description: `${formatReportCount(proposals.data.sent)} sent this month`,
          }
        : { label: "Proposal win rate", value: "—", description: "Unavailable right now." },
    );
  }

  if (allowed.includes("revenue")) {
    const revenue = await getRevenueReport(thisMonth());
    if (revenue.status === "ok") {
      // Only the primary currency is shown on a summary tile; the full
      // per-currency breakdown lives on the revenue report itself.
      const primary = revenue.data.collected_in_period[0];
      tiles.push({
        label: "Collected this month",
        value: primary ? formatReportMoney(primary.total, primary.currency) : "—",
        description:
          revenue.data.collected_in_period.length > 1
            ? `${revenue.data.collected_in_period.length} currencies — see the revenue report`
            : "Settled payments this month",
      });
    } else {
      tiles.push({
        label: "Collected this month",
        value: "—",
        description: "Unavailable right now.",
      });
    }
  }

  if (allowed.includes("delivery")) {
    const delivery = await getProjectDeliveryReport(thisMonth());
    const isScoped = role === "project_manager";
    tiles.push(
      delivery.status === "ok"
        ? {
            label: isScoped ? "Your active projects" : "Active projects",
            value: formatReportCount(
              delivery.data.active_by_status.reduce((sum, bucket) => sum + bucket.total, 0),
            ),
            description: `${formatReportCount(delivery.data.overdue_active_count)} past their target date`,
          }
        : {
            label: isScoped ? "Your active projects" : "Active projects",
            value: "—",
            description: "Unavailable right now.",
          },
    );
  }

  return tiles;
}
