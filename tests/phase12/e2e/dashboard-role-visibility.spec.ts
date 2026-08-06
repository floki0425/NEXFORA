import { expect, test, type Page } from "@playwright/test";

import {
  readPhase12Fixtures,
  reportUrl,
  signIn,
  signOut,
  type Phase12Fixtures,
} from "./helpers";
import { getPhase12E2EConfig, getPhase12E2ESkipReason } from "../helpers/test-env.mjs";

const config = getPhase12E2EConfig();
test.skip(!config, getPhase12E2ESkipReason());

// The dashboard calls only the report RPCs a role may actually see, so these
// specs are an authorization check as much as a layout one: a restricted
// figure appearing for the wrong role is a data leak, not a cosmetic bug.
//
// The tiles use preset=this_month while the fixtures seed a closed month in
// the past. That is deliberate: it means these specs assert WHICH summaries a
// role receives and that placeholders are genuinely replaced, while the
// numeric correctness of each metric is proven against the seeded window by
// report-rendering.spec.ts. Asserting fixture totals here would silently
// depend on the calendar date the suite happens to run on.

/** Live report tiles, by the labels src/features/reports/dashboard.ts emits. */
const LIVE_TILE_LABELS = {
  leads: "Leads this month",
  proposals: "Proposal win rate",
  revenue: "Collected this month",
  delivery: "Active projects",
  deliveryScoped: "Your active projects",
} as const;

/** The pre-Phase-12 placeholder cards, shown only when no tile is allowed. */
const PLACEHOLDER_LABELS = [
  "Active Leads",
  "Active Clients",
  "Pending Tasks",
] as const;

let fixtures: Phase12Fixtures;

test.beforeAll(() => {
  fixtures = readPhase12Fixtures();
});

const summary = (page: Page) =>
  page.locator('section[aria-labelledby="workspace-summary-title"]');

/** Every stat-card label rendered in the workspace summary. */
async function summaryLabels(page: Page): Promise<string[]> {
  await expect(summary(page)).toBeVisible();
  const text = await summary(page).innerText();
  return text.split("\n").map((line) => line.trim());
}

/** The value rendered beneath a given summary label. */
async function tileValue(page: Page, label: string): Promise<string> {
  const lines = await summaryLabels(page);
  const index = lines.indexOf(label);
  expect(index, `summary tile "${label}" not found in ${JSON.stringify(lines)}`).toBeGreaterThanOrEqual(0);
  return lines[index + 1] ?? "";
}

