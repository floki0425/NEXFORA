import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireReportAccess } from "@/lib/auth/reports-access";
import { BarList } from "@/features/reports/components/bar-list";
import { ReportFilterBar } from "@/features/reports/components/report-filter-bar";
import {
  ReportDeniedState,
  ReportEmptyState,
  ReportErrorState,
} from "@/features/reports/components/report-empty-state";
import { ReportMetric, ReportMetricGrid } from "@/features/reports/components/report-metric";
import { LEAD_SOURCES } from "@/features/reports/constants";
import {
  formatReportCount,
  formatReportDays,
  formatReportPercent,
  formatReportRange,
} from "@/features/reports/format";
import { hasActiveFilters, one, resolvedWindow, type RawSearchParams } from "@/features/reports/params";
import { getLeadConversionReport } from "@/features/reports/queries";
import { leadConversionFiltersSchema } from "@/features/reports/schemas";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  discovery: "Discovery",
  qualified: "Qualified",
  proposal: "Proposal",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
};

export default async function LeadConversionReportPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requireReportAccess("lead_conversion");
  const params = await searchParams;

  const filters = leadConversionFiltersSchema.parse({
    preset: one(params.preset),
    from: one(params.from),
    to: one(params.to),
    source: one(params.source),
    assignedTo: one(params.assignedTo),
  });

  const window = resolvedWindow(filters);
  const result = await getLeadConversionReport({
    ...filters,
    assignedTo: filters.assignedTo,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lead Conversion"
        description="How many inquiries become clients, and how long that takes."
      />

      <ReportFilterBar
        action="/admin/reports/lead-conversion"
        preset={filters.preset}
        from={filters.from}
        to={filters.to}
        resolvedFrom={window.from}
        resolvedTo={window.to}
        hasFilters={hasActiveFilters(filters)}
        extraFilters={[
          {
            name: "source",
            label: "Source",
            value: filters.source,
            options: LEAD_SOURCES.map((s) => ({ value: s, label: s.replace(/_/g, " ") })),
          },
        ]}
      />

      {result.status === "denied" ? <ReportDeniedState /> : null}
      {result.status === "error" ? <ReportErrorState /> : null}

      {result.status === "ok" && result.data.leads_created === 0 ? (
        <ReportEmptyState range={formatReportRange(window.from, window.to)} />
      ) : null}

      {result.status === "ok" && result.data.leads_created > 0 ? (
        <>
          <section aria-labelledby="conversion-heading" className="space-y-3">
            <h2 id="conversion-heading" className="text-sm font-semibold text-text-secondary">
              Created cohort — leads created in this range
            </h2>
            <ReportMetricGrid>
              <ReportMetric label="Leads created" value={formatReportCount(result.data.leads_created)} />
              <ReportMetric
                label="Converted from cohort"
                value={formatReportCount(result.data.leads_converted_from_cohort)}
                hint="Have since become clients"
              />
              <ReportMetric
                label="Conversion rate"
                value={formatReportPercent(result.data.conversion_rate)}
                tone="accent"
              />
              <ReportMetric
                label="Won but not converted"
                value={formatReportCount(result.data.won_not_converted)}
                hint="Marked won with no client record"
              />
            </ReportMetricGrid>
          </section>

          <section aria-labelledby="throughput-heading" className="space-y-3">
            <h2 id="throughput-heading" className="text-sm font-semibold text-text-secondary">
              Throughput and outcomes
            </h2>
            <ReportMetricGrid>
              <ReportMetric
                label="Conversions in period"
                value={formatReportCount(result.data.conversions_in_period)}
                hint="Converted in range, whenever created"
                tone="muted"
              />
              <ReportMetric label="Won" value={formatReportCount(result.data.won)} />
              <ReportMetric label="Lost" value={formatReportCount(result.data.lost)} />
              <ReportMetric label="Win rate" value={formatReportPercent(result.data.win_rate)} />
            </ReportMetricGrid>
            <ReportMetricGrid className="lg:grid-cols-2">
              <ReportMetric
                label="Average time to convert"
                value={formatReportDays(result.data.avg_days_to_convert)}
              />
              <ReportMetric
                label="Median time to convert"
                value={formatReportDays(result.data.median_days_to_convert)}
              />
            </ReportMetricGrid>
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Status funnel</CardTitle>
            </CardHeader>
            <CardContent>
              <BarList
                caption="Leads created in the selected range, by current status"
                items={result.data.funnel.map((bucket) => ({
                  label: STATUS_LABELS[bucket.status] ?? bucket.status,
                  value: bucket.total,
                }))}
              />
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
