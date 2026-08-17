import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

import {
  WEBSITE_INQUIRY_BUDGETS,
  WEBSITE_INQUIRY_CONTACT_METHODS,
  WEBSITE_INQUIRY_SERVICES,
  WEBSITE_INQUIRY_TIMELINES,
  websiteInquiryBudgetLabel,
  websiteInquiryContactMethodLabel,
  websiteInquiryPayloadSchema,
  websiteInquiryServiceLabel,
  websiteInquiryTimelineLabel,
} from "../../../src/features/leads/website-inquiry.ts";

const MIGRATION_PATH = new URL(
  "../../../supabase/migrations/20260817000000_os_l1_website_inquiry_ingestion.sql",
  import.meta.url,
);

function validPayload(overrides = {}) {
  return {
    idempotencyKey: "8f14e45f-ceea-4d0d-a1b2-3c4d5e6f7a8b",
    submittedAt: "2026-08-17T09:00:00.000Z",
    fullName: "Ava Reyes",
    email: "Ava@Example.COM",
    phone: "+63 917 000 0000",
    businessOrganization: "Acme Studio",
    preferredContactMethod: "email",
    serviceNeeded: "website_development",
    estimatedBudget: "25000_50000",
    targetTimeline: "1_3_months",
    projectDescription: "Replace a manual booking workflow.",
    ...overrides,
  };
}

describe("website inquiry payload validation", () => {
  test("accepts a complete payload and lowercases the email", () => {
    const parsed = websiteInquiryPayloadSchema.safeParse(validPayload());

    assert.equal(parsed.success, true);
    assert.equal(parsed.data.email, "ava@example.com");
  });

  test("accepts the optional fields as null", () => {
    const parsed = websiteInquiryPayloadSchema.safeParse(
      validPayload({
        phone: null,
        businessOrganization: null,
        estimatedBudget: null,
        targetTimeline: null,
      }),
    );

    assert.equal(parsed.success, true);
  });

  test("rejects a payload missing its external identity", () => {
    for (const idempotencyKey of [undefined, null, "", "not-a-uuid", 12345]) {
      assert.equal(
        websiteInquiryPayloadSchema.safeParse(validPayload({ idempotencyKey }))
          .success,
        false,
        `expected rejection for idempotencyKey: ${String(idempotencyKey)}`,
      );
    }
  });

  test("rejects values outside the website's canonical enums", () => {
    const cases = [
      { serviceNeeded: "seo_services" },
      { estimatedBudget: "1000000_plus" },
      { targetTimeline: "next_year" },
      { preferredContactMethod: "sms" },
    ];

    for (const override of cases) {
      assert.equal(
        websiteInquiryPayloadSchema.safeParse(validPayload(override)).success,
        false,
        `expected rejection for ${JSON.stringify(override)}`,
      );
    }
  });

  test("rejects oversized fields at the edge rather than in the database", () => {
    const cases = [
      { fullName: "a".repeat(121) },
      { businessOrganization: "a".repeat(161) },
      { phone: "9".repeat(41) },
      { projectDescription: "a".repeat(4001) },
      { email: `${"a".repeat(250)}@example.com` },
    ];

    for (const override of cases) {
      assert.equal(
        websiteInquiryPayloadSchema.safeParse(validPayload(override)).success,
        false,
        `expected rejection for ${Object.keys(override)[0]}`,
      );
    }
  });

  test("rejects an empty required field", () => {
    for (const override of [{ fullName: "   " }, { projectDescription: "" }]) {
      assert.equal(
        websiteInquiryPayloadSchema.safeParse(validPayload(override)).success,
        false,
      );
    }
  });

  test("requires an offset-bearing ISO submission timestamp", () => {
    for (const submittedAt of ["", "17/08/2026", "2026-08-17", 1755421200]) {
      assert.equal(
        websiteInquiryPayloadSchema.safeParse(validPayload({ submittedAt }))
          .success,
        false,
        `expected rejection for submittedAt: ${String(submittedAt)}`,
      );
    }
  });
});

describe("website inquiry presentation labels", () => {
  test("every canonical value has a label", () => {
    for (const value of WEBSITE_INQUIRY_CONTACT_METHODS) {
      assert.notEqual(websiteInquiryContactMethodLabel(value), value);
    }
    for (const value of WEBSITE_INQUIRY_SERVICES) {
      assert.ok(websiteInquiryServiceLabel(value).length > 0);
    }
    for (const value of WEBSITE_INQUIRY_BUDGETS) {
      assert.ok(websiteInquiryBudgetLabel(value).length > 0);
    }
    for (const value of WEBSITE_INQUIRY_TIMELINES) {
      assert.ok(websiteInquiryTimelineLabel(value).length > 0);
    }
  });

  test("known values render the human label, not the enum", () => {
    assert.equal(
      websiteInquiryServiceLabel("ecommerce_development"),
      "E-commerce Development",
    );
    assert.equal(websiteInquiryBudgetLabel("25000_50000"), "₱25,000 – ₱50,000");
    assert.equal(websiteInquiryTimelineLabel("1_3_months"), "1–3 months");
  });

  test("a missing optional value reads as not specified", () => {
    assert.equal(websiteInquiryBudgetLabel(null), "Not specified");
    assert.equal(websiteInquiryTimelineLabel(null), "Not specified");
  });

  test("an unrecognized stored value falls back to itself, not to blank", () => {
    // A contract change on the website must degrade to showing the raw value
    // rather than rendering an empty cell that looks like missing data.
    assert.equal(websiteInquiryServiceLabel("future_service"), "future_service");
    assert.equal(websiteInquiryBudgetLabel("future_band"), "future_band");
  });
});

describe("the OS contract stays aligned with the database", () => {
  test("every canonical tuple matches the migration's CHECK constraints", async () => {
    const migration = (await readFile(MIGRATION_PATH, "utf8")).replace(
      /\r\n/g,
      "\n",
    );

    // Three copies of these values exist by design (website contract, this
    // module, the CHECK constraints). This test is what keeps the two copies
    // inside this repository from drifting apart silently.
    const tuples = [
      ["website_inquiry_imports_service_needed_check", WEBSITE_INQUIRY_SERVICES],
      ["website_inquiry_imports_estimated_budget_check", WEBSITE_INQUIRY_BUDGETS],
      ["website_inquiry_imports_target_timeline_check", WEBSITE_INQUIRY_TIMELINES],
      [
        "website_inquiry_imports_preferred_contact_method_check",
        WEBSITE_INQUIRY_CONTACT_METHODS,
      ],
    ];

    for (const [constraint, values] of tuples) {
      const start = migration.indexOf(`constraint ${constraint}`);
      assert.ok(start > -1, `expected constraint ${constraint}`);
      const block = migration.slice(start, migration.indexOf("),", start));

      for (const value of values) {
        assert.ok(
          block.includes(`'${value}'`),
          `${constraint} must accept '${value}'`,
        );
      }
    }
  });
});
