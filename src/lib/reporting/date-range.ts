// Report date-range resolution, fixed to Asia/Manila.
//
// Every Phase 12A report buckets on Asia/Manila, deliberately NOT on
// profiles.timezone: a per-viewer timezone would make two admins reading the
// same report on the same day see different numbers, which is a reporting
// defect rather than a personalization feature.
//
// Calendar arithmetic here runs on YYYY-MM-DD strings through Date.UTC, so it
// never picks up the host's local timezone. "Today in Manila" is derived
// through Intl rather than a hardcoded offset, so it stays correct even
// though the Philippines has observed no DST since 1978.
//
// This module must not import from src/features -- src/lib never depends on
// src/features in this repository.

export const MANILA_TIME_ZONE = "Asia/Manila";

/** 365 days of difference is 366 days inclusive. */
export const MAX_REPORT_RANGE_DAYS = 366;

export const REPORT_RANGE_PRESETS = [
  "last_30_days",
  "this_month",
  "last_month",
  "this_quarter",
  "this_year",
  "custom",
] as const;

export type ReportRangePreset = (typeof REPORT_RANGE_PRESETS)[number];

export interface ReportRange {
  from: string;
  to: string;
}

export interface ReportRangeInput {
  preset?: string;
  from?: string;
  to?: string;
}

const DATE_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const MILLISECONDS_PER_DAY = 86_400_000;

function toUtcMillis(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function fromUtcMillis(millis: number): string {
  const value = new Date(millis);
  const year = String(value.getUTCFullYear()).padStart(4, "0");
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Validates a YYYY-MM-DD input and rejects impossible calendar dates such as
 * 2026-02-30, which a pattern check alone would accept.
 */
export function parseDateInput(value: string | undefined | null): string | null {
  if (!value || !DATE_INPUT_PATTERN.test(value)) {
    return null;
  }

  return fromUtcMillis(toUtcMillis(value)) === value ? value : null;
}

export function isReportRangePreset(value: unknown): value is ReportRangePreset {
  return (
    typeof value === "string" &&
    (REPORT_RANGE_PRESETS as readonly string[]).includes(value)
  );
}

/** Today's calendar date in Asia/Manila, as YYYY-MM-DD. */
export function manilaToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: MANILA_TIME_ZONE,
  }).formatToParts(now);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return year && month && day ? `${year}-${month}-${day}` : fromUtcMillis(now.getTime());
}

export function addDays(date: string, days: number): string {
  return fromUtcMillis(toUtcMillis(date) + days * MILLISECONDS_PER_DAY);
}

/** Whole days from `from` to `to`. Negative when `to` precedes `from`. */
export function differenceInDays(from: string, to: string): number {
  return Math.round((toUtcMillis(to) - toUtcMillis(from)) / MILLISECONDS_PER_DAY);
}

function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

function startOfQuarter(date: string): string {
  const month = Number(date.slice(5, 7));
  const quarterStartMonth = Math.floor((month - 1) / 3) * 3 + 1;
  return `${date.slice(0, 4)}-${String(quarterStartMonth).padStart(2, "0")}-01`;
}

function startOfYear(date: string): string {
  return `${date.slice(0, 4)}-01-01`;
}

/**
 * Normalizes a range so it is always ordered and never exceeds the maximum
 * span. A reversed range is swapped rather than rejected; an over-long range
 * keeps its end date and moves the start forward, since a user who asked for
 * too much history almost always wants the most recent window.
 */
export function clampReportRange(range: ReportRange): ReportRange {
  const ordered: ReportRange =
    differenceInDays(range.from, range.to) < 0
      ? { from: range.to, to: range.from }
      : range;

  if (differenceInDays(ordered.from, ordered.to) > MAX_REPORT_RANGE_DAYS - 1) {
    return {
      from: addDays(ordered.to, -(MAX_REPORT_RANGE_DAYS - 1)),
      to: ordered.to,
    };
  }

  return ordered;
}

/**
 * Resolves a preset (or a validated custom range) into concrete Manila
 * calendar bounds. Never throws: unusable input falls back to the trailing
 * 30 days, matching how the filter schemas degrade.
 */
export function resolveReportRange(
  input: ReportRangeInput = {},
  now: Date = new Date(),
): ReportRange {
  const today = manilaToday(now);
  const preset = isReportRangePreset(input.preset) ? input.preset : "last_30_days";

  if (preset === "custom") {
    const from = parseDateInput(input.from);
    const to = parseDateInput(input.to);

    if (from && to) {
      return clampReportRange({ from, to });
    }

    if (from && !to) {
      return clampReportRange({ from, to: today });
    }

    if (!from && to) {
      return clampReportRange({ from: addDays(to, -29), to });
    }

    return { from: addDays(today, -29), to: today };
  }

  switch (preset) {
    case "this_month":
      return { from: startOfMonth(today), to: today };
    case "last_month": {
      const firstOfThisMonth = startOfMonth(today);
      const lastOfPreviousMonth = addDays(firstOfThisMonth, -1);
      return { from: startOfMonth(lastOfPreviousMonth), to: lastOfPreviousMonth };
    }
    case "this_quarter":
      return { from: startOfQuarter(today), to: today };
    case "this_year":
      return { from: startOfYear(today), to: today };
    case "last_30_days":
    default:
      return { from: addDays(today, -29), to: today };
  }
}
