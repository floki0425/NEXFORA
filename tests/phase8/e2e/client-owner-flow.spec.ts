import { expect, test } from "@playwright/test";

import { getPhase8E2EConfig, getPhase8E2ESkipReason } from "../helpers/test-env.mjs";
import { readPhase8FixtureIds } from "./fixture-ids";
import {
  E2E_PROJECT_A_CLIENT_FILE_NAME,
  E2E_PROJECT_A_INTERNAL_FILE_NAME,
  E2E_PROJECT_A_READY_REVISION_TITLE,
} from "./global-setup";

const config = getPhase8E2EConfig();
test.skip(!config, getPhase8E2ESkipReason());

test.describe("Client owner: files, revision submission, and review", () => {
  test("can read permitted files, upload, submit revisions, and approve a ready-for-review revision", async ({
    page,
  }) => {
    const fixtures = readPhase8FixtureIds();

    // 1. Sign in as the Client A owner.
    await page.goto("/portal/login");
    await page.getByLabel("Email address").fill(config!.clientOwner.email);
    await page.getByLabel("Password").fill(config!.clientOwner.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    // Matches any /portal page except /portal/login itself — a plain
    // /\/portal/ regex would also match a failed sign-in bounced right back
    // to the login page, masking the real failure behind a confusing error
    // on a later, unrelated assertion.
    await expect(page).toHaveURL(/\/portal(?!\/login)/);

    // 2. Open Project A.
    await page.goto(`/portal/projects/${fixtures.projectAId}`);
    await expect(page.getByRole("heading", { name: "Files" })).toBeVisible();

    // 3. The internal-only fixture file must never appear in the portal.
    await expect(
      page.locator(`[data-file-name="${E2E_PROJECT_A_INTERNAL_FILE_NAME}"]`),
    ).toHaveCount(0);

    // 4. The client-visible fixture file is present and downloadable.
    // data-testid and data-file-name/data-revision-title are all on the
    // same row element (not ancestor/descendant), so .filter({ has }) would
    // never match — combined attribute selectors are used throughout this
    // spec instead.
    const visibleRow = page.locator(
      `[data-testid="portal-file-row"][data-file-name="${E2E_PROJECT_A_CLIENT_FILE_NAME}"]`,
    );
    await expect(visibleRow).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      visibleRow.getByRole("button", { name: "Download" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(E2E_PROJECT_A_CLIENT_FILE_NAME);

    // 5. Upload a new permitted file.
    const uploadedFileName = `e2e-owner-upload-${Date.now()}.txt`;
    await page.setInputFiles("#portal-file", {
      name: uploadedFileName,
      mimeType: "text/plain",
      buffer: Buffer.from("owner-uploaded E2E fixture"),
    });
    await page.getByRole("button", { name: "Upload file" }).click();
    const uploadedRow = page.locator(
      `[data-testid="portal-file-row"][data-file-name="${uploadedFileName}"]`,
    );
    await expect(uploadedRow).toBeVisible();

    // 6. Submit a revision without an attachment.
    const noAttachmentTitle = `E2E owner revision (no attachment) ${Date.now()}`;
    await page.getByLabel("Title").fill(noAttachmentTitle);
    await page
      .getByLabel("Description")
      .fill("Submitted by the client-owner E2E spec without an attachment.");
    await page.getByRole("button", { name: "Submit revision" }).click();
    const noAttachmentRow = page.locator(
      `[data-testid="portal-revision-row"][data-revision-title="${noAttachmentTitle}"]`,
    );
    await expect(noAttachmentRow).toBeVisible();
    await expect(noAttachmentRow.getByTestId("revision-status-badge")).toHaveText(
      "Submitted",
    );

    // 7. Submit a revision with the file just uploaded as its attachment.
    const withAttachmentTitle = `E2E owner revision (with attachment) ${Date.now()}`;
    await page.getByLabel("Title").fill(withAttachmentTitle);
    await page
      .getByLabel("Description")
      .fill("Submitted by the client-owner E2E spec with an attachment.");
    await page.getByLabel("Attachment").selectOption({ label: uploadedFileName });
    await page.getByRole("button", { name: "Submit revision" }).click();
    const withAttachmentRow = page.locator(
      `[data-testid="portal-revision-row"][data-revision-title="${withAttachmentTitle}"]`,
    );
    await expect(withAttachmentRow).toBeVisible();
    await expect(withAttachmentRow.getByTestId("revision-status-badge")).toHaveText(
      "Submitted",
    );

    // 8. Review the fixed ready-for-review revision and approve it. This
    // fixture is created directly in "ready_for_review" status by
    // global-setup.ts so this spec never depends on internal-admin-flow
    // having run first.
    const readyRow = page.locator(
      `[data-testid="portal-revision-row"][data-revision-title="${E2E_PROJECT_A_READY_REVISION_TITLE}"]`,
    );
    await expect(readyRow).toBeVisible();
    await expect(readyRow.getByTestId("revision-status-badge")).toHaveText(
      "Ready for review",
    );
    await readyRow.getByRole("button", { name: "Approve" }).click();
    await page.getByRole("button", { name: "Yes, approve" }).click();
    await expect(readyRow.getByTestId("revision-status-badge")).toHaveText(
      "Approved",
    );
  });
});
