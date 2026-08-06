import Link from "next/link";

import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { REPORT_RANGE_PRESETS } from "@/lib/reporting/date-range";

import { formatReportRange } from "../format.ts";

const PRESET_LABELS: Record<string, string> = {
  last_30_days: "Last 30 days",
  this_month: "This month",
  last_month: "Last month",
  this_quarter: "This quarter",
  this_year: "This year",
  custom: "Custom range",
};

export interface ReportFilterOption {
  name: string;
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
}

export interface ReportFilterBarProps {
  action: string;
  preset: string;
  from: string;
  to: string;
  /** The resolved window actually queried, after clamping. */
  resolvedFrom: string;
  resolvedTo: string;
  extraFilters?: readonly ReportFilterOption[];
  hasFilters?: boolean;
}

/**
 * URL-driven report filters. A plain GET form, so filtering works without
 * JavaScript and every view is linkable and back-button friendly -- matching
 * the eight existing admin list pages.
 */
export function ReportFilterBar({
  action,
  preset,
  from,
  to,
  resolvedFrom,
  resolvedTo,
  extraFilters = [],
  hasFilters = false,
}: ReportFilterBarProps) {
  return (
    <Card className="p-4 sm:p-5">
      <form method="get" className="grid gap-3 lg:grid-cols-5 lg:items-end">
        <div className="grid gap-1.5 text-sm">
          <label htmlFor="report-preset" className="font-medium text-text-secondary">
            Date range
          </label>
          <Select id="report-preset" name="preset" defaultValue={preset}>
            {REPORT_RANGE_PRESETS.map((value) => (
              <option key={value} value={value}>
                {PRESET_LABELS[value] ?? value}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid gap-1.5 text-sm">
          <label htmlFor="report-from" className="font-medium text-text-secondary">
            From
          </label>
          <Input id="report-from" type="date" name="from" defaultValue={from} />
        </div>

        <div className="grid gap-1.5 text-sm">
          <label htmlFor="report-to" className="font-medium text-text-secondary">
            To
          </label>
          <Input id="report-to" type="date" name="to" defaultValue={to} />
        </div>

        {extraFilters.map((filter) => (
          <div key={filter.name} className="grid gap-1.5 text-sm">
            <label
              htmlFor={`report-filter-${filter.name}`}
              className="font-medium text-text-secondary"
            >
              {filter.label}
            </label>
            <Select
              id={`report-filter-${filter.name}`}
              name={filter.name}
              defaultValue={filter.value}
            >
              <option value="">All</option>
              {filter.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
        ))}

        <button type="submit" className={buttonStyles({ variant: "secondary" })}>
          Apply
        </button>
      </form>

      <p className="mt-3 text-xs text-text-muted">
        Showing {formatReportRange(resolvedFrom, resolvedTo)} · Asia/Manila. Ranges
        are capped at 366 days.
      </p>

      {hasFilters ? (
        <Link
          href={action}
          className="mt-2 inline-block text-sm text-accent underline underline-offset-4"
        >
          Clear filters
        </Link>
      ) : null}
    </Card>
  );
}
