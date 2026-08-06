import { resolveReportRange } from "@/lib/reporting/date-range";

export type RawSearchParams = Record<string, string | string[] | undefined>;

/** Search params may repeat; take the first occurrence, as the list pages do. */
export function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

/**
 * Resolves the window a page will actually query, after preset expansion and
 * the 366-day clamp, so the filter bar can show the true range rather than
 * whatever was typed.
 */
export function resolvedWindow(filters: {
  preset: string;
  from: string;
  to: string;
}) {
  return resolveReportRange(filters);
}

/** Whether any filter differs from the default view. */
export function hasActiveFilters(
  filters: Record<string, string>,
  defaults: Record<string, string> = { preset: "last_30_days" },
): boolean {
  return Object.entries(filters).some(([key, value]) => {
    const fallback = defaults[key] ?? "";
    return value !== fallback && value !== "";
  });
}
