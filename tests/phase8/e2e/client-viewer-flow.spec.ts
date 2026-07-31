import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { getPhase8E2EConfig, getPhase8E2ESkipReason } from "../helpers/test-env.mjs";
import { signInTestUser } from "../helpers/supabase-clients.mjs";
import { readPhase8FixtureIds } from "./fixture-ids";
import {
  E2E_PROJECT_A_CLIENT_FILE_NAME,
  E2E_PROJECT_A_INTERNAL_FILE_NAME,
} from "./global-setup";

const config = getPhase8E2EConfig();
test.skip(!config, getPhase8E2ESkipReason());

test.describe("Client viewer: read-only portal access", () => {
  test("can read permitted files but has no upload or revision-submission UI", async ({
    page,
  }) => {
    const fixtures = readPhase8FixtureIds();

    // 1. Sign in as the Client A viewer.
    await page.goto("/portal/login");
    await page.getByLabel("Email address").fill(config!.clientViewer.email);
    await page.getByLabel("Password").fill(config!.clientViewer.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    // See client-owner-flow.spec.ts: excludes /portal/login so a failed
    // sign-in that bounces back to the login page fails here clearly,
    // instead of masquerading as a later, unrelated assertion failure.
    await expect(page).toHaveURL(/\/portal(?!\/login)/);

    // 2. Open Project A.
    await page.goto(`/portal/projects/${fixtures.projectAId}`);
    await expect(page.getByRole("heading", { name: "Files" })).toBeVisible();

    // 3. Permitted (client-visible) files are readable and downloadable.
    // data-testid and data-file-name are both on the same row element, not
    // ancestor/descendant, so .filter({ has }) (which only matches
    // descendants) would never match here — a combined attribute selector
    // is required instead.
    const visibleRow = page.locator(
      `[data-testid="portal-file-row"][data-file-name="${E2E_PROJECT_A_CLIENT_FILE_NAME}"]`,
    );
    await expect(visibleRow).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      visibleRow.getByRole("button", { name: "Download" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(E2E_PROJECT_A_CLIENT_FILE_NAME);

    // 4. The internal-only fixture file never appears in the portal.
    await expect(
      page.locator(`[data-file-name="${E2E_PROJECT_A_INTERNAL_FILE_NAME}"]`),
    ).toHaveCount(0);

    // 5. The upload form is entirely absent for a viewer — not merely
    // disabled — since PortalFileUploadForm is only rendered when
    // member.role is "owner" or "manager".
    await expect(page.locator("#portal-file")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Upload file" })).toHaveCount(0);

    // 6. The revision submission form is entirely absent for a viewer.
    await expect(page.getByLabel("Title")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Submit revision" })).toHaveCount(0);

    // 7. No approve/request-changes controls exist for a viewer either,
    // even if a ready-for-review revision exists on this project.
    await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Request further changes" }),
    ).toHaveCount(0);
  });

  test("direct upload and revision-submission RPC calls are rejected by RLS, bypassing the UI entirely", async () => {
    const fixtures = readPhase8FixtureIds();
    const viewerClient = await signInTestUser(
      config!.clientViewer.email,
      config!.clientViewer.password,
    );

    // A real, authenticated attempt to call the exact RPC the upload form
    // uses, skipping the UI (and its role check) entirely. RLS/authorization
    // inside create_client_project_file must still reject a viewer.
    const bypassFileName = `viewer-bypass-${randomUUID()}.txt`;
    const { error: uploadError } = await viewerClient.rpc(
      "create_client_project_file",
      {
        target_project_id: fixtures.projectAId,
        p_file_name: bypassFileName,
        p_storage_path: `organization/${fixtures.organizationId}/client/${fixtures.clientAId}/project/${fixtures.projectAId}/${randomUUID()}-${bypassFileName}`,
        p_mime_type: "text/plain",
        p_file_size: 10,
        p_category: "",
      },
    );
    expect(uploadError).not.toBeNull();

    // Same for revision submission.
    const { error: revisionError } = await viewerClient.rpc(
      "create_client_revision",
      {
        target_project_id: fixtures.projectAId,
        p_page_name: "",
        p_section_name: "",
        p_title: "Viewer bypass attempt",
        p_description: "Attempting to submit a revision directly, bypassing the UI.",
        p_priority: "low",
      },
    );
    expect(revisionError).not.toBeNull();
  });
});
