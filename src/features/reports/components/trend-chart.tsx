import { cn } from "@/lib/utils/cn";

export interface TrendPoint {
  label: string;
  value: number;
  /** Pre-formatted value for the accessible table, e.g. a currency string. */
  display: string;
}

export interface TrendChartProps {
  points: readonly TrendPoint[];
  caption: string;
  valueHeading?: string;
  emptyLabel?: string;
  className?: string;
}

const VIEWBOX_WIDTH = 600;
const VIEWBOX_HEIGHT = 160;
const BAR_GAP = 6;

/**
 * Time-series bars as inline SVG -- no charting dependency.
 *
 * The SVG is aria-hidden and paired with a visually hidden table carrying the
 * same numbers, so screen readers and no-CSS clients get the real data rather
 * than an unlabelled graphic. Uses a viewBox with preserveAspectRatio="none"
 * so it scales fluidly on mobile without JavaScript measurement.
 */
export function TrendChart({
  points,
  caption,
  valueHeading = "Value",
  emptyLabel,
  className,
}: TrendChartProps) {
  if (points.length === 0) {
    return (
      <p className={cn("text-sm text-text-muted", className)}>
        {emptyLabel ?? "No data in this range."}
      </p>
    );
  }

  const max = points.reduce((highest, point) => Math.max(highest, point.value), 0);
  const barWidth = VIEWBOX_WIDTH / points.length;

  return (
    <figure className={cn("m-0", className)}>
      <svg
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        preserveAspectRatio="none"
        role="presentation"
        aria-hidden="true"
        focusable="false"
        className="h-40 w-full"
      >
        {points.map((point, index) => {
          const height = max === 0 ? 0 : (point.value / max) * (VIEWBOX_HEIGHT - 8);
          return (
            <rect
              key={point.label}
              x={index * barWidth + BAR_GAP / 2}
              y={VIEWBOX_HEIGHT - height}
              width={Math.max(barWidth - BAR_GAP, 1)}
              height={height}
              rx="3"
              className="fill-accent/70"
            />
          );
        })}
      </svg>

      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
        {points.map((point) => (
          <span key={point.label}>
            {point.label}: <span className="tabular-nums">{point.display}</span>
          </span>
        ))}
      </figcaption>

      {/* The authoritative, accessible representation of the same data. */}
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            <th scope="col">{valueHeading}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.label}>
              <th scope="row">{point.label}</th>
              <td>{point.display}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
