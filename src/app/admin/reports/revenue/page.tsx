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
import { TrendChart } from "@/features/reports/components/trend-chart";
import { COHORT_COLLECTION_RATE_BASIS_LABEL } from "@/features/reports/constants";
import {
  formatReportCount,
  formatReportMoney,
  formatReportMonth,
  formatReportPercent,
  formatReportRange,
} from "@/features/reports/format";
import { hasActiveFilters, one, resolvedWindow, type RawSearchParams } from "@/features/reports/params";
import { getRevenueReport } from "@/features/reports/queries";
import { revenueFiltersSchema } from "@/features/reports/schemas";

export const dynamic = "force-dynamic";

export default async function RevenueReportPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requireReportAccess("revenue");
  const params = await searchParams;

  const filters = revenueFiltersSchema.parse({
    preset: one(params.preset),
    from: one(params.from),
    to: one(params.to),
    clientId: one(params.clientId),
  });

  const window = resolvedWindow(filters);
  const result = await getRevenueReport(filters);
  const hasData =
    result.status === "ok" &&
    (result.data.collected_in_period.length > 0 ||
      result.data.invoice_cohort.length > 0 ||
      result.data.ledger_open.length > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Revenue"
        description="Money collected, billed, owed and at risk. Currencies are always reported separately."
      />

      <ReportFilterBar
        action="/admin/reports/revenue"
        preset={filters.preset}
        from={filters.from}
        to={filters.to}
        resolvedFrom={window.from}
        resolvedTo={window.to}
        hasFilters={hasActiveFilters(filters)}
      />

      {result.status === "denied" ? <ReportDeniedState /> : null}
      {result.status === "error" ? <ReportErrorState /> : null}
      {result.status === "ok" && !hasData ? (
        <ReportEmptyState range={formatReportRange(window.from, window.to)} />
      ) : null}

      {result.status === "ok" && hasData ? (
        <>
          {/* Cash basis */}
          <section aria-labelledby="cash-heading" className="space-y-3">
            <div>
              <h2 id="cash-heading" className="text-sm font-semibold text-text-secondary">
                Cash basis — collected in the selected period
              </h2>
              <p className="text-xs text-text-muted">
                Settled payments whose payment date falls inside the range, whatever
                invoice they belong to.
              </p>
            </div>
            <ReportMetricGrid>
              {result.data.collected_in_period.map((row) => (
                <ReportMetric
                  key={row.currency}
                  label={`Collected (${row.currency})`}
                  value={formatReportMoney(row.total, row.currency)}
                  tone="accent"
                />
              ))}
              <ReportMetric
                label="Refunded payments"
                value={formatReportCount(result.data.refunded_count)}
                hint="Counted, never netted off collected"
                tone="muted"
              />
            </ReportMetricGrid>
          </section>

          {/* Accrual / cohort basis */}
          <section aria-labelledby="cohort-heading" className="space-y-3">
            <div>
              <h2 id="cohort-heading" className="text-sm font-semibold text-text-secondary">
                Invoice cohort — invoices issued in the selected period
              </h2>
              <p className="text-xs text-text-muted">
                Excludes draft and void invoices. Cohort collected counts payments
                against these invoices whenever they landed, so the rate is{" "}
                {COHORT_COLLECTION_RATE_BASIS_LABEL} and rises over time.
              </p>
            </div>
            {result.data.invoice_cohort.map((row) => (
              <ReportMetricGrid key={row.currency}>
                <ReportMetric
                  label={`Cohort billed (${row.currency})`}
                  value={formatReportMoney(row.cohort_billed, row.currency)}
                />
                <ReportMetric
                  label={`Cohort collected (${row.currency})`}
                  value={formatReportMoney(row.cohort_collected, row.currency)}
                />
                <ReportMetric
                  label="Cohort Collection Rate"
                  value={formatReportPercent(row.cohort_collection_rate)}
                  hint={COHORT_COLLECTION_RATE_BASIS_LABEL}
                  tone="accent"
                />
                <ReportMetric
                  label={`Cohort outstanding (${row.currency})`}
                  value={formatReportMoney(row.cohort_outstanding, row.currency)}
                />
              </ReportMetricGrid>
            ))}
          </section>

          {/* Point-in-time */}
          <section aria-labelledby="ledger-heading" className="space-y-3">
            <div>
              <h2 id="ledger-heading" className="text-sm font-semibold text-text-secondary">
                Point in time — the ledger right now
              </h2>
              <p className="text-xs text-text-muted">
                Not scoped to the selected range. Overdue is derived from due date and
                remaining balance, not from invoice status.
              </p>
            </div>
            <ReportMetricGrid>
              {result.data.ledger_open.map((row) => (
                <ReportMetric
                  key={`out-${row.currency}`}
                  label={`Current outstanding (${row.currency})`}
                  value={formatReportMoney(row.outstanding, row.currency)}
                  tone="muted"
                />
              ))}
              {result.data.ledger_open.map((row) => (
                <ReportMetric
                  key={`due-${row.currency}`}
                  label={`Current overdue (${row.currency})`}
                  value={formatReportMoney(row.overdue, row.currency)}
                  tone="muted"
                />
              ))}
              {result.data.mrr.map((row) => (
                <ReportMetric
                  key={`mrr-${row.currency}`}
                  label={`MRR (${row.currency})`}
                  value={formatReportMoney(row.total, row.currency)}
                  hint="Monthly-normalized active subscriptions"
                  tone="muted"
                />
              ))}
              <ReportMetric
                label="Custom-cycle subscriptions"
                value={formatReportCount(result.data.mrr_excluded_custom_cycle_count)}
                hint="Excluded from MRR — cannot be normalized"
                tone="muted"
              />
            </ReportMetricGrid>
          </section>

          {result.data.monthly_series.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Monthly cash collection</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {[...new Set(result.data.monthly_series.map((p) => p.currency))].map(
                  (currency) => (
                    <div key={currency}>
                      <h3 className="mb-2 text-sm font-medium text-text-secondary">
                        {currency}
                      </h3>
                      <TrendChart
                        caption={`Cash collected per month in ${currency}`}
                        valueHeading={`Collected (${currency})`}
                        points={result.data.monthly_series
                          .filter((p) => p.currency === currency)
                          .map((p) => ({
                            label: formatReportMonth(p.month),
                            value: p.collected,
                            display: formatReportMoney(p.collected, currency),
                          }))}
                      />
                    </div>
                  ),
                )}
              </CardContent>
            </Card>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
            <Card>
              <CardHeader>
                <CardTitle>Top clients by cash collected</CardTitle>
              </CardHeader>
              <CardContent>
                {result.data.top_clients.length === 0 ? (
                  <p className="text-sm text-text-muted">No payments in this range.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {result.data.top_clients.map((client) => (
                      <li
                        key={`${client.client_id}-${client.currency}`}
                        className="flex min-w-0 items-center justify-between gap-4"
                      >
                        <span className="min-w-0 flex-1 truncate text-text-primary">
                          {client.business_name ?? "Unnamed client"}
                        </span>
                        <span className="shrink-0 tabular-nums text-text-secondary">
                          {formatReportMoney(client.collected, client.currency)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Payment provider split</CardTitle>
              </CardHeader>
              <CardContent>
                {result.data.provider_split.length === 0 ? (
                  <p className="text-sm text-text-muted">No payments in this range.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {result.data.provider_split.map((row) => (
                      <li
                        key={`${row.provider}-${row.currency}`}
                        className="flex min-w-0 items-center justify-between gap-4"
                      >
                        <span className="min-w-0 flex-1 truncate capitalize text-text-primary">{row.provider}</span>
                        <span className="shrink-0 tabular-nums text-text-secondary">
                          {formatReportMoney(row.collected, row.currency)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
