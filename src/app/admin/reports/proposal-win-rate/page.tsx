import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireReportAccess } from "@/lib/auth/reports-access";
import { ReportFilterBar } from "@/features/reports/components/report-filter-bar";
import {
  ReportDeniedState,
  ReportEmptyState,
  ReportErrorState,
} from "@/features/reports/components/report-empty-state";
import { ReportMetric, ReportMetricGrid } from "@/features/reports/components/report-metric";
import {
  formatReportCount,
  formatReportDays,
  formatReportMoney,
  formatReportPercent,
  formatReportRange,
} from "@/features/reports/format";
import { hasActiveFilters, one, resolvedWindow, type RawSearchParams } from "@/features/reports/params";
import { getProposalWinRateReport } from "@/features/reports/queries";
import { proposalWinRateFiltersSchema } from "@/features/reports/schemas";

export const dynamic = "force-dynamic";

export default async function ProposalWinRateReportPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requireReportAccess("proposal_win_rate");
  const params = await searchParams;

  const filters = proposalWinRateFiltersSchema.parse({
    preset: one(params.preset),
    from: one(params.from),
    to: one(params.to),
    createdBy: one(params.createdBy),
  });

  const window = resolvedWindow(filters);
  const result = await getProposalWinRateReport(filters);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Proposal Win Rate"
        description="How effective proposals are, and what a win is worth. Cohort is proposals sent in the selected range."
      />

      <ReportFilterBar
        action="/admin/reports/proposal-win-rate"
        preset={filters.preset}
        from={filters.from}
        to={filters.to}
        resolvedFrom={window.from}
        resolvedTo={window.to}
        hasFilters={hasActiveFilters(filters)}
      />

      {result.status === "denied" ? <ReportDeniedState /> : null}
      {result.status === "error" ? <ReportErrorState /> : null}
      {result.status === "ok" && result.data.sent === 0 ? (
        <ReportEmptyState range={formatReportRange(window.from, window.to)} />
      ) : null}

      {result.status === "ok" && result.data.sent > 0 ? (
        <>
          <ReportMetricGrid className="lg:grid-cols-2">
            <ReportMetric
              label="Win Rate — Decided Proposals"
              value={formatReportPercent(result.data.win_rate_decided)}
              hint="Accepted ÷ (accepted + declined). Expired proposals are excluded."
              tone="accent"
            />
            <ReportMetric
              label="Sent-to-Accepted Rate"
              value={formatReportPercent(result.data.win_rate_sent)}
              hint="Accepted ÷ everything sent. Expired and still-open proposals dilute this."
              tone="muted"
            />
          </ReportMetricGrid>

          <ReportMetricGrid>
            <ReportMetric label="Sent" value={formatReportCount(result.data.sent)} />
            <ReportMetric label="Viewed" value={formatReportCount(result.data.viewed)} />
            <ReportMetric label="View rate" value={formatReportPercent(result.data.view_rate)} />
            <ReportMetric
              label="Accepted in period"
              value={formatReportCount(result.data.accepted_in_period)}
              hint="By acceptance date"
            />
          </ReportMetricGrid>

          <ReportMetricGrid>
            <ReportMetric label="Accepted" value={formatReportCount(result.data.accepted)} />
            <ReportMetric label="Declined" value={formatReportCount(result.data.declined)} />
            <ReportMetric
              label="Expired"
              value={formatReportCount(result.data.expired)}
              hint="Not counted as declined"
            />
            <ReportMetric
              label="Changes requested"
              value={formatReportCount(result.data.changes_requested)}
            />
          </ReportMetricGrid>

          <ReportMetricGrid className="lg:grid-cols-1">
            <ReportMetric
              label="Average decision time"
              value={formatReportDays(result.data.avg_days_to_decision)}
              hint="From sent to accepted or declined"
            />
          </ReportMetricGrid>

          <Card>
            <CardHeader>
              <CardTitle>Value by currency</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[32rem] border-collapse text-sm">
                <caption className="sr-only">
                  Proposal pipeline and won value, kept separate per currency
                </caption>
                <thead>
                  <tr className="border-b border-border text-left text-text-secondary">
                    <th scope="col" className="py-2 pr-3 font-medium">Currency</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">Pipeline sent</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">Won</th>
                    <th scope="col" className="py-2 text-right font-medium">Average won</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.value_by_currency.map((row) => (
                    <tr key={row.currency} className="border-b border-border/60">
                      <th scope="row" className="py-2 pr-3 text-left font-normal">{row.currency}</th>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {formatReportMoney(row.pipeline_total, row.currency)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {formatReportMoney(row.won_total, row.currency)}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {formatReportMoney(row.avg_won_total, row.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
