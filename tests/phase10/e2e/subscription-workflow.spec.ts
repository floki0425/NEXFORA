import { expect, test, type Page } from "@playwright/test";

import {
  getPhase10E2EConfig,
  getPhase10E2ESkipReason,
} from "../helpers/test-env.mjs";
import { readPhase10FixtureIds } from "./fixture-ids";

const config = getPhase10E2EConfig();
test.skip(!config, getPhase10E2ESkipReason());

async function signIn(
  page: Page,
  surface: "admin" | "portal",
  credentials: { email: string; password: string },
) {
  await page.goto(surface === "admin" ? "/auth/login" : "/portal/login");
  await page.getByLabel("Email address").fill(credentials.email);
  await page.getByLabel("Password").fill(credentials.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(
    surface === "admin" ? /\/admin(?:\/|$)/ : /\/portal(?!\/login)/,
  );
}

test("admin records a maintenance plan and client sees the correct remaining hours", async ({
  browser,
}) => {
  const fixtures = readPhase10FixtureIds();
  const adminContext = await browser.newContext({ baseURL: config!.appUrl });
  const portalContext = await browser.newContext({ baseURL: config!.appUrl });
  const adminPage = await adminContext.newPage();
  const portalPage = await portalContext.newPage();

  try {
    await signIn(adminPage, "admin", config!.internalAdmin);
    const planName = `E2E care plan ${Date.now()}`;
    await adminPage.goto("/admin/subscriptions/new");
    await adminPage.getByLabel("Client").selectOption({
      label: "Phase 8 E2E Client A",
    });
    await adminPage.getByLabel("Project").selectOption({
      label: "Phase 8 E2E Project A",
    });
    await adminPage.getByLabel("Plan name").fill(planName);
    await adminPage.getByLabel("Billing cycle").selectOption("monthly");
    await adminPage.getByLabel("Amount").fill("5000.00");
    await adminPage.getByLabel("Included hours").fill("10");
    await adminPage.getByLabel("Renewal date").fill("2026-12-01");
    await adminPage
      .getByLabel("Internal notes")
      .fill("Internal E2E note that must never reach the portal.");
    await adminPage.getByRole("button", { name: "Create subscription" }).click();
    await expect(adminPage).toHaveURL(/\/admin\/subscriptions\/[0-9a-f-]+$/);
    const subscriptionId = adminPage.url().split("/").pop()!;
    expect(subscriptionId).not.toBe(fixtures.crossClientSubscriptionId);

    await adminPage.getByLabel("Work completed").fill("Emergency production support");
    await adminPage.getByLabel("Hours used").fill("3.5");
    // Targeted by its static element id rather than getByLabel("Date"):
    // this page legitimately renders three date inputs (the plan's "Start
    // date" and "Renewal date", plus the usage form's "Date"), and
    // getByLabel does a substring match, so "Date" resolved to all three
    // and failed Playwright strict mode. Matches the existing convention in
    // the Phase 8 specs, which address "#file"/"#portal-file" the same way.
    await adminPage.locator("#usageDate").fill("2026-08-15");
    await adminPage.getByRole("button", { name: "Record usage" }).click();
    await expect(adminPage.getByText("Emergency production support")).toBeVisible();
    await expect(adminPage.getByText("6.5h")).toBeVisible();

    await signIn(portalPage, "portal", config!.clientOwner);
    await portalPage.goto("/portal/subscriptions");
    await expect(portalPage.getByText(planName)).toBeVisible();
    await expect(portalPage.getByText("Client B private care plan")).toHaveCount(0);
    await expect(portalPage.getByText(/6\.5h remaining/)).toBeVisible();
    await portalPage.goto(
      `/portal/subscriptions/${fixtures.crossClientSubscriptionId}`,
    );
    await expect(
      portalPage.getByRole("heading", { name: "Maintenance plan not found" }),
    ).toBeVisible();
    await portalPage.goto("/portal/subscriptions");
    await portalPage.getByText(planName).click();
    await expect(portalPage).toHaveURL(
      new RegExp(`/portal/subscriptions/${subscriptionId}$`),
    );
    // "3.5h" legitimately appears twice on this page — once as the "Used"
    // metric in the hours summary and once on the ledger entry itself — so
    // each assertion is scoped to the region whose value it is actually
    // verifying rather than matching page-wide.
    const usageRow = portalPage
      .getByTestId("portal-subscription-usage-row")
      .filter({ hasText: "Emergency production support" });
    await expect(usageRow).toBeVisible();
    await expect(usageRow.getByText("3.5h")).toBeVisible();

    const hoursSummary = portalPage
      .locator("dl")
      .filter({ hasText: "Remaining" });
    await expect(hoursSummary.getByText("3.5h")).toBeVisible();
    await expect(hoursSummary.getByText("6.5h")).toBeVisible();
    await expect(
      portalPage.getByText("Internal E2E note that must never reach the portal."),
    ).toHaveCount(0);
  } finally {
    await adminContext.close();
    await portalContext.close();
  }
});
