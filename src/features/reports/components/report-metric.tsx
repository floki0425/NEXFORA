import { cn } from "@/lib/utils/cn";

export interface ReportMetricProps {
  label: string;
  value: string;
  /** Short clarifier, e.g. the basis or denominator of the figure. */
  hint?: string;
  /** Groups the tile under a basis heading, e.g. "cash" vs "accrual". */
  tone?: "default" | "accent" | "muted";
  className?: string;
}

const TONE_STYLES: Record<NonNullable<ReportMetricProps["tone"]>, string> = {
  default: "border-border bg-surface",
  accent: "border-accent/40 bg-accent/5",
  muted: "border-border bg-surface-muted",
};

/**
 * One report figure. `value` is pre-formatted by the caller so an undefined
 * metric arrives as an em dash and is never shown as a misleading zero.
 */
export function ReportMetric({
  label,
  value,
  hint,
  tone = "default",
  className,
}: ReportMetricProps) {
  return (
    <div className={cn("rounded-xl border p-4", TONE_STYLES[tone], className)}>
      <dt className="text-sm font-medium text-text-secondary">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums text-text-primary">
        {value}
      </dd>
      {hint ? <p className="mt-1 text-xs text-text-muted">{hint}</p> : null}
    </div>
  );
}

export function ReportMetricGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid gap-3 sm:grid-cols-2 lg:grid-cols-4",
        className,
      )}
    >
      {children}
    </dl>
  );
}
