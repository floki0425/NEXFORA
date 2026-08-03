import { expect, test } from "@playwright/test";

import { getPhase11E2EConfig, getPhase11E2ESkipReason } from "../helpers/test-env.mjs";

const config = getPhase11E2EConfig();
test.skip(!config, getPhase11E2ESkipReason());

test.describe("Client portal has no notification UI", () => {
  test("portal user sees no notification bell or feed, and direct /admin/notifications navigation is refused", async ({
    page,
  }) => {
    // 1. Sign in as the Phase 11 client portal owner.
    await page.goto("/portal/login");
    await page.getByLabel("Email address").fill(config!.clientOwner.email);
    await page.getByLabel("Password").fill(config!.clientOwner.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/portal(?!\/login)/);

    // 2. No notification bell anywhere in the portal shell — Phase 11 is
    // explicitly in-app-notifications-for-internal-staff-only this phase
    // (clients get email only; see the Phase 11 handoff SS5/SS11).
    await expect(page.getByRole("button", { name: /Notifications/ })).toHaveCount(0);

    // 3. Direct navigation to the admin notification feed is refused, not
    // silently rendered — requireInternalMember() has no internal
    // membership for a client-portal-only identity, so it redirects to
    // login rather than crashing or leaking any admin content.
    await page.goto("/admin/notifications");
    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(page.getByRole("heading", { name: "Notifications" })).toHaveCount(0);
  });
});
