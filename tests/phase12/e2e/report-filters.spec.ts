import { expect, test, type Page } from "@playwright/test";

import {
  readPhase12Fixtures,
  reportUrl,
  signIn,
  signOut,
  WINDOW_FROM,
  WINDOW_TO,
  type Phase12Fixtures,
} from "./helpers";
import { getPhase12E2EConfig, getPhase12E2ESkipReason } from "../helpers/test-env.mjs";

const config = getPhase12E2EConfig();
test.skip(!config, getPhase12E2ESkipReason());

// Report filters are URL state, not component state: a plain GET form drives
// every view. That makes each assertion below checkable in two independent
// ways -- the URL the browser lands on, and the control values the server
// re-renders from it. A filter that only updated one of the two would be a
// real defect (an unlinkable view, or a control that lies about the query).
//
// Malformed input must DEGRADE, never crash: every filter schema carries
// .catch() defaults and resolveReportRange() owns calendar validity and the
// 366-day cap. These specs prove that in a browser rather than in a unit test.

let fixtures: Phase12Fixtures;

test.beforeAll(() => {
  fixtures = readPhase12Fixtures();
});

/** The filter form's own controls, by the ids report-filter-bar.tsx assigns. */
const PRESET_ID = "report-preset";
const FROM_ID = "report-from";
const TO_ID = "report-to";

/**
 * Reads the "Leads created" figure so a filter's effect is measurable.
 * Scoped to the metric tile (a <dt>/<dd> pair inside the <dl> grid) rather
 * than to page text, so it cannot accidentally match a heading or a hint.
 */
async function leadsCreated(page: Page): Promise<string> {
  const tile = page
    .locator("dl > div")
    .filter({ has: page.getByText("Leads created", { exact: true }) });

  if ((await tile.count()) === 0) return "empty-state";
  return (await tile.first().locator("dd").first().innerText()).trim();
}

/** Every report route, with the filter controls each one renders. */
const REPORT_FILTER_SURFACES = [
  { route: "/admin/reports/lead-conversion", extra: ["Source"] },
  { route: "/admin/reports/lead-sources", extra: [] },
  { route: "/admin/reports/proposal-win-rate", extra: [] },
  { route: "/admin/reports/revenue", extra: [] },
  { route: "/admin/reports/project-delivery", extra: ["Status"] },
] as const;

