import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  leadConversionFiltersSchema,
  projectDeliveryFiltersSchema,
  proposalWinRateFiltersSchema,
  reportFiltersSchema,
  revenueFiltersSchema,
} from "../../../src/features/reports/schemas.ts";

const ALL_SCHEMAS = [
  ["reportFiltersSchema", reportFiltersSchema],
  ["leadConversionFiltersSchema", leadConversionFiltersSchema],
  ["proposalWinRateFiltersSchema", proposalWinRateFiltersSchema],
  ["revenueFiltersSchema", revenueFiltersSchema],
  ["projectDeliveryFiltersSchema", projectDeliveryFiltersSchema],
];

const HOSTILE_INPUTS = [
  undefined,
  {},
  { preset: "'; drop table leads; --" },
  { preset: 42, from: [], to: {} },
  { from: "2026-02-30", to: "not-a-date" },
  { from: "9999-99-99", to: "0000-00-00" },
  { preset: null, from: null, to: null },
  { assignedTo: "not-a-uuid", clientId: 12345, createdBy: [] },
  { status: "definitely_not_a_status" },
  { preset: "custom", from: "x".repeat(5000) },
];

describe("report filter schemas", () => {
  test("every schema parses hostile input without throwing", () => {
    for (const [name, schema] of ALL_SCHEMAS) {
      for (const input of HOSTILE_INPUTS) {
        assert.doesNotThrow(
          () => schema.parse(input),
          `${name} threw on ${JSON.stringify(input)}`,
        );
      }
    }
  });

  test("an absent preset defaults to last_30_days", () => {
    assert.equal(reportFiltersSchema.parse({}).preset, "last_30_days");
    assert.equal(reportFiltersSchema.parse(undefined).preset, "last_30_days");
  });

  test("an unknown preset falls back rather than propagating", () => {
    assert.equal(
      reportFiltersSchema.parse({ preset: "since_the_dawn_of_time" }).preset,
      "last_30_days",
    );
    assert.equal(reportFiltersSchema.parse({ preset: 42 }).preset, "last_30_days");
  });

  test("valid presets and dates survive parsing intact", () => {
    const parsed = reportFiltersSchema.parse({
      preset: "custom",
      from: "2026-03-01",
      to: "2026-03-31",
    });

    assert.deepEqual(parsed, {
      preset: "custom",
      from: "2026-03-01",
      to: "2026-03-31",
    });
  });

  test("malformed dates degrade to an empty string, not a bad date", () => {
    const parsed = reportFiltersSchema.parse({
      preset: "custom",
      from: "2026-2-1",
      to: "31/03/2026",
    });

    assert.equal(parsed.from, "");
    assert.equal(parsed.to, "");
  });

  test("an impossible calendar date is rejected downstream by resolveReportRange", async () => {
    // The schema only guarantees shape; resolveReportRange owns calendar
    // validity, so 2026-02-30 must not reach a query as a usable bound.
    const { resolveReportRange } = await import(
      "../../../src/lib/reporting/date-range.ts"
    );
    const parsed = reportFiltersSchema.parse({
      preset: "custom",
      from: "2026-02-30",
      to: "2026-03-31",
    });

    const range = resolveReportRange(parsed, new Date("2026-08-04T04:00:00.000Z"));

    assert.notEqual(range.from, "2026-02-30");
    assert.equal(range.to, "2026-03-31");
  });

  test("uuid filters accept a uuid, blank out anything else, and default to empty", () => {
    const uuid = "11111111-1111-4111-8111-111111111111";

    assert.equal(
      leadConversionFiltersSchema.parse({ assignedTo: uuid }).assignedTo,
      uuid,
    );
    assert.equal(
      leadConversionFiltersSchema.parse({ assignedTo: "nope" }).assignedTo,
      "",
    );
    assert.equal(leadConversionFiltersSchema.parse({}).assignedTo, "");

    assert.equal(revenueFiltersSchema.parse({ clientId: uuid }).clientId, uuid);
    assert.equal(revenueFiltersSchema.parse({ clientId: 5 }).clientId, "");
    assert.equal(
      proposalWinRateFiltersSchema.parse({ createdBy: "nope" }).createdBy,
      "",
    );
  });

  test("enum filters accept known values and blank out unknown ones", () => {
    assert.equal(
      leadConversionFiltersSchema.parse({ source: "referral" }).source,
      "referral",
    );
    assert.equal(
      leadConversionFiltersSchema.parse({ source: "carrier_pigeon" }).source,
      "",
    );

    assert.equal(
      projectDeliveryFiltersSchema.parse({ status: "development" }).status,
      "development",
    );
    assert.equal(
      projectDeliveryFiltersSchema.parse({ status: "completed" }).status,
      "",
      "completed is not an active status and must not pass through",
    );
    assert.equal(
      projectDeliveryFiltersSchema.parse({ status: "nonsense" }).status,
      "",
    );
  });

  test("the 366-day cap is enforced by the range resolver, not left to the caller", async () => {
    const { resolveReportRange, differenceInDays, MAX_REPORT_RANGE_DAYS } =
      await import("../../../src/lib/reporting/date-range.ts");

    const parsed = reportFiltersSchema.parse({
      preset: "custom",
      from: "2015-01-01",
      to: "2026-08-04",
    });
    const range = resolveReportRange(parsed, new Date("2026-08-04T04:00:00.000Z"));

    assert.equal(
      differenceInDays(range.from, range.to) + 1,
      MAX_REPORT_RANGE_DAYS,
      "an over-long custom range must be clamped before it reaches the RPC",
    );
  });
});
