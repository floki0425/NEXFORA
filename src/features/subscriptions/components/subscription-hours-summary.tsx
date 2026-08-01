import { formatHours } from "../format";

interface SubscriptionHoursSummaryProps {
  includedHours: number | null;
  usedHours: number;
  remainingHours: number | null;
}

function Metric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "error";
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-muted p-4">
      <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </dt>
      <dd
        className={
          tone === "error"
            ? "mt-2 text-xl font-semibold text-error"
            : "mt-2 text-xl font-semibold text-foreground"
        }
      >
        {value}
      </dd>
    </div>
  );
}

export function SubscriptionHoursSummary({
  includedHours,
  usedHours,
  remainingHours,
}: SubscriptionHoursSummaryProps) {
  const hasOverage = remainingHours !== null && remainingHours < 0;

  return (
    <dl className="grid gap-3 sm:grid-cols-3">
      <Metric
        label="Included"
        value={includedHours === null ? "No limit set" : `${formatHours(includedHours)}h`}
      />
      <Metric label="Used" value={`${formatHours(usedHours)}h`} />
      <Metric
        label={hasOverage ? "Over allowance" : "Remaining"}
        value={
          remainingHours === null
            ? "Not tracked"
            : `${formatHours(Math.abs(remainingHours))}h`
        }
        tone={hasOverage ? "error" : "default"}
      />
    </dl>
  );
}
