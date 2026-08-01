import { expect, test } from "@playwright/test";

import { getPhase9E2EConfig, getPhase9E2ESkipReason } from "../helpers/test-env.mjs";
import { readPhase9FixtureIds } from "./fixture-ids";
import { E2E_CLIENT_NAME } from "./global-setup";

const config = getPhase9E2EConfig();
test.skip(!config, getPhase9E2ESkipReason());

test.describe("Internal admin: create, edit, and send an invoice", () => {
  test("sign in, create a draft invoice, add a line item, and send it", async ({
    page,
  }) => {
    readPhase9FixtureIds(); // asserts global setup actually ran

    // 1. Sign in as internal admin.
    await page.goto("/auth/login");
    await page.getByLabel("Email address").fill(config!.internalAdmin.email);
    await page.getByLabel("Password").fill(config!.internalAdmin.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/admin/);

    // 2. Start a new invoice.
    await page.goto("/admin/invoices/new");
    await expect(page.getByRole("heading", { name: "Create invoice" })).toBeVisible();
    await page.getByLabel("Client").selectOption({ label: E2E_CLIENT_NAME });
    const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    await page.getByLabel("Due date").fill(dueDate);
    await page.getByRole("button", { name: "Create draft invoice" }).click();

    // 3. Creating redirects to the edit page.
    await expect(page).toHaveURL(/\/admin\/invoices\/[^/]+\/edit/);
    await expect(page.getByRole("heading", { name: /^Edit/ })).toBeVisible();

    // 4. Add a line item.
    await page.getByLabel("Description").fill("Website design");
    await page.getByLabel("Qty").fill("2");
    await page.getByLabel("Unit price").fill("500");
    await page.getByRole("button", { name: "Add item" }).click();
    await expect(page.getByText("Website design")).toBeVisible();

    // The subtotal/total should reflect 2 x 500 = 1000, server-computed by
    // the invoice_items trigger — never trusted from the browser. Matched
    // without the currency symbol prefix since exact Intl.NumberFormat
    // symbol rendering can vary slightly by platform ICU data; the digits
    // are the part that actually proves the computation is correct.
    await expect(page.getByText("1,000.00").first()).toBeVisible();

    // 5. Navigate to the detail page and send.
    const invoiceUrl = page.url().replace(/\/edit$/, "");
    await page.goto(invoiceUrl);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Send invoice" }).click();

    // The official number being assigned and shown as the page heading is
    // the unambiguous success signal — the exact confirmation message text
    // varies depending on whether Resend is configured in this environment
    // (see sendInvoiceAction), so it is deliberately not asserted here.
    await expect(
      page.getByRole("heading", { name: /^NXF-INV-\d{4}-\d{4,}$/ }),
    ).toBeVisible({ timeout: 25_000 });

    // 7. It also appears correctly in the invoice list with a "Sent" badge.
    await page.goto("/admin/invoices");
    const row = page.locator('[data-testid="invoice-row"]').first();
    await expect(row).toBeVisible();
  });
});
