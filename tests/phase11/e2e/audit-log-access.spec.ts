import { expect, test } from "@playwright/test";

import { getPhase11E2EConfig, getPhase11E2ESkipReason } from "../helpers/test-env.mjs";

const config = getPhase11E2EConfig();
test.skip(!config, getPhase11E2ESkipReason());

test.describe("Audit log access", () => {
  test("super_admin can view the audit log", async ({ page }) => {
    await page.goto("/auth/login");
    await page.getByLabel("Email address").fill(config!.internalAdmin.email);
    await page.getByLabel("Password").fill(config!.internalAdmin.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/admin/);

    await page.goto("/admin/settings/audit-log");
    await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
  });

  test("team_member gets a permission-denied state, not a crash", async ({ page }) => {
    await page.goto("/auth/login");
    await page.getByLabel("Email address").fill(config!.teamMember.email);
    await page.getByLabel("Password").fill(config!.teamMember.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/admin/);

    await page.goto("/admin/settings/audit-log");
    // requireSettingsAccess() redirects non-admin roles to
    // /admin?notice=settings_access_denied — a real, rendered notice, not an
    // unhandled error boundary or a blank/crashed page.
    await expect(page).toHaveURL(/\/admin\?notice=settings_access_denied/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});
