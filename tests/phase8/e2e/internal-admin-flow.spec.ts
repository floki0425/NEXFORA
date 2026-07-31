import { expect, test } from "@playwright/test";

import { getPhase8E2EConfig, getPhase8E2ESkipReason } from "../helpers/test-env.mjs";
import { readPhase8FixtureIds } from "./fixture-ids";
import { E2E_PROJECT_A_NAME, E2E_PROJECT_A_REVISION_TITLE } from "./global-setup";

const config = getPhase8E2EConfig();
test.skip(!config, getPhase8E2ESkipReason());

test.describe("Internal admin: upload files and manage a revision", () => {
  test("sign in, upload internal + client-visible files, download, and move a revision through its workflow", async ({
    page,
  }) => {
    const fixtures = readPhase8FixtureIds();

    // 1. Sign in as internal admin.
    await page.goto("/auth/login");
    await page.getByLabel("Email address").fill(config!.internalAdmin.email);
    await page.getByLabel("Password").fill(config!.internalAdmin.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/admin/);

    // 2. Open Project A.
    await page.goto(`/admin/projects/${fixtures.projectAId}/files`);
    await expect(page.getByRole("heading", { name: "Files" })).toBeVisible();

    // 3. Upload an internal file.
    const internalFileName = `e2e-internal-${Date.now()}.txt`;
    await page.setInputFiles("#file", {
      name: internalFileName,
      mimeType: "text/plain",
      buffer: Buffer.from("internal E2E fixture"),
    });
    await page.getByLabel("Visibility").selectOption("internal");
    await page.getByRole("button", { name: "Upload file" }).click();

    // 4. Confirm it appears in admin, with the "Internal only" badge.
    // data-testid and data-file-name are both on the same row element, not
    // ancestor/descendant, so .filter({ has }) (which only matches
    // descendants) would never match here — a combined attribute selector
    // is required instead.
    const internalRow = page.locator(
      `[data-testid="project-file-row"][data-file-name="${internalFileName}"]`,
    );
    await expect(internalRow).toBeVisible();
    await expect(internalRow.getByTestId("file-visibility-badge")).toHaveText(
      "Internal only",
    );

    // 5. Upload a client-visible file.
    const clientFileName = `e2e-client-visible-${Date.now()}.txt`;
    await page.setInputFiles("#file", {
      name: clientFileName,
      mimeType: "text/plain",
      buffer: Buffer.from("client-visible E2E fixture"),
    });
    await page.getByLabel("Visibility").selectOption("client");
    await page.getByRole("button", { name: "Upload file" }).click();

    // 6. Confirm visibility badges for both files.
    const clientRow = page.locator(
      `[data-testid="project-file-row"][data-file-name="${clientFileName}"]`,
    );
    await expect(clientRow).toBeVisible();
    await expect(clientRow.getByTestId("file-visibility-badge")).toHaveText(
      "Visible to client",
    );

    // 7. Download an authorized file — a signed URL download initiates.
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      clientRow.getByRole("button", { name: "Download" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(clientFileName);

    // 8. Open revisions.
    await page.goto(`/admin/revisions?projectId=${fixtures.projectAId}`);
    await expect(page.getByRole("heading", { name: "Revisions" })).toBeVisible();
    const revisionLink = page.getByRole("link", {
      name: E2E_PROJECT_A_REVISION_TITLE,
    });
    await revisionLink.click();

    // 9. Assign the revision to the internal admin (self-assignment is
    // permitted — the RLS policy only requires an active org member).
    // RevisionAssignForm auto-submits on <select> change
    // (`<form onChange={submit}>`) — no separate button click is needed,
    // and the component never renders a success message (only an error
    // one), so the reliable, real signal that the request has completed
    // is the submit button's pending label ("Saving…") reverting back to
    // "Update assignment".
    const assigneeSelect = page.getByLabel("Assigned to");
    await assigneeSelect.selectOption({ label: "E2E Internal Admin" });
    await expect(
      page.getByRole("button", { name: "Update assignment" }),
    ).toBeVisible();

    // 10. Move through valid statuses: submitted -> reviewing -> in_progress.
    // exact: true is required here — plain getByText does a
    // case-insensitive substring match by default, and the activity
    // timeline accumulates entries like "Status changed to in progress"
    // across repeated runs of this reused fixture, which would otherwise
    // also match "In progress"/"Reviewing" and violate strict mode.
    await page.getByRole("button", { name: "Start reviewing" }).click();
    await expect(page.getByText("Reviewing", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Start work" }).click();
    await expect(page.getByText("In progress", { exact: true })).toBeVisible();

    // 11. Mark ready for review.
    await page.getByRole("button", { name: "Mark ready for review" }).click();
    await expect(
      page.getByText("Ready for review", { exact: true }),
    ).toBeVisible();
  });

  test("Project A is reachable by its documented name (sanity check for global setup)", async ({
    page,
  }) => {
    await page.goto("/auth/login");
    await page.getByLabel("Email address").fill(config!.internalAdmin.email);
    await page.getByLabel("Password").fill(config!.internalAdmin.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    // Wait for the sign-in redirect to actually land before navigating
    // away — without this, goto("/admin/projects") can race the
    // server action's session-cookie write and get bounced back to
    // /auth/login by the proxy, which looks like "the link isn't there"
    // but is really "we were never signed in yet."
    await expect(page).toHaveURL(/\/admin/);

    await page.goto("/admin/projects");
    await expect(page.getByRole("link", { name: E2E_PROJECT_A_NAME })).toBeVisible();
  });
});
