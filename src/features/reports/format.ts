// Report formatters. All pin Asia/Manila and en-PH, matching the Phase 10/11
// modules. A null rate means "no data" and renders as an em dash -- never as
// 0%, which is a different and misleading answer.

const EMPTY_VALUE = "—";

export function formatReportMoney(
  amount: number | null | undefined,
  currency: string,
): string {
  if (amount === null || amount === undefined) {
    return EMPTY_VALUE;
  }

  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Takes a 0..1 ratio. Null (an undefined rate) renders as an em dash. */
export function formatReportPercent(
  rate: number | null | undefined,
  fractionDigits = 1,
): string {
  if (rate === null || rate === undefined || Number.isNaN(rate)) {
    return EMPTY_VALUE;
  }

  return new Intl.NumberFormat("en-PH", {
    style: "percent",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(rate);
}

export function formatReportCount(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return EMPTY_VALUE;
  }

  return new Intl.NumberFormat("en-PH").format(value);
}

export function formatReportDays(days: number | null | undefined): string {
  if (days === null || days === undefined || Number.isNaN(days)) {
    return EMPTY_VALUE;
  }

  const rounded = Math.round(days * 10) / 10;
  return `${new Intl.NumberFormat("en-PH", {
    maximumFractionDigits: 1,
  }).format(rounded)} ${Math.abs(rounded) === 1 ? "day" : "days"}`;
}

/** Formats a YYYY-MM-DD calendar date without shifting it across timezones. */
export function formatReportDay(value: string | null | undefined): string {
  if (!value) {
    return EMPTY_VALUE;
  }

  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeZone: "Asia/Manila",
  }).format(new Date(`${value}T00:00:00+08:00`));
}

/** Formats a YYYY-MM month key from the revenue monthly series. */
export function formatReportMonth(value: string | null | undefined): string {
  if (!value) {
    return EMPTY_VALUE;
  }

  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    year: "numeric",
    timeZone: "Asia/Manila",
  }).format(new Date(`${value}-01T00:00:00+08:00`));
}

export function formatReportRange(from: string, to: string): string {
  return `${formatReportDay(from)} – ${formatReportDay(to)}`;
}
