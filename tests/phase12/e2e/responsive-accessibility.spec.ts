import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  assertNoHorizontalOverflow,
  findOverflowingElements,
  readPhase12Fixtures,
  reportUrl,
  signIn,
  signOut,
  type Phase12Fixtures,
} from "./helpers";
import { getPhase12E2EConfig, getPhase12E2ESkipReason } from "../helpers/test-env.mjs";

const config = getPhase12E2EConfig();
test.skip(!config, getPhase12E2ESkipReason());

const EVIDENCE_DIR = path.join(process.cwd(), "tests/phase12/e2e/evidence");

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 1024, height: 768 },
  { name: "mobile", width: 390, height: 844 },
] as const;

const REPORT_ROUTES = [
  ["reports-index", "/admin/reports"],
  ["lead-conversion", "/admin/reports/lead-conversion"],
  ["lead-sources", "/admin/reports/lead-sources"],
  ["proposal-win-rate", "/admin/reports/proposal-win-rate"],
  ["revenue", "/admin/reports/revenue"],
  ["project-delivery", "/admin/reports/project-delivery"],
] as const;

let fixtures: Phase12Fixtures;

test.beforeAll(async () => {
  fixtures = readPhase12Fixtures();
  await mkdir(EVIDENCE_DIR, { recursive: true });
});

