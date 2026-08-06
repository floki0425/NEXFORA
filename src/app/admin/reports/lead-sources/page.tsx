import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireReportAccess } from "@/lib/auth/reports-access";
import { ReportFilterBar } from "@/features/reports/components/report-filter-bar";
import {
  ReportDeniedState,
  ReportEmptyState,
  ReportErrorState,
} from "@/features/reports/components/report-empty-state";
import {
  formatReportCount,
  formatReportMoney,
  formatReportPercent,
  formatReportRange,
} from "@/features/reports/format";
import { hasActiveFilters, one, resolvedWindow, type RawSearchParams } from "@/features/reports/params";
import { getLeadSourceReport } from "@/features/reports/queries";
import { leadSourceFiltersSchema } from "@/features/reports/schemas";

export const dynamic = "force-dynamic";

export default async function LeadSourcesReportPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requireReportAccess("lead_source");
  const params = await searchParams;

  const filters = leadSourceFiltersSchema.parse({
    preset: one(params.preset),
    from: one(params.from),
    to: one(params.to),
    assignedTo: one(params.assignedTo),
  });

  const window = resolvedWindow(filters);
  const result = await getLeadSourceReport(filters);
  const hasLeads =
    result.status === "ok" && result.data.sources.some((s) => s.lead_count > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lead Sources"
        description="Which acquisition channels produce leads that convert and earn."
      />

      <ReportFilterBar
        action="/admin/reports/lead-sources"
        preset={filters.preset}
        from={filters.from}
        to={filters.to}
        resolvedFrom={window.from}
        resolvedTo={window.to}
        hasFilters={hasActiveFilters(filters)}
      />

      {result.status === "denied" ? <ReportDeniedState /> : null}
      {result.status === "error" ? <ReportErrorState /> : null}
      {result.status === "ok" && !hasLeads ? (
        <ReportEmptyState range={formatReportRange(window.from, window.to)} />
      ) : null}

      {result.status === "ok" && hasLeads ? (
        <Card>
          <CardHeader>
            <CardTitle>By source</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[52rem] border-collapse text-sm">
              <caption className="sr-only">
                Lead performance by acquisition source for the selected range
              </caption>
              <thead>
                <tr className="border-b border-border text-left text-text-secondary">
                  <th scope="col" className="py-2 pr-3 font-medium">Source</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Leads</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Qualified</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Won</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Lost</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Converted</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Conv. rate</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Avg score</th>
                  <th scope="col" className="py-2 text-right font-medium">
                    First-touch attributed revenue
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.data.sources.map((row) => (
                  <tr key={row.source} className="border-b border-border/60">
                    <th scope="row" className="py-2 pr-3 text-left font-normal capitalize text-text-primary">
                      {row.source.replace(/_/g, " ")}
                    </th>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatReportCount(row.lead_count)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatReportCount(row.qualified_count)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatReportCount(row.won_count)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatReportCount(row.lost_count)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatReportCount(row.converted_count)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatReportPercent(row.conversion_rate)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {row.avg_lead_score === null ? "—" : row.avg_lead_score.toFixed(1)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {row.attributed_paid_total.length === 0
                        ? "—"
                        : row.attributed_paid_total.map((total) => (
                            <div key={total.currency}>
                              {formatReportMoney(total.total, total.currency)}
                            </div>
                          ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}

      <p className="text-xs text-text-muted">
        <strong className="font-semibold">First-touch attributed revenue</strong> credits
        every settled payment from a client to the channel of the lead that originated
        them. It is a channel signal, not a multi-touch revenue split, and it is not
        limited to payments made inside the selected range.
      </p>
    </div>
  );
}
