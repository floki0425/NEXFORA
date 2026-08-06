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
import { ACTIVE_PROJECT_STATUSES } from "@/features/reports/constants";
import {
  formatReportCount,
  formatReportDays,
  formatReportPercent,
  formatReportRange,
} from "@/features/reports/format";
import { hasActiveFilters, one, resolvedWindow, type RawSearchParams } from "@/features/reports/params";
import { getProjectDeliveryReport } from "@/features/reports/queries";
import { projectDeliveryFiltersSchema } from "@/features/reports/schemas";

export const dynamic = "force-dynamic";

const label = (value: string) =>
  value.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export default async function ProjectDeliveryReportPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const member = await requireReportAccess("project_delivery");
  const params = await searchParams;

  const filters = projectDeliveryFiltersSchema.parse({
    preset: one(params.preset),
    from: one(params.from),
    to: one(params.to),
    status: one(params.status),
    projectManagerId: one(params.projectManagerId),
    clientId: one(params.clientId),
  });

  const window = resolvedWindow(filters);
  const result = await getProjectDeliveryReport(filters);

  // The RPC scopes a project_manager to projects where they are the assigned
  // project_manager_id, so the page must not claim an organization-wide view.
  const isScopedToOwnProjects = member.role === "project_manager";

  const hasData =
    result.status === "ok" &&
    (result.data.completed_in_period > 0 ||
      result.data.active_by_status.some((b) => b.total > 0));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Project Delivery"
        description={
          isScopedToOwnProjects
            ? "Delivery performance for the projects you are assigned to manage."
            : "Delivery performance across every project in the workspace."
        }
      />

      <ReportFilterBar
        action="/admin/reports/project-delivery"
        preset={filters.preset}
        from={filters.from}
        to={filters.to}
        resolvedFrom={window.from}
        resolvedTo={window.to}
        hasFilters={hasActiveFilters(filters)}
        extraFilters={[
          {
            name: "status",
            label: "Status",
            value: filters.status,
            options: ACTIVE_PROJECT_STATUSES.map((s) => ({ value: s, label: label(s) })),
          },
        ]}
      />

      {result.status === "denied" ? <ReportDeniedState /> : null}
      {result.status === "error" ? <ReportErrorState /> : null}
      {result.status === "ok" && !hasData ? (
        <ReportEmptyState range={formatReportRange(window.from, window.to)} />
      ) : null}

      {result.status === "ok" && hasData ? (
        <>
          <ReportMetricGrid>
            <ReportMetric
              label={result.data.metric_label}
              value={formatReportPercent(result.data.schedule_on_time_rate)}
              hint={`${result.data.on_schedule_count} of ${result.data.rated_count} rated projects`}
              tone="accent"
            />
            <ReportMetric
              label="Completed in period"
              value={formatReportCount(result.data.completed_in_period)}
            />
            <ReportMetric
              label="Completed without target date"
              value={formatReportCount(result.data.no_target_date_count)}
              hint="Excluded from the rate"
            />
            <ReportMetric
              label="Average delivery time"
              value={formatReportDays(result.data.avg_delivery_days)}
            />
          </ReportMetricGrid>

          <Card className="border-warning/40 bg-warning-soft/40">
            <CardContent className="py-4">
              <p className="text-sm text-text-secondary">
                <strong className="font-semibold text-text-primary">
                  This measures schedule adherence, not team performance.
                </strong>{" "}
                The current system cannot distinguish client-caused delays from
                internal delays.
              </p>
            </CardContent>
          </Card>

          <ReportMetricGrid>
            <ReportMetric
              label="Overdue active projects"
              value={formatReportCount(result.data.overdue_active_count)}
            />
            <ReportMetric
              label="Milestone completion"
              value={formatReportPercent(result.data.milestone_completion_rate)}
            />
            <ReportMetric
              label="Overdue milestones"
              value={formatReportCount(result.data.overdue_milestone_count)}
            />
            <ReportMetric
              label="Tasks completed in period"
              value={formatReportCount(result.data.tasks_completed_in_period)}
            />
          </ReportMetricGrid>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Active projects by status</CardTitle>
              </CardHeader>
              <CardContent>
                <BarList
                  caption="Active projects by status, excluding completed and cancelled"
                  items={result.data.active_by_status.map((b) => ({
                    label: label(b.status),
                    value: b.total,
                  }))}
                  emptyLabel="No active projects."
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Open tasks by status</CardTitle>
              </CardHeader>
              <CardContent>
                <BarList
                  caption="Open tasks by status"
                  items={result.data.open_tasks_by_status.map((b) => ({
                    label: label(b.status),
                    value: b.total,
                  }))}
                  emptyLabel="No open tasks."
                />
              </CardContent>
            </Card>
          </div>

          {result.data.progress_drift.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Progress drift</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <p className="mb-3 text-xs text-text-muted">
                  Where the recorded progress percentage disagrees with progress
                  derived from completed tasks. Reported only — nothing is
                  overwritten.
                </p>
                <table className="w-full min-w-[32rem] border-collapse text-sm">
                  <caption className="sr-only">
                    Projects where stored progress differs from task-derived progress
                  </caption>
                  <thead>
                    <tr className="border-b border-border text-left text-text-secondary">
                      <th scope="col" className="py-2 pr-3 font-medium">Project</th>
                      <th scope="col" className="py-2 pr-3 text-right font-medium">Recorded</th>
                      <th scope="col" className="py-2 pr-3 text-right font-medium">From tasks</th>
                      <th scope="col" className="py-2 text-right font-medium">Drift</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.data.progress_drift.map((row) => (
                      <tr key={row.project_id} className="border-b border-border/60">
                        <th scope="row" className="py-2 pr-3 text-left font-normal text-text-primary">
                          {row.project_name}
                        </th>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {row.stored_progress_percent}%
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {row.derived_progress_percent}%
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {row.drift > 0 ? "+" : ""}
                          {row.drift}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
