import { expect, test } from "@playwright/test";

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

const RESTRICTED_ROUTES = [
  "/admin/reports/lead-conversion",
  "/admin/reports/lead-sources",
  "/admin/reports/proposal-win-rate",
  "/admin/reports/revenue",
];

let fixtures: Phase12Fixtures;

test.beforeAll(() => {
  fixtures = readPhase12Fixtures();
});

test.describe("Report access by role", () => {
  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

  test("super_admin sees the Reports nav, all five cards, and every route opens", async ({ page }) => {
    await signIn(page, fixtures.users["super-admin-a"]);

    await expect(page.getByRole("link", { name: "Reports", exact: true })).toBeVisible();

    await page.goto("/admin/reports");
    await expect(page.getByRole("heading", { name: "Reports", level: 1 })).toBeVisible();

    for (const name of [
      "Lead Conversion",
      "Lead Sources",
      "Proposal Win Rate",
      "Revenue",
      "Project Delivery",
    ]) {
      await expect(page.getByRole("heading", { name, level: 2 })).toBeVisible();
    }

    for (const route of [...RESTRICTED_ROUTES, "/admin/reports/project-delivery"]) {
      await page.goto(reportUrl(route));
      await expect(page).toHaveURL(new RegExp(route.replace(/\//g, "\\/")));
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
  });

  test("admin sees the Reports nav and all five cards", async ({ page }) => {
    await signIn(page, fixtures.users["admin-a"]);

    await expect(page.getByRole("link", { name: "Reports", exact: true })).toBeVisible();
    await page.goto("/admin/reports");

    for (const name of [
      "Lead Conversion",
      "Lead Sources",
      "Proposal Win Rate",
      "Revenue",
      "Project Delivery",
    ]) {
      await expect(page.getByRole("heading", { name, level: 2 })).toBeVisible();
    }

    await page.goto(reportUrl("/admin/reports/revenue"));
    await expect(page.getByRole("heading", { name: "Revenue", level: 1 })).toBeVisible();
  });

  test("project_manager sees only the Project Delivery card", async ({ page }) => {
    await signIn(page, fixtures.users["pm-a"]);

    await expect(page.getByRole("link", { name: "Reports", exact: true })).toBeVisible();
    await page.goto("/admin/reports");

    await expect(page.getByRole("heading", { name: "Project Delivery", level: 2 })).toBeVisible();

    // A report they cannot open is never even linked.
    for (const name of ["Lead Conversion", "Lead Sources", "Proposal Win Rate", "Revenue"]) {
      await expect(page.getByRole("heading", { name, level: 2 })).toHaveCount(0);
    }
  });

  test("project_manager is redirected away from every restricted report, with no data flash", async ({ page }) => {
    await signIn(page, fixtures.users["pm-a"]);

    for (const route of RESTRICTED_ROUTES) {
      await page.goto(reportUrl(route));

      // The redirect is server-side, so the protected page never renders --
      // asserting on the settled URL AND the absence of report content.
      await expect(page).toHaveURL(/\/admin\?notice=reports_access_denied/);
      await expect(
        page.getByText("That report is not available for your role."),
      ).toBeVisible();
      await expect(page.getByRole("heading", { name: "Revenue", level: 1 })).toHaveCount(0);
    }
  });

  test("the protected route's own response carries no report content", async ({ page }) => {
    await signIn(page, fixtures.users["pm-a"]);

    // Next.js answers a Server Component redirect() by streaming the
    // navigation rather than by always emitting a 3xx, so the status code is
    // NOT the thing worth asserting. What matters for "no content flash" is
    // that the bytes sent for the protected URL contain no report markup at
    // all -- inspected here directly, with redirects disabled, using the
    // browser context's own cookies.
    // Markers must be text that appears only in RENDERED report output. The
    // Suspense fallback from each route's loading.tsx is legitimately in the
    // bytes (its aria-label names the report, e.g. "Loading Proposal Win Rate
    // report"), but it is an empty skeleton carrying no figures and no rows --
    // so a marker like a bare "Win Rate" would flag the skeleton, not a leak.
    const marker: Record<string, string> = {
      "/admin/reports/lead-conversion": "Leads created",
      "/admin/reports/lead-sources": "First-touch attributed revenue",
      "/admin/reports/proposal-win-rate": "Sent-to-Accepted Rate",
      "/admin/reports/revenue": "Cohort Collection Rate",
    };

    for (const route of RESTRICTED_ROUTES) {
      const response = await page.context().request.get(reportUrl(route), {
        maxRedirects: 0,
      });
      const body = await response.text();

      // The filter bar renders on every report page and nowhere else, so its
      // presence would mean a report shell was served to an unauthorized role.
      expect(
        body,
        `${route} (status ${response.status()}) served the report filter bar`,
      ).not.toContain("Ranges are capped at 366 days");
      expect(
        body,
        `${route} (status ${response.status()}) served report content`,
      ).not.toContain(marker[route]);

      // Nor any fixture business data.
      expect(body).not.toContain(fixtures.searchTerms.client);
      expect(body).not.toContain("NXF-INV-2026-0003");
    }
  });

  test("project_manager opens Project Delivery scoped to projects they manage", async ({ page }) => {
    await signIn(page, fixtures.users["pm-a"]);
    await page.goto(reportUrl("/admin/reports/project-delivery"));

    await expect(page.getByRole("heading", { name: "Project Delivery", level: 1 })).toBeVisible();

    // Scope wording must not claim an organization-wide view.
    await expect(
      page.getByText("projects you are assigned to manage", { exact: false }),
    ).toBeVisible();

    // p7 is managed by the PM (design); p8 they only contribute to (testing).
    // Assert the bar VALUES, not raw body text -- "Testing" also appears as a
    // status filter option and as a zero-valued row label, so a substring
    // check would be meaningless here.
    const statusTable = page.getByRole("table", {
      name: /Active projects by status/i,
    });

    await expect(statusTable.getByRole("row", { name: /^Design/ })).toContainText("1");
    await expect(statusTable.getByRole("row", { name: /^Testing/ })).toContainText("0");

    // Cross-check against the admin view, where the contributor-only project
    // genuinely exists -- so the 0 above is scoping, not missing fixture data.
    await signOut(page);
    await signIn(page, fixtures.users["admin-a"]);
    await page.goto(reportUrl("/admin/reports/project-delivery"));

    const adminTable = page.getByRole("table", {
      name: /Active projects by status/i,
    });
    await expect(adminTable.getByRole("row", { name: /^Testing/ })).toContainText("1");
  });

  test("team_member has no Reports nav and is denied every report route", async ({ page }) => {
    await signIn(page, fixtures.users["team-a"]);

    await expect(page.getByRole("link", { name: "Reports", exact: true })).toHaveCount(0);

    for (const route of ["/admin/reports", ...RESTRICTED_ROUTES, "/admin/reports/project-delivery"]) {
      await page.goto(reportUrl(route));
      await expect(page).toHaveURL(/\/admin\?notice=reports_access_denied/);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
  });

  test("a portal client user never reaches the admin report shell", async ({ page }) => {
    await page.goto("/auth/login");
    await page.getByLabel("Email address").fill(fixtures.users["portal-owner-a"].email);
    await page.getByLabel("Password").fill(fixtures.users["portal-owner-a"].password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await page.goto("/admin/reports");

    // Never inside the admin shell, and never showing report content.
    await expect(page).not.toHaveURL(/\/admin\/reports/);
    await expect(page.getByRole("heading", { name: "Reports", level: 1 })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Reports", exact: true })).toHaveCount(0);
  });
});