test.describe("Responsive and accessibility validation", () => {
  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

  for (const viewport of VIEWPORTS) {
    test(`${viewport.name} (${viewport.width}x${viewport.height}): no horizontal overflow on any report`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await signIn(page, fixtures.users["admin-a"]);

      for (const [label, route] of REPORT_ROUTES) {
        await page.goto(route === "/admin/reports" ? route : reportUrl(route));
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

        const overflow = await assertNoHorizontalOverflow(page);
        const offenders = overflow > 1 ? await findOverflowingElements(page) : [];
        expect(
          overflow,
          `${label} overflows by ${overflow}px at ${viewport.name}; offenders: ${JSON.stringify(offenders)}`,
        ).toBeLessThanOrEqual(1);

        if (viewport.name === "desktop" || (viewport.name === "mobile" && label === "reports-index")) {
          await page.screenshot({
            path: path.join(EVIDENCE_DIR, `${viewport.name}-${label}.png`),
            fullPage: true,
          });
        }
      }
    });
  }

  test("mobile: the search dialog fits the viewport and rows stay tappable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, fixtures.users["admin-a"]);

    await page.getByRole("button", { name: /search the workspace/i }).click();
    const dialog = page.locator("[role=dialog]");
    await expect(dialog).toBeVisible();

    const box = await dialog.boundingBox();
    expect(box, "dialog must have a box").not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(390);

    await page.keyboard.type(fixtures.searchTerms.ticket);
    const firstResult = dialog.getByRole("option").first();
    await expect(firstResult).toBeVisible({ timeout: 20_000 });

    const resultBox = await firstResult.boundingBox();
    // Comfortably above the 24px minimum target size.
    expect(resultBox!.height).toBeGreaterThanOrEqual(32);

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "mobile-search-dialog.png"),
    });
  });

  test("every report page has exactly one h1", async ({ page }) => {
    await signIn(page, fixtures.users["admin-a"]);

    for (const [label, route] of REPORT_ROUTES) {
      await page.goto(route === "/admin/reports" ? route : reportUrl(route));
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();

      // ErrorState renders its own h1, so a second one means the page fell
      // into an error state rather than rendering the report.
      const headings = await page.getByRole("heading", { level: 1 }).allInnerTexts();
      expect(
        headings.length,
        `${label} should have exactly one h1, saw: ${JSON.stringify(headings)}`,
      ).toBe(1);
    }
  });

  test("report filter controls are labelled and keyboard reachable", async ({ page }) => {
    await signIn(page, fixtures.users["admin-a"]);
    await page.goto(reportUrl("/admin/reports/lead-conversion"));

    // Every control resolves by its visible label -- proving association.
    // The expected accessible name is the SHORT label only: a wrapping label
    // would fold every <option> into the name ("Date range Last 30 days ...").
    for (const [label, id] of [
      ["Date range", "report-preset"],
      ["From", "report-from"],
      ["To", "report-to"],
      ["Source", "report-filter-source"],
    ] as const) {
      const control = page.getByLabel(label, { exact: true });
      const count = await control.count();
      expect(count, `filter "${label}" resolved ${count} controls by label`).toBe(1);
      await expect(control).toBeVisible();
      await expect(control).toBeEnabled();
      // getByLabel must resolve the control the <label for> actually points at.
      await expect(control).toHaveAttribute("id", id);
    }

    // Tab order. Chromium's <input type="date"> owns internal day/month/year
    // segments that each consume a Tab, so counting keypresses proves nothing.
    // Walk a bounded number of Tabs instead and collect the DISTINCT elements
    // that receive focus, which is the order a keyboard user actually
    // experiences.
    await page.getByLabel("Date range", { exact: true }).focus();

    const focusOrder: string[] = [];
    const readFocused = () =>
      page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null;
        if (!active) return "";
        return active.id || active.tagName.toLowerCase();
      });

    focusOrder.push(await readFocused());
    for (let step = 0; step < 12; step += 1) {
      await page.keyboard.press("Tab");
      const current = await readFocused();
      if (current !== focusOrder[focusOrder.length - 1]) focusOrder.push(current);
    }

    // Every control is reached, in the order it is read on screen.
    const meaningful = focusOrder.filter((id) =>
      ["report-preset", "report-from", "report-to", "report-filter-source"].includes(id),
    );
    expect(
      meaningful,
      `unexpected filter tab order: ${JSON.stringify(focusOrder)}`,
    ).toEqual(["report-preset", "report-from", "report-to", "report-filter-source"]);

    // ...and the submit button is genuinely reachable from the last control.
    const applyButton = page.getByRole("button", { name: "Apply" });
    await expect(applyButton).toBeVisible();
    await page.getByLabel("Source", { exact: true }).focus();
    await page.keyboard.press("Tab");
    await expect(applyButton).toBeFocused();
  });

  test("an undefined metric reads as an em dash, never as zero", async ({ page }) => {
    await signIn(page, fixtures.users["admin-a"]);

    // May 2026 has active projects but no COMPLETED ones, so rated_count is 0
    // and the rate is genuinely undefined -- while the page still renders its
    // metric tiles. A window with no data at all would only prove the empty
    // state, never that an undefined rate degrades correctly.
    await page.goto(
      "/admin/reports/project-delivery?preset=custom&from=2026-05-01&to=2026-05-31",
    );
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const rateTile = page
      .locator("dl > div")
      .filter({ has: page.getByText("Schedule On-Time Rate", { exact: true }) });
    await expect(rateTile).toHaveCount(1);

    const rateValue = (await rateTile.locator("dd").first().innerText()).trim();
    expect(rateValue, "an undefined rate must read as an em dash").toBe("—");
    expect(rateValue).not.toBe("0.0%");
    // "0 of 0 rated projects" states WHY it is unavailable, rather than
    // presenting a fabricated zero as the answer.
    await expect(rateTile).toContainText("0 of 0 rated projects");

    // And a window with no rows at all still avoids a fabricated zero.
    await page.goto("/admin/reports/lead-conversion?preset=custom&from=2025-01-01&to=2025-01-31");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await page.locator("main").innerText()).not.toContain("0.0%");
  });

  test("chart data has an accessible table equivalent", async ({ page }) => {
    await signIn(page, fixtures.users["admin-a"]);
    await page.goto(reportUrl("/admin/reports/project-delivery"));

    // BarList renders a real table with a caption, not a bare div of bars.
    const table = page.getByRole("table", { name: /Active projects by status/i });
    await expect(table).toBeAttached();
    await expect(table.getByRole("row").first()).toBeAttached();
  });

  test("status information is not carried by colour alone", async ({ page }) => {
    await signIn(page, fixtures.users["admin-a"]);
    await page.goto(reportUrl("/admin/reports/revenue"));

    // Each basis is introduced by a text heading, not just a tinted card.
    await expect(page.getByText(/Cash basis/i)).toBeVisible();
    await expect(page.getByText(/Invoice cohort/i)).toBeVisible();
    await expect(page.getByText(/Point in time/i)).toBeVisible();
  });

  test("evidence: global search with results", async ({ page }) => {
    await signIn(page, fixtures.users["admin-a"]);

    await page.getByRole("button", { name: /search the workspace/i }).click();
    const dialog = page.locator("[role=dialog]");
    await expect(dialog).toBeVisible();

    await page.keyboard.type(fixtures.searchTerms.ticket);
    await expect(dialog.getByRole("option").first()).toBeVisible({ timeout: 20_000 });

    // Fixture rows only -- every title is a run-scoped Zqx… token, so the
    // screenshot cannot capture real client data.
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "desktop-global-search.png"),
    });
  });

  test("evidence: project manager reports index and team member dashboard", async ({ page }) => {
    await signIn(page, fixtures.users["pm-a"]);
    await page.goto("/admin/reports");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.screenshot({ path: path.join(EVIDENCE_DIR, "pm-reports-index.png"), fullPage: true });

    await signOut(page);
    await signIn(page, fixtures.users["team-a"]);
    await page.goto("/admin");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "team-member-dashboard.png"),
      fullPage: true,
    });
  });
});
