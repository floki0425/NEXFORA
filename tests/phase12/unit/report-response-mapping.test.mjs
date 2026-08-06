import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { INTERNAL_ROLES } from "../../../src/lib/auth/types.ts";
import {
  REPORT_IDS,
  canViewAnyReport,
  canViewReport,
  visibleReportsForRole,
} from "../../../src/config/admin-navigation.ts";
import { dashboardSummariesForRole } from "../../../src/features/reports/dashboard-visibility.ts";
import {
  leadConversionSchema,
  revenueSchema,
  toReportResult,
} from "../../../src/features/reports/response.ts";

const validLeadConversion = {
  report_from: "2026-03-01",
  report_to: "2026-03-31",
  timezone: "Asia/Manila",
  leads_created: 8,
  leads_converted_from_cohort: 2,
  conversion_rate: 0.25,
  conversions_in_period: 3,
  won: 2,
  lost: 1,
  win_rate: 0.6667,
  won_not_converted: 1,
  avg_days_to_convert: 15,
  median_days_to_convert: 15,
  funnel: [{ status: "new", total: 1 }],
};

describe("report payload mapping", () => {
  test("a valid payload maps to ok with parsed data", () => {
    const result = toReportResult(leadConversionSchema, validLeadConversion, null);
    assert.equal(result.status, "ok");
    assert.equal(result.data.leads_created, 8);
    assert.equal(result.data.conversion_rate, 0.25);
  });

  test("null rates survive as null and are never coerced to zero", () => {
    const result = toReportResult(
      leadConversionSchema,
      { ...validLeadConversion, conversion_rate: null, win_rate: null, avg_days_to_convert: null },
      null,
    );
    assert.equal(result.status, "ok");
    assert.equal(result.data.conversion_rate, null);
    assert.equal(result.data.win_rate, null);
    assert.notEqual(result.data.conversion_rate, 0);
  });

  test("money and rates arriving as numeric strings are coerced", () => {
    // numeric(14,2) can surface as a string depending on the driver.
    const result = toReportResult(
      revenueSchema,
      {
        report_from: "2026-03-01",
        report_to: "2026-03-31",
        timezone: "Asia/Manila",
        cohort_collection_rate_basis: "as_of_today",
        collected_in_period: [{ currency: "PHP", total: "85000.00" }],
        invoice_cohort: [
          {
            currency: "PHP",
            cohort_billed: "100000.00",
            cohort_collected: "75000.00",
            cohort_outstanding: "25000.00",
            cohort_collection_rate: "0.7500",
          },
        ],
        ledger_open: [],
        monthly_series: [],
        top_clients: [],
        provider_split: [],
        refunded_count: 1,
        mrr: [],
        mrr_excluded_custom_cycle_count: 1,
      },
      null,
    );

    assert.equal(result.status, "ok");
    assert.equal(result.data.collected_in_period[0].total, 85000);
    assert.equal(result.data.invoice_cohort[0].cohort_collection_rate, 0.75);
  });

  test("currency rows are preserved separately, never merged", () => {
    const result = toReportResult(
      revenueSchema,
      {
        report_from: "2026-03-01",
        report_to: "2026-03-31",
        timezone: "Asia/Manila",
        cohort_collection_rate_basis: "as_of_today",
        collected_in_period: [
          { currency: "PHP", total: 85000 },
          { currency: "USD", total: 500 },
        ],
        invoice_cohort: [],
        ledger_open: [],
        monthly_series: [],
        top_clients: [],
        provider_split: [],
        refunded_count: 0,
        mrr: [],
        mrr_excluded_custom_cycle_count: 0,
      },
      null,
    );

    assert.equal(result.status, "ok");
    assert.equal(result.data.collected_in_period.length, 2);
    const total = result.data.collected_in_period.reduce((sum, r) => sum + r.total, 0);
    assert.equal(total, 85500);
    assert.ok(!result.data.collected_in_period.some((r) => r.total === 85500));
  });

  test("a malformed payload becomes error, never a partially rendered page", () => {
    for (const bad of [
      null,
      undefined,
      {},
      "not an object",
      { ...validLeadConversion, leads_created: "eight" },
      { ...validLeadConversion, funnel: "not an array" },
      { ...validLeadConversion, timezone: "UTC" },
    ]) {
      const result = toReportResult(leadConversionSchema, bad, null);
      assert.equal(result.status, "error", `expected error for ${JSON.stringify(bad)}`);
    }
  });
});

describe("safe report error mapping", () => {
  test("P0001 maps to denied, anything else to error", () => {
    assert.deepEqual(toReportResult(leadConversionSchema, null, { code: "P0001" }), {
      status: "denied",
    });
    for (const code of ["42501", "57014", "08006", undefined]) {
      assert.deepEqual(toReportResult(leadConversionSchema, null, { code }), {
        status: "error",
      });
    }
  });

  test("an error wins over a payload that arrived with it", () => {
    const result = toReportResult(leadConversionSchema, validLeadConversion, { code: "P0001" });
    assert.equal(result.status, "denied");
  });

  test("the result never carries a message, code, hint or detail", () => {
    const leaky = {
      code: "42P01",
      message: 'relation "public.leads" does not exist',
      details: "SELECT * FROM public.leads",
      hint: "check your search_path",
    };

    const result = toReportResult(leadConversionSchema, null, leaky);
    const serialized = JSON.stringify(result);

    assert.deepEqual(Object.keys(result), ["status"]);
    assert.ok(!serialized.includes("does not exist"));
    assert.ok(!serialized.includes("SELECT"));
    assert.ok(!serialized.includes("search_path"));
    assert.ok(!serialized.includes("public.leads"));
  });
});

describe("report route permission matrix", () => {
  const EXPECTED = {
    super_admin: [...REPORT_IDS],
    admin: [...REPORT_IDS],
    project_manager: ["project_delivery"],
    team_member: [],
  };

  for (const role of INTERNAL_ROLES) {
    test(`${role} may open exactly its permitted reports`, () => {
      for (const reportId of REPORT_IDS) {
        assert.equal(
          canViewReport(role, reportId),
          EXPECTED[role].includes(reportId),
          `${role} -> ${reportId}`,
        );
      }
      assert.deepEqual([...visibleReportsForRole(role)].sort(), [...EXPECTED[role]].sort());
    });
  }

  test("revenue is restricted to super_admin and admin", () => {
    assert.equal(canViewReport("project_manager", "revenue"), false);
    assert.equal(canViewReport("team_member", "revenue"), false);
  });

  test("team_member has no report access at all", () => {
    assert.equal(canViewAnyReport("team_member"), false);
  });
});

describe("role-aware dashboard visibility", () => {
  test("admins receive every summary", () => {
    for (const role of ["super_admin", "admin"]) {
      assert.deepEqual([...dashboardSummariesForRole(role)], [
        "leads", "proposals", "revenue", "delivery",
      ]);
    }
  });

  test("a project_manager receives delivery only -- no lead, proposal or revenue figures", () => {
    const summaries = dashboardSummariesForRole("project_manager");
    assert.deepEqual([...summaries], ["delivery"]);
    for (const restricted of ["leads", "proposals", "revenue"]) {
      assert.ok(!summaries.includes(restricted), `PM must not receive ${restricted}`);
    }
  });

  test("a team_member receives none, so no restricted RPC is called for them", () => {
    assert.deepEqual([...dashboardSummariesForRole("team_member")], []);
  });

  test("every internal role is covered", () => {
    for (const role of INTERNAL_ROLES) {
      assert.ok(Array.isArray(dashboardSummariesForRole(role)));
    }
  });
});
