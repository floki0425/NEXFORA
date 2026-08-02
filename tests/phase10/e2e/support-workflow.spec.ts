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

test("admin and client complete the support lifecycle without cross-client leakage", async ({
  browser,
}) => {
  const fixtures = readPhase10FixtureIds();
  const adminContext = await browser.newContext({ baseURL: config!.appUrl });
  const portalContext = await browser.newContext({ baseURL: config!.appUrl });
  const adminPage = await adminContext.newPage();
  const portalPage = await portalContext.newPage();

  try {
    await signIn(adminPage, "admin", config!.internalAdmin);

    // The internal-create path is the behavior added by the corrective
    // follow-up migration; this must never use a service-role browser path.
    const internalTitle = `Admin-created support ticket ${Date.now()}`;
    await adminPage.goto("/admin/support/new");
    await adminPage.getByLabel("Client").selectOption({
      label: "Phase 8 E2E Client A",
    });
    await adminPage.getByLabel("Project").selectOption({
      label: "Phase 8 E2E Project A",
    });
    await adminPage.getByLabel("Title").fill(internalTitle);
    await adminPage.getByLabel("Category").fill("Website");
    await adminPage.getByLabel("Priority").selectOption("high");
    await adminPage
      .getByLabel("Description")
      .fill("The administrator recorded this client request through the authenticated UI.");
    await adminPage
      .getByRole("button", { name: "Create support ticket" })
      .click();
    await expect(adminPage).toHaveURL(/\/admin\/support\/[0-9a-f-]+$/);
    await expect(adminPage.getByText(internalTitle)).toBeVisible();
    // Unanchored on purpose: the admin detail header renders the official
    // number together with the client name in one line
    // ("NXF-TKT-2026-0004 - Phase 8 E2E Client A"), so an anchored
    // /^...$/ regex could never match that element. The portal detail page
    // below renders the number on its own, which is why the anchored form
    // is still correct there.
    await expect(adminPage.getByText(/NXF-TKT-\d{4}-\d{4,}/)).toBeVisible();

    await signIn(portalPage, "portal", config!.clientOwner);
    await portalPage.goto("/portal/support");
    await expect(portalPage.getByText("Client B private support ticket")).toHaveCount(0);
    await portalPage.goto(`/portal/support/${fixtures.crossClientTicketId}`);
    await expect(
      portalPage.getByRole("heading", { name: "Support request not found" }),
    ).toBeVisible();
    await portalPage.goto("/portal/support");

    const clientTitle = `Portal support request ${Date.now()}`;
    await portalPage.getByRole("link", { name: "New support request" }).click();
    await portalPage.getByLabel("Project").selectOption({
      label: "Phase 8 E2E Project A",
    });
    await portalPage.getByLabel("What do you need help with?").fill(clientTitle);
    await portalPage.getByLabel("Category").fill("Hosting");
    await portalPage.getByLabel("Priority").selectOption("urgent");
    await portalPage
      .getByLabel("Tell us what happened")
      .fill("The live site intermittently returns an error on mobile.");
    await portalPage
      .getByRole("button", { name: "Send support request" })
      .click();
    await expect(portalPage).toHaveURL(/\/portal\/support\/[0-9a-f-]+$/);
    const ticketId = portalPage.url().split("/").pop()!;
    expect(ticketId).not.toBe(fixtures.crossClientTicketId);
    await expect(portalPage.getByText(/^NXF-TKT-\d{4}-\d{4,}$/)).toBeVisible();

    // Admin assignment and the corrected internal transition sequence.
    await adminPage.goto(`/admin/support/${ticketId}`);
    await adminPage.getByLabel("Assigned to").selectOption({
      label: "E2E Internal Admin",
    });
    await adminPage.getByRole("button", { name: "Update assignment" }).click();
    await expect(adminPage.getByRole("button", { name: "Mark assigned" })).toBeVisible();
    await adminPage.getByRole("button", { name: "Mark assigned" }).click();
    await expect(adminPage.getByRole("button", { name: "Start work" })).toBeVisible();
    await adminPage.getByRole("button", { name: "Start work" }).click();
    await expect(adminPage.getByLabel("Resolution note")).toBeVisible();
    await adminPage
      .getByLabel("Resolution note")
      .fill("Updated the hosting rule and verified the mobile path.");
    await adminPage.getByRole("button", { name: "Resolve ticket" }).click();
    // Asserted on the status badge, not page-wide text: the admin detail
    // page also renders a "Resolved" definition-list term for the resolved
    // timestamp, which is present even while the ticket is still open, so
    // getByText("Resolved").first() passed without the transition having
    // actually happened and masked the real failure.
    await expect(adminPage.getByTestId("support-status-badge")).toHaveText(
      "Resolved",
    );

    // The client reports that the issue remains, with the required comment.
    await portalPage.reload();
    await expect(portalPage.getByText("Resolution from Nexfora")).toBeVisible();
    await portalPage.getByRole("button", { name: "The issue still exists" }).click();
    await portalPage
      .getByLabel("What is still not working?")
      .fill("The same error still appears after signing in on mobile.");
    await portalPage.getByRole("button", { name: "Reopen request" }).click();
    await expect(
      portalPage.getByTestId("portal-support-status-badge"),
    ).toHaveText("In progress");

    // Resolve again, then let the client explicitly confirm closure.
    await adminPage.reload();
    await adminPage
      .getByLabel("Resolution note")
      .fill("Cleared the authenticated mobile cache and verified the fix.");
    await adminPage.getByRole("button", { name: "Resolve ticket" }).click();
    await expect(adminPage.getByTestId("support-status-badge")).toHaveText(
      "Resolved",
    );

    await portalPage.reload();
    await portalPage.getByRole("button", { name: "Confirm this is fixed" }).click();
    await portalPage.getByRole("button", { name: "Yes, close request" }).click();
    await expect(
      portalPage.getByTestId("portal-support-status-badge"),
    ).toHaveText("Closed");
    await expect(
      portalPage.getByText("Client confirmed the resolution"),
    ).toBeVisible();
  } finally {
    await adminContext.close();
    await portalContext.close();
  }
});
