import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { getPhase11E2EConfig, getPhase11E2ESkipReason } from "../helpers/test-env.mjs";
import { readPhase11FixtureIds } from "./fixture-ids";

const config = getPhase11E2EConfig();
test.skip(!config, getPhase11E2ESkipReason());

async function getUnreadCount(page: import("@playwright/test").Page): Promise<number> {
  const count = await page
    .getByRole("button", { name: /Notifications/ })
    .getAttribute("aria-label");
  const match = count?.match(/(\d+) unread/);
  return match ? Number(match[1]) : 0;
}

test.describe("Notification preferences", () => {
  test("disabling an event type's in-app channel suppresses the next matching event", async ({
    page,
  }) => {
    const fixtures = readPhase11FixtureIds();
    const admin = createClient(config!.url, config!.secretKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });

    await page.goto("/auth/login");
    await page.getByLabel("Email address").fill(config!.internalAdmin.email);
    await page.getByLabel("Password").fill(config!.internalAdmin.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/admin/);

    // 1. Disable in-app notifications for lead.created.
    await page.goto("/admin/notifications/preferences");
    await expect(
      page.getByRole("heading", { name: "Notification preferences" }),
    ).toBeVisible();
    const inAppToggle = page.getByLabel("In-app notifications for New lead received");
    if (await inAppToggle.isChecked()) {
      await inAppToggle.uncheck();
    }
    // The checkbox saves on change via a server action; wait for the
    // request to settle before relying on the new preference.
    await expect(inAppToggle).not.toBeChecked();
    await page.waitForTimeout(500);

    // 2. Capture the unread count before the next lead.created event.
    await page.goto("/admin");
    const beforeCount = await getUnreadCount(page);

    // 3. Raise another lead.created event via the service-role client
    // (actor='system', so the super_admin is a valid recipient, same as
    // admin-notification-flow.spec.ts).
    const uniqueSuffix = Date.now();
    const { error } = await admin.from("leads").insert({
      organization_id: fixtures.organizationId,
      full_name: `E2E Suppressed Lead ${uniqueSuffix}`,
      email: `e2e-suppressed-${uniqueSuffix}@example.com`,
      service_interest: "Website",
      source: "referral",
    });
    if (error) {
      throw new Error(`Failed to create E2E fixture lead: ${error.message}`);
    }

    // 4. The unread count must not have increased — the preference
    // suppressed the in-app notification for this event.
    await page.goto("/admin");
    const afterCount = await getUnreadCount(page);
    expect(afterCount).toBe(beforeCount);

    // 5. Restore the preference so this spec is safe to re-run.
    await page.goto("/admin/notifications/preferences");
    const restoreToggle = page.getByLabel("In-app notifications for New lead received");
    if (!(await restoreToggle.isChecked())) {
      await restoreToggle.check();
    }
  });
});
