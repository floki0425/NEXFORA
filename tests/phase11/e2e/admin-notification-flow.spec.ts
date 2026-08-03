import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { getPhase11E2EConfig, getPhase11E2ESkipReason } from "../helpers/test-env.mjs";
import { readPhase11FixtureIds } from "./fixture-ids";

const config = getPhase11E2EConfig();
test.skip(!config, getPhase11E2ESkipReason());

test.describe("Admin notification flow", () => {
  test("event -> bell -> feed lists exactly this notification -> mark read -> gone from unread filter", async ({
    page,
  }) => {
    const fixtures = readPhase11FixtureIds();

    // Unique per execution — previous runs (this spec run repeatedly, or
    // other Phase 11 E2E specs sharing the same fixture org) leave their own
    // "New lead received" notifications behind on purpose (no broad cleanup
    // of unrelated TEST data), so every locator below is scoped to this
    // run's own lead by its real entity id, never by the shared title text.
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Service-role setup is acceptable for fixtures (mirrors Phase 8's own
    // pattern); product behavior itself is exercised through the real
    // signed-in browser session below. Inserted via service role so the
    // actor is 'system', not the super_admin who is about to sign in —
    // otherwise the actor-exclusion rule would mean nobody gets notified.
    const admin = createClient(config!.url, config!.secretKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
    const { data: lead, error } = await admin
      .from("leads")
      .insert({
        organization_id: fixtures.organizationId,
        full_name: `E2E Notification Lead ${runId}`,
        email: `e2e-notification-${runId}@example.com`,
        service_interest: "Website",
        source: "referral",
      })
      .select("id")
      .single();
    if (error || !lead) {
      throw new Error(`Failed to create E2E fixture lead: ${error?.message}`);
    }

    // 1. Sign in as the Phase 11 super_admin.
    await page.goto("/auth/login");
    await page.getByLabel("Email address").fill(config!.internalAdmin.email);
    await page.getByLabel("Password").fill(config!.internalAdmin.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/admin/);

    // 2. The bell shows a non-zero unread count (coarse smoke check — not
    // tied to this run's specific notification, so no locator ambiguity).
    const bellButton = page.getByRole("button", { name: /Notifications/ });
    await expect(bellButton).toHaveAttribute("aria-label", /Notifications, \d+ unread/);

    // A single locator, scoped by this run's real lead id, reused across
    // every surface it appears in below (Playwright re-queries the live DOM
    // on every use — no staleness risk across the navigations that follow).
    const thisNotification = page.locator(
      `[data-testid="notification-item"][data-entity-id="${lead.id}"]`,
    );

    // 3. Opening the bell lists exactly this run's notification, nothing
    // ambiguous about which one.
    await bellButton.click();
    const bellDialog = page.getByRole("dialog", { name: "Notifications" });
    const notificationInBell = bellDialog.locator(
      `[data-testid="notification-item"][data-entity-id="${lead.id}"]`,
    );
    await expect(notificationInBell).toHaveCount(1);
    await expect(notificationInBell).toContainText("New lead received");
    await page.keyboard.press("Escape");

    // 4. The full feed lists exactly one row for this lead (never asserting
    // anything about the total feed size, which legitimately includes rows
    // from other runs).
    await page.goto("/admin/notifications");
    await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
    await expect(thisNotification).toHaveCount(1);
    await expect(thisNotification).toContainText("New lead received");

    // 5. Clicking it marks only this notification read (it also navigates
    // to the lead detail page, since "lead" is a routable entity type —
    // that is expected, real product behavior, not a distraction).
    await thisNotification.click();

    // 6. Back on the unread filter, this exact notification is gone —
    // expect()'s built-in polling absorbs the mark-read request's real
    // network latency; nothing here is an arbitrary sleep or a manual retry
    // loop, and the suite's configured timeouts are untouched.
    await page.goto("/admin/notifications?filter=unread");
    await expect(thisNotification).toHaveCount(0);
  });
});