test.describe("Report filters", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, fixtures.users["admin-a"]);
  });

  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

  test("preset selection updates the URL parameters", async ({ page }) => {
    await page.goto("/admin/reports/lead-conversion");

    await page.getByLabel("Date range", { exact: true }).selectOption("last_month");
    await page.getByRole("button", { name: "Apply" }).click();

    await expect(page).toHaveURL(/[?&]preset=last_month\b/);
    // The server re-renders the control from the URL, so the view is linkable.
    await expect(page.getByLabel("Date range", { exact: true })).toHaveValue("last_month");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("custom from/to dates submit and are echoed back", async ({ page }) => {
    await page.goto("/admin/reports/lead-conversion");

    await page.getByLabel("Date range", { exact: true }).selectOption("custom");
    await page.getByLabel("From", { exact: true }).fill(WINDOW_FROM);
    await page.getByLabel("To", { exact: true }).fill(WINDOW_TO);
    await page.getByRole("button", { name: "Apply" }).click();

    await expect(page).toHaveURL(new RegExp(`[?&]from=${WINDOW_FROM}\\b`));
    await expect(page).toHaveURL(new RegExp(`[?&]to=${WINDOW_TO}\\b`));

    await expect(page.getByLabel("From", { exact: true })).toHaveValue(WINDOW_FROM);
    await expect(page.getByLabel("To", { exact: true })).toHaveValue(WINDOW_TO);

    // The seeded window genuinely produces the fixture cohort.
    expect(await leadsCreated(page)).toBe("8");
    await expect(page.locator("main")).toContainText("Mar 1, 2026");
  });

  test("selected filters survive a page refresh", async ({ page }) => {
    await page.goto(reportUrl("/admin/reports/lead-conversion", { source: "facebook" }));
    await expect(page.getByLabel("Source", { exact: true })).toHaveValue("facebook");

    await page.reload();

    await expect(page.getByLabel("Source", { exact: true })).toHaveValue("facebook");
    await expect(page.getByLabel("From", { exact: true })).toHaveValue(WINDOW_FROM);
    await expect(page.getByLabel("Date range", { exact: true })).toHaveValue("custom");
  });

  test("Back and Forward restore both the URL and the rendered report", async ({ page }) => {
    await page.goto(reportUrl("/admin/reports/lead-conversion"));
    await expect(page.getByLabel("Source", { exact: true })).toHaveValue("");
    expect(await leadsCreated(page)).toBe("8");

    await page.getByLabel("Source", { exact: true }).selectOption("facebook");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page).toHaveURL(/[?&]source=facebook\b/);
    await expect(page.getByLabel("Source", { exact: true })).toHaveValue("facebook");
    expect(await leadsCreated(page)).toBe("1");

    // Back restores the URL and, with it, the report the URL describes.
    //
    // The <select> itself is deliberately NOT asserted here: browsers restore
    // form-control values from session history on purpose, so the control can
    // legitimately still read "facebook" while the page renders the unfiltered
    // report. What must hold is that the RENDERED REPORT follows the URL --
    // that is the part the application owns.
    await page.goBack();
    await expect(page).not.toHaveURL(/[?&]source=facebook\b/);
    expect(await leadsCreated(page)).toBe("8");

    await page.goForward();
    await expect(page).toHaveURL(/[?&]source=facebook\b/);
    expect(await leadsCreated(page)).toBe("1");

    // A reload clears the browser's form restoration, proving the control is
    // rendered from the URL rather than held in client state.
    await page.goBack();
    await expect(page).not.toHaveURL(/[?&]source=facebook\b/);
    await page.reload();
    await expect(page.getByLabel("Source", { exact: true })).toHaveValue("");
    expect(await leadsCreated(page)).toBe("8");
  });

  test("malformed parameters fall back safely instead of crashing", async ({ page }) => {
    const malformed = [
      "?preset=not_a_preset&from=nonsense&to=%%%",
      "?preset=custom&from=13/45/9999&to=",
      "?preset[]=custom&from[]=2026-03-01",
      "?source=;drop%20table%20leads&assignedTo=not-a-uuid",
      "?preset=custom&from=2026-03-01&from=2026-04-01&to=2026-03-31",
    ];

    for (const query of malformed) {
      await page.goto(`/admin/reports/lead-conversion${query}`);

      // Renders the report, not an error boundary and not a stack trace.
      await expect(
        page.getByRole("heading", { name: "Lead Conversion", level: 1 }),
      ).toBeVisible();
      const headings = await page.getByRole("heading", { level: 1 }).allInnerTexts();
      expect(headings, `${query} fell into an error page`).toHaveLength(1);

      const body = (await page.locator("body").innerText()).toLowerCase();
      for (const leak of ["zoderror", "invalid_", "sqlstate", "p0001", "at async", "stack"]) {
        expect(body, `${query} leaked "${leak}"`).not.toContain(leak);
      }
    }
  });

  test("an impossible calendar date does not crash and does not query it", async ({ page }) => {
    // 2026-02-30 passes a YYYY-MM-DD regex but is not a real date.
    await page.goto("/admin/reports/lead-conversion?preset=custom&from=2026-02-30&to=2026-03-31");

    await expect(page.getByRole("heading", { name: "Lead Conversion", level: 1 })).toBeVisible();
    const shown = await page.locator("main").innerText();
    expect(shown).not.toContain("Feb 30");
    // Falls back to a bounded window ending at the valid `to` date.
    expect(shown).toContain("Mar 31, 2026");
  });

  test("a reversed range is bounded rather than crashing or running unbounded", async ({ page }) => {
    await page.goto("/admin/reports/lead-conversion?preset=custom&from=2026-03-31&to=2026-03-01");

    await expect(page.getByRole("heading", { name: "Lead Conversion", level: 1 })).toBeVisible();

    // Swapped into order, and the resolved window is stated back to the user.
    await expect(page.locator("main")).toContainText("Mar 1, 2026 – Mar 31, 2026");
    // Same window as the forward form, so it is genuinely bounded.
    expect(await leadsCreated(page)).toBe("8");
  });

  test("a range over 366 inclusive days is clamped, keeping its end date", async ({ page }) => {
    await page.goto("/admin/reports/lead-conversion?preset=custom&from=2000-01-01&to=2026-03-31");

    await expect(page.getByRole("heading", { name: "Lead Conversion", level: 1 })).toBeVisible();
    const main = page.locator("main");

    // 366 inclusive days ending 2026-03-31 starts at 2025-03-31.
    await expect(main).toContainText("Mar 31, 2025 – Mar 31, 2026");
    await expect(main).not.toContainText("2000");
    await expect(main).toContainText("Ranges are capped at 366 days");
  });

  test("exactly 366 inclusive days is accepted unchanged", async ({ page }) => {
    await page.goto("/admin/reports/lead-conversion?preset=custom&from=2025-03-31&to=2026-03-31");

    await expect(page.locator("main")).toContainText("Mar 31, 2025 – Mar 31, 2026");
  });

  test("the source filter changes the displayed metrics", async ({ page }) => {
    await page.goto(reportUrl("/admin/reports/lead-conversion"));
    expect(await leadsCreated(page)).toBe("8");

    // facebook has exactly one seeded lead inside the window.
    await page.getByLabel("Source", { exact: true }).selectOption("facebook");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page).toHaveURL(/[?&]source=facebook\b/);
    expect(await leadsCreated(page)).toBe("1");

    // referral has two, so the figure genuinely tracks the filter.
    await page.getByLabel("Source", { exact: true }).selectOption("referral");
    await page.getByRole("button", { name: "Apply" }).click();
    expect(await leadsCreated(page)).toBe("2");
  });

  test("the assigned-user filter narrows the cohort", async ({ page }) => {
    // assignedTo has no select control (there is no user list on this page),
    // but it is a supported URL filter and must behave like one.
    const pmProfileId = fixtures.users["pm-a"].profileId;
    await page.goto(reportUrl("/admin/reports/lead-conversion", { assignedTo: pmProfileId }));

    await expect(page.getByRole("heading", { name: "Lead Conversion", level: 1 })).toBeVisible();
    // l1 and l4 are the only in-window leads assigned to the project manager.
    expect(await leadsCreated(page)).toBe("2");
  });

  test("the project-delivery status filter works and is labelled", async ({ page }) => {
    await page.goto(reportUrl("/admin/reports/project-delivery"));

    const status = page.getByLabel("Status", { exact: true });
    await expect(status).toBeVisible();
    await expect(status).toHaveAttribute("id", "report-filter-status");

    await status.selectOption("design");
    await page.getByRole("button", { name: "Apply" }).click();

    await expect(page).toHaveURL(/[?&]status=design\b/);
    await expect(status).toHaveValue("design");

    const table = page.getByRole("table", { name: /Active projects by status/i });
    await expect(table.getByRole("row", { name: /^Design/ })).toContainText("1");
  });

  test("the revenue client filter is honoured as a URL parameter", async ({ page }) => {
    const clientId = fixtures.clients.converted;
    await page.goto(reportUrl("/admin/reports/revenue", { clientId }));

    await expect(page.getByRole("heading", { name: "Revenue", level: 1 })).toBeVisible();
    // Every seeded payment belongs to this client, so the report still renders
    // its cash figures rather than collapsing to an empty state.
    await expect(page.locator("main")).toContainText("Collected (PHP)");
    await expect(page.locator("main")).toContainText("Cash basis");
  });

  test("the project-manager filter is honoured as a URL parameter", async ({ page }) => {
    const pmProfileId = fixtures.users["pm-a"].profileId;
    await page.goto(
      reportUrl("/admin/reports/project-delivery", { projectManagerId: pmProfileId }),
    );

    await expect(page.getByRole("heading", { name: "Project Delivery", level: 1 })).toBeVisible();

    // p7 (design) is the only project this manager owns; p8 (testing) is
    // someone else's, so scoping by manager must exclude it.
    const table = page.getByRole("table", { name: /Active projects by status/i });
    await expect(table.getByRole("row", { name: /^Design/ })).toContainText("1");
    await expect(table.getByRole("row", { name: /^Testing/ })).toContainText("0");
  });

  test("an empty range renders an empty state, not a zero-filled report", async ({ page }) => {
    await page.goto("/admin/reports/lead-conversion?preset=custom&from=2025-01-01&to=2025-01-31");

    await expect(page.getByRole("heading", { name: "Lead Conversion", level: 1 })).toBeVisible();
    await expect(page.getByText(/No data in this range/i)).toBeVisible();
    // The filter bar stays usable so the user can widen the range.
    await expect(page.getByLabel("Date range", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Apply" })).toBeEnabled();
  });

  test("every filter control on every report is labelled and keyboard reachable", async ({ page }) => {
    for (const surface of REPORT_FILTER_SURFACES) {
      await page.goto(reportUrl(surface.route));
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      const expected = ["Date range", "From", "To", ...surface.extra, "Apply"];

      for (const label of ["Date range", "From", "To", ...surface.extra]) {
        const control = page.getByLabel(label, { exact: true });
        expect(
          await control.count(),
          `${surface.route}: "${label}" did not resolve to exactly one control`,
        ).toBe(1);
        await expect(control).toBeVisible();
        await expect(control).toBeEnabled();

        // An explicit label element, not a placeholder or aria-label guess.
        const controlId = await control.getAttribute("id");
        expect(controlId, `${surface.route}: "${label}" control has no id`).toBeTruthy();
        const labelFor = page.locator(`label[for="${controlId}"]`);
        await expect(labelFor).toHaveCount(1);
        expect((await labelFor.innerText()).trim()).toBe(label);
      }

      // Keyboard reachability, robust to Chromium's multi-segment date inputs:
      // walk Tab and collect the distinct controls that receive focus.
      await page.getByLabel("Date range", { exact: true }).focus();
      const seen: string[] = [];
      const readFocused = () =>
        page.evaluate(() => {
          const active = document.activeElement as HTMLElement | null;
          if (!active) return "";
          if (active.tagName === "BUTTON") return (active.textContent ?? "").trim();
          return active.id || active.tagName.toLowerCase();
        });

      let last = await readFocused();
      seen.push(last);
      for (let step = 0; step < 14; step += 1) {
        await page.keyboard.press("Tab");
        const current = await readFocused();
        if (current !== last) {
          seen.push(current);
          last = current;
        }
        if (current === "Apply") break;
      }

      const wanted = [PRESET_ID, FROM_ID, TO_ID]
        .concat(surface.extra.map((label) => `report-filter-${label.toLowerCase()}`))
        .concat(["Apply"]);
      const reached = seen.filter((entry) => wanted.includes(entry));

      expect(
        reached,
        `${surface.route}: expected ${JSON.stringify(expected)} in order, saw ${JSON.stringify(seen)}`,
      ).toEqual(wanted);
    }
  });
});