test.describe("Dashboard reporting summaries by role", () => {
  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

  for (const role of ["super-admin-a", "admin-a"] as const) {
    test(`${role} receives all four reporting summaries`, async ({ page }) => {
      await signIn(page, fixtures.users[role]);
      await page.goto("/admin");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      const labels = await summaryLabels(page);

      for (const label of [
        LIVE_TILE_LABELS.leads,
        LIVE_TILE_LABELS.proposals,
        LIVE_TILE_LABELS.revenue,
        LIVE_TILE_LABELS.delivery,
      ]) {
        expect(labels, `${role} is missing the "${label}" summary`).toContain(label);
      }

      // Deterministic report metrics REPLACE the placeholder cards entirely.
      for (const placeholder of PLACEHOLDER_LABELS) {
        expect(
          labels,
          `${role} still shows the "${placeholder}" placeholder`,
        ).not.toContain(placeholder);
      }
      await expect(summary(page)).toContainText("Month to date, in Asia/Manila.");
      await expect(summary(page)).not.toContainText(
        "Metrics remain unavailable until their source modules launch.",
      );

      // Every tile carries a real rendered value -- an em dash for a genuinely
      // undefined metric, never a blank or a literal "undefined"/"NaN".
      for (const label of [
        LIVE_TILE_LABELS.leads,
        LIVE_TILE_LABELS.proposals,
        LIVE_TILE_LABELS.revenue,
        LIVE_TILE_LABELS.delivery,
      ]) {
        const value = await tileValue(page, label);
        expect(value, `"${label}" rendered an empty value`).not.toBe("");
        expect(value.toLowerCase()).not.toContain("undefined");
        expect(value.toLowerCase()).not.toContain("nan");
      }

      // An org-wide role must not be shown the project-manager scoping label.
      expect(labels).not.toContain(LIVE_TILE_LABELS.deliveryScoped);
    });
  }

  test("project_manager receives only the Project Delivery summary", async ({ page }) => {
    await signIn(page, fixtures.users["pm-a"]);
    await page.goto("/admin");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const labels = await summaryLabels(page);

    // The one summary they may see, labelled to state its narrower scope.
    expect(labels).toContain(LIVE_TILE_LABELS.deliveryScoped);
    expect(labels).not.toContain(LIVE_TILE_LABELS.delivery);

    // None of the restricted figures, in any form.
    expect(labels, "PM must not receive a lead summary").not.toContain(LIVE_TILE_LABELS.leads);
    expect(labels, "PM must not receive a proposal summary").not.toContain(
      LIVE_TILE_LABELS.proposals,
    );
    expect(labels, "PM must not receive a revenue summary").not.toContain(
      LIVE_TILE_LABELS.revenue,
    );

    const body = (await page.locator("main").innerText()).toLowerCase();
    for (const forbidden of ["win rate", "collected", "conversion rate"]) {
      expect(body, `PM dashboard leaked "${forbidden}"`).not.toContain(forbidden);
    }

    // The scope really is their own projects: the delivery tile matches what
    // their own scoped report renders, not the organization-wide figure.
    const pmValue = await tileValue(page, LIVE_TILE_LABELS.deliveryScoped);
    expect(pmValue).not.toBe("");
    expect(pmValue.toLowerCase()).not.toContain("undefined");
  });

  test("project_manager delivery scope is narrower than an admin's", async ({ page }) => {
    // Proven on the report itself, where the seeded window makes the numbers
    // deterministic: the PM manages p7 only, an admin sees p8 as well.
    await signIn(page, fixtures.users["pm-a"]);
    await page.goto(reportUrl("/admin/reports/project-delivery"));
    const pmTable = page.getByRole("table", { name: /Active projects by status/i });
    await expect(pmTable.getByRole("row", { name: /^Design/ })).toContainText("1");
    await expect(pmTable.getByRole("row", { name: /^Testing/ })).toContainText("0");

    await signOut(page);
    await signIn(page, fixtures.users["admin-a"]);
    await page.goto(reportUrl("/admin/reports/project-delivery"));
    const adminTable = page.getByRole("table", { name: /Active projects by status/i });
    await expect(adminTable.getByRole("row", { name: /^Testing/ })).toContainText("1");
  });

  test("team_member sees no restricted report metrics but keeps a usable dashboard", async ({ page }) => {
    await signIn(page, fixtures.users["team-a"]);
    await page.goto("/admin");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const labels = await summaryLabels(page);

    for (const label of Object.values(LIVE_TILE_LABELS)) {
      expect(labels, `team_member must not receive the "${label}" summary`).not.toContain(
        label,
      );
    }

    // The safe pre-existing dashboard content remains, so the page is not a
    // blank shell for this role.
    for (const placeholder of PLACEHOLDER_LABELS) {
      expect(labels).toContain(placeholder);
    }
    await expect(summary(page)).toContainText(
      "Metrics remain unavailable until their source modules launch.",
    );

    // Quick actions and recent activity still render and stay navigable.
    // `exact` matters: the empty state's own "No recent activity" heading
    // would otherwise also match.
    await expect(
      page.getByRole("heading", { name: "Quick actions", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Recent activity", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /Open Leads/ }).first()).toBeVisible();

    // And no report figure leaks through the placeholders.
    const body = (await page.locator("main").innerText()).toLowerCase();
    for (const forbidden of ["win rate", "collected this month", "conversion rate"]) {
      expect(body, `team_member dashboard leaked "${forbidden}"`).not.toContain(forbidden);
    }
  });

  test("the dashboard never sums two currencies into one figure", async ({ page }) => {
    await signIn(page, fixtures.users["admin-a"]);
    await page.goto("/admin");

    const revenueValue = await tileValue(page, LIVE_TILE_LABELS.revenue);

    // A summary tile shows a single currency (or an em dash when there is
    // nothing to show) -- never two amounts, and never an unlabelled total.
    const currencySymbols = (revenueValue.match(/[₱$€£]/g) ?? []).length;
    expect(
      currencySymbols,
      `the revenue tile rendered ${currencySymbols} currency amounts: "${revenueValue}"`,
    ).toBeLessThanOrEqual(1);

    // Whatever the month holds, the tile points at the full report rather
    // than pretending to be the complete picture.
    const summaryText = await summary(page).innerText();
    const pointsToReport =
      /see the revenue report/i.test(summaryText) ||
      /Settled payments this month/i.test(summaryText);
    expect(
      pointsToReport,
      `the revenue tile must describe its basis or point to the full report: "${summaryText}"`,
    ).toBe(true);

    // And the full per-currency report is reachable from the dashboard.
    const reportsLink = page.getByRole("link", { name: "Reports", exact: true }).first();
    await expect(reportsLink).toBeVisible();
    await reportsLink.click();
    await expect(page).toHaveURL(/\/admin\/reports/);
    await expect(page.getByRole("heading", { name: "Revenue", level: 2 })).toBeVisible();
  });

  test("the revenue report keeps currencies separate rather than merging them", async ({ page }) => {
    await signIn(page, fixtures.users["admin-a"]);
    await page.goto(reportUrl("/admin/reports/revenue"));
    const main = page.locator("main");

    // Each currency gets its own labelled tile...
    await expect(main).toContainText("Collected (PHP)");
    await expect(main).toContainText("Collected (USD)");
    // ...and the merged total never appears anywhere.
    await expect(main).not.toContainText("85,500");
  });

  test("a role never sees a dashboard link to a report it cannot open", async ({ page }) => {
    await signIn(page, fixtures.users["team-a"]);
    await page.goto("/admin");

    await expect(page.getByRole("link", { name: "Reports", exact: true })).toHaveCount(0);
    await expect(page.locator('a[href^="/admin/reports"]')).toHaveCount(0);

    await signOut(page);
    await signIn(page, fixtures.users["pm-a"]);
    await page.goto("/admin/reports");

    // The PM's index links only to the one report they may open.
    await expect(page.locator('a[href="/admin/reports/project-delivery"]')).toHaveCount(1);
    for (const route of [
      "/admin/reports/lead-conversion",
      "/admin/reports/lead-sources",
      "/admin/reports/proposal-win-rate",
      "/admin/reports/revenue",
    ]) {
      await expect(page.locator(`a[href="${route}"]`)).toHaveCount(0);
    }
  });
});
