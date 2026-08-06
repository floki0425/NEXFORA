import { cn } from "@/lib/utils/cn";

export interface BarListItem {
  label: string;
  value: number;
  /** Optional right-hand annotation, e.g. a formatted rate. */
  detail?: string;
}

export interface BarListProps {
  items: readonly BarListItem[];
  caption: string;
  /** Rendered when every value is zero, instead of a row of empty bars. */
  emptyLabel?: string;
  className?: string;
}

/**
 * Categorical comparison drawn with CSS widths -- no charting dependency.
 *
 * Rendered as a real table so it is readable by a screen reader and usable
 * without CSS; the bar is a decorative overlay behind the figure, marked
 * aria-hidden so the number is announced once, not twice.
 */
export function BarList({ items, caption, emptyLabel, className }: BarListProps) {
  const max = items.reduce((highest, item) => Math.max(highest, item.value), 0);

  if (items.length === 0 || max === 0) {
    return (
      <p className={cn("text-sm text-text-muted", className)}>
        {emptyLabel ?? "No data in this range."}
      </p>
    );
  }

  return (
    <table className={cn("w-full border-collapse text-sm", className)}>
      <caption className="sr-only">{caption}</caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">Category</th>
          <th scope="col">Value</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const percent = max === 0 ? 0 : Math.round((item.value / max) * 100);

          return (
            <tr key={item.label}>
              <th
                scope="row"
                className="w-2/5 py-1.5 pr-3 text-left font-normal align-middle text-text-secondary"
              >
                {item.label}
              </th>
              <td className="py-1.5 align-middle">
                <div className="flex items-center gap-3">
                  <div
                    className="relative h-5 flex-1 overflow-hidden rounded bg-surface-muted"
                    aria-hidden="true"
                  >
                    <div
                      className="h-full rounded bg-accent/70"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <span className="w-16 shrink-0 text-right tabular-nums text-text-primary">
                    {item.value}
                  </span>
                  {item.detail ? (
                    <span className="w-20 shrink-0 text-right tabular-nums text-text-muted">
                      {item.detail}
                    </span>
                  ) : null}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
