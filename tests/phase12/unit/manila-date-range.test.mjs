import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  MAX_REPORT_RANGE_DAYS,
  addDays,
  clampReportRange,
  differenceInDays,
  isReportRangePreset,
  manilaToday,
  parseDateInput,
  resolveReportRange,
} from "../../../src/lib/reporting/date-range.ts";

// A fixed instant that is deliberately awkward: 2026-08-04T17:30Z is already
// 2026-08-05 in Manila (UTC+8). Anything computing "today" in UTC gets the
// wrong day here.
const LATE_UTC_EVENING = new Date("2026-08-04T17:30:00.000Z");
const MIDDAY_UTC = new Date("2026-08-04T04:00:00.000Z");

describe("Manila report date ranges", () => {
  test("manilaToday rolls over ahead of UTC", () => {
    assert.equal(manilaToday(LATE_UTC_EVENING), "2026-08-05");
    assert.equal(manilaToday(MIDDAY_UTC), "2026-08-04");
  });

  test("parseDateInput rejects malformed and impossible calendar dates", () => {
    assert.equal(parseDateInput("2026-08-04"), "2026-08-04");
    assert.equal(parseDateInput("2024-02-29"), "2024-02-29");

    assert.equal(parseDateInput("2026-02-30"), null);
    assert.equal(parseDateInput("2026-13-01"), null);
    assert.equal(parseDateInput("2026-8-4"), null);
    assert.equal(parseDateInput("04/08/2026"), null);
    assert.equal(parseDateInput(""), null);
    assert.equal(parseDateInput(undefined), null);
    assert.equal(parseDateInput(null), null);
  });

  test("day arithmetic crosses month and year boundaries", () => {
    assert.equal(addDays("2026-01-01", -1), "2025-12-31");
    assert.equal(differenceInDays("2026-01-01", "2026-12-31"), 364);
    assert.equal(differenceInDays("2026-08-05", "2026-08-04"), -1);
  });

  test("day arithmetic respects leap years", () => {
    // 2024 is a leap year; 2026 is not.
    assert.equal(addDays("2024-02-28", 1), "2024-02-29");
    assert.equal(addDays("2024-02-29", 1), "2024-03-01");
    assert.equal(addDays("2026-02-28", 1), "2026-03-01");
    assert.equal(differenceInDays("2024-01-01", "2025-01-01"), 366);
    assert.equal(differenceInDays("2026-01-01", "2027-01-01"), 365);
  });

  test("last_30_days is 30 days inclusive, ending today in Manila", () => {
    const range = resolveReportRange({ preset: "last_30_days" }, LATE_UTC_EVENING);

    assert.deepEqual(range, { from: "2026-07-07", to: "2026-08-05" });
    assert.equal(differenceInDays(range.from, range.to) + 1, 30);
  });

  test("month, quarter and year presets anchor correctly", () => {
    assert.deepEqual(resolveReportRange({ preset: "this_month" }, LATE_UTC_EVENING), {
      from: "2026-08-01",
      to: "2026-08-05",
    });
    assert.deepEqual(resolveReportRange({ preset: "last_month" }, LATE_UTC_EVENING), {
      from: "2026-07-01",
      to: "2026-07-31",
    });
    assert.deepEqual(resolveReportRange({ preset: "this_quarter" }, LATE_UTC_EVENING), {
      from: "2026-07-01",
      to: "2026-08-05",
    });
    assert.deepEqual(resolveReportRange({ preset: "this_year" }, LATE_UTC_EVENING), {
      from: "2026-01-01",
      to: "2026-08-05",
    });
  });

  test("last_month handles a January boundary by stepping into the prior year", () => {
    const january = new Date("2026-01-15T04:00:00.000Z");
    assert.deepEqual(resolveReportRange({ preset: "last_month" }, january), {
      from: "2025-12-01",
      to: "2025-12-31",
    });
  });

  test("a custom range is honoured; partial custom input degrades sensibly", () => {
    assert.deepEqual(
      resolveReportRange(
        { preset: "custom", from: "2026-03-01", to: "2026-03-31" },
        LATE_UTC_EVENING,
      ),
      { from: "2026-03-01", to: "2026-03-31" },
    );

    assert.deepEqual(
      resolveReportRange({ preset: "custom", from: "2026-08-01" }, LATE_UTC_EVENING),
      { from: "2026-08-01", to: "2026-08-05" },
    );

    assert.deepEqual(
      resolveReportRange({ preset: "custom", to: "2026-08-05" }, LATE_UTC_EVENING),
      { from: "2026-07-07", to: "2026-08-05" },
    );
  });

  test("a reversed custom range is ordered rather than rejected", () => {
    assert.deepEqual(
      resolveReportRange(
        { preset: "custom", from: "2026-08-31", to: "2026-08-01" },
        LATE_UTC_EVENING,
      ),
      { from: "2026-08-01", to: "2026-08-31" },
    );
  });

  test("an over-long range keeps its end date and moves the start forward", () => {
    const clamped = clampReportRange({ from: "2020-01-01", to: "2026-08-05" });

    assert.equal(clamped.to, "2026-08-05");
    assert.equal(differenceInDays(clamped.from, clamped.to) + 1, MAX_REPORT_RANGE_DAYS);
  });

  test("a range of exactly 366 days is preserved untouched", () => {
    const to = "2026-08-05";
    const from = addDays(to, -(MAX_REPORT_RANGE_DAYS - 1));

    assert.deepEqual(clampReportRange({ from, to }), { from, to });
  });

  test("unusable input never throws and falls back to the trailing 30 days", () => {
    const fallback = { from: "2026-07-07", to: "2026-08-05" };

    assert.deepEqual(resolveReportRange({}, LATE_UTC_EVENING), fallback);
    assert.deepEqual(
      resolveReportRange({ preset: "not_a_preset" }, LATE_UTC_EVENING),
      fallback,
    );
    assert.deepEqual(
      resolveReportRange(
        { preset: "custom", from: "garbage", to: "also-garbage" },
        LATE_UTC_EVENING,
      ),
      fallback,
    );
  });

  test("isReportRangePreset narrows only known presets", () => {
    assert.equal(isReportRangePreset("this_month"), true);
    assert.equal(isReportRangePreset("custom"), true);
    assert.equal(isReportRangePreset("yesterday"), false);
    assert.equal(isReportRangePreset(42), false);
    assert.equal(isReportRangePreset(null), false);
  });
});
