import { expect, test } from "@playwright/test";

import { readPhase12Fixtures, reportUrl, signIn, signOut, type Phase12Fixtures } from "./helpers";
import { getPhase12E2EConfig, getPhase12E2ESkipReason } from "../helpers/test-env.mjs";

const config = getPhase12E2EConfig();
test.skip(!config, getPhase12E2ESkipReason());

let fixtures: Phase12Fixtures;

test.beforeAll(() => {
  fixtures = readPhase12Fixtures();
});

test.describe("Report rendering against deterministic fixtures", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, fixtures.users["admin-a"]);
  });

  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

  test("Lead Conversion renders the seeded figures", async ({ page }) => {
    await page.goto(reportUrl("/admin/reports/lead-conversion"));
    const main = page.locator("main");

    await expect(main).toContainText("Leads created");
    await expect(main).toContainText("8");
    await expect(main).toContainText("25.0%"); // conversion rate
    await expect(main).toContainText("Won but not converted");
    await expect(main).toContainText("Conversions in period");

    // Funnel is a real table, with the empty bucket present as 0.
    const funnel = page.getByRole("table", { name: /by current status/i });
    await expect(funnel.getByRole("row", { name: /^Discovery/ })).toContainText("0");
    await expect(funnel.getByRole("row", { name: /^Won/ })).toContainText("2");
  });

  test("Lead Conversion shows an empty state for a range with no data", async ({ page }) => {
    await page.goto("/admin/reports/lead-conversion?preset=custom&from=2025-01-01&to=2025-01-31");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(/No data in this range/i)).toBeVisible();
  });

  test("Lead Sources labels first-touch attribution and separates currencies", async ({ page }) => {
    await page.goto(reportUrl("/admin/reports/lead-sources"));
    const main = page.locator("main");

    await expect(main).toContainText("First-touch attributed revenue");
    await expect(main).not.toContainText("multi-touch revenue attribution");

    // Zero-count sources stay visible by design.
    await expect(main).toContainText("existing client");
    await expect(main).toContainText("manual");

    // Both currencies present, never merged into one figure.
    await expect(main).toContainText("₱125,000");
    await expect(main).toContainText("500");
  });

  test("Proposal Win Rate headlines the decided rate and never calls expired declined", async ({ page }) => {
    await page.goto(reportUrl("/admin/reports/proposal-win-rate"));
    const main = page.locator("main");

    await expect(main).toContainText("Win Rate — Decided Proposals");
    await expect(main).toContainText("Sent-to-Accepted Rate");
    await expect(main).toContainText("66.7%"); // 2 / (2 + 1)
    await expect(main).toContainText("28.6%"); // 2 / 7

    await expect(main).toContainText("Expired");
    await expect(main).toContainText("Not counted as declined");

    // Currency separation.
    await expect(main).toContainText("PHP");
    await expect(main).toContainText("USD");
  });

  test("Revenue separates the three bases and never merges currencies", async ({ page }) => {
    await page.goto(reportUrl("/admin/reports/revenue"));
    const main = page.locator("main");

    await expect(main).toContainText("Cash basis");
    await expect(main).toContainText("Invoice cohort");
    await expect(main).toContainText("Point in time");
    await expect(main).toContainText("Cohort Collection Rate");
    await expect(main).toContainText("as of today");

    await expect(main).toContainText("75.0%"); // cohort collection rate
    await expect(main).toContainText("Current overdue");
    await expect(main).toContainText("Custom-cycle subscriptions");

    // PHP and USD both present; the merged total (85,500) must not appear.
    await expect(main).toContainText("Collected (PHP)");
    await expect(main).toContainText("Collected (USD)");
    await expect(main).not.toContainText("85,500");
  });

  test("Project Delivery shows the schedule caveat and no team-performance wording", async ({ page }) => {
    await page.goto(reportUrl("/admin/reports/project-delivery"));
    const main = page.locator("main");

    await expect(main).toContainText("Schedule On-Time Rate");
    await expect(main).toContainText(
      "This measures schedule adherence, not team performance.",
    );
    await expect(main).toContainText("cannot distinguish client-caused delays");

    await expect(main).toContainText("Completed without target date");
    await expect(main).toContainText("50.0%"); // 1 of 2 rated
    await expect(main).toContainText("Progress drift");
  });
});
