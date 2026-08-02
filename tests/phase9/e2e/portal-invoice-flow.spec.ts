import { expect, test } from "@playwright/test";

import { getPhase9E2EConfig, getPhase9E2ESkipReason } from "../helpers/test-env.mjs";
import { readPhase9FixtureIds } from "./fixture-ids";

const config = getPhase9E2EConfig();
test.skip(!config, getPhase9E2ESkipReason());

test.describe("Client portal: view and pay an invoice", () => {
  test("client can see a sent invoice with the correct balance and a pay-online option", async ({
    page,
  }) => {
    const fixtures = readPhase9FixtureIds();

    // Setup uses the API directly (not the browser) so this spec focuses on
    // portal behavior, not re-exercising the admin create/send flow already
    // covered by admin-invoice-flow.spec.ts. The insert itself can use the
    // service-role admin client (bypasses RLS entirely), but send_invoice()
    // requires auth.uid() to resolve the acting internal member's
    // organization/role — a service-role call has no such user context, so
    // sending must go through an authenticated session instead.
    const { createClient } = await import("@supabase/supabase-js");
    const admin = createClient(config!.url, config!.secretKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
    const internalAdmin = createClient(config!.url, config!.publishableKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
    const { error: signInError } = await internalAdmin.auth.signInWithPassword({
      email: config!.internalAdmin.email,
      password: config!.internalAdmin.password,
    });
    if (signInError) {
      throw new Error(`Failed to sign in fixture internal admin: ${signInError.message}`);
    }

    const { data: invoice, error: invoiceError } = await admin
      .from("invoices")
      .insert({
        organization_id: fixtures.organizationId,
        client_id: fixtures.clientId,
        due_date: "2026-12-31",
      })
      .select("id")
      .single();
    if (invoiceError || !invoice) {
      throw new Error(`Failed to create fixture invoice: ${invoiceError?.message}`);
    }

    await admin.from("invoice_items").insert({
      invoice_id: invoice.id,
      description: "Portal E2E line item",
      quantity: 1,
      unit_price: 2500,
    });

    const { error: sendError } = await internalAdmin.rpc("send_invoice", {
      target_invoice_id: invoice.id,
    });
    if (sendError) {
      throw new Error(`Failed to send fixture invoice: ${sendError.message}`);
    }

    // 1. Sign in as the client owner.
    await page.goto("/portal/login");
    await page.getByLabel("Email address").fill(config!.clientOwner.email);
    await page.getByLabel("Password").fill(config!.clientOwner.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    // Anchored: /\/portal/ (unanchored) would also match the current
    // /portal/login URL itself, since it contains "/portal" as a
    // substring — that made the wait a no-op and let the next goto() race
    // the session cookie being set, bouncing back to the login page.
    await expect(page).toHaveURL(/\/portal$/);

    // 2. The invoice list shows the invoice with its balance due.
    await page.goto("/portal/invoices");
    await expect(page.getByRole("heading", { name: "Invoices" })).toBeVisible();
    const row = page.locator(
      '[data-testid="portal-invoice-row"][data-invoice-number]',
      { hasText: "2,500.00" },
    );
    await expect(row.first()).toBeVisible();

    // 3. Opening the invoice shows line items and a pay-online option.
    await row.first().click();
    await expect(page).toHaveURL(new RegExp(`/portal/invoices/${invoice.id}`));
    await expect(page.getByText("Portal E2E line item")).toBeVisible();
    await expect(page.getByRole("button", { name: "Pay online" })).toBeVisible();
  });
});
