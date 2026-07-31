import { expect, test } from "@playwright/test";

import { getPhase8E2EConfig, getPhase8E2ESkipReason } from "../helpers/test-env.mjs";
import { signInTestUser } from "../helpers/supabase-clients.mjs";
import { readPhase8FixtureIds } from "./fixture-ids";
import { E2E_PROJECT_B_FILE_NAME, E2E_PROJECT_B_NAME } from "./global-setup";

const config = getPhase8E2EConfig();
test.skip(!config, getPhase8E2ESkipReason());

test.describe("Cross-client access: Client A must never reach Client B's data", () => {
  test("Client B's project, files, and revisions are unreachable and never named in the UI", async ({
    page,
  }) => {
    const fixtures = readPhase8FixtureIds();

    // 1. Sign in as the Client A owner. No auth user for Client B exists —
    // this spec never signs in as Client B.
    await page.goto("/portal/login");
    await page.getByLabel("Email address").fill(config!.clientOwner.email);
    await page.getByLabel("Password").fill(config!.clientOwner.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    // See client-owner-flow.spec.ts: excludes /portal/login so a failed
    // sign-in that bounces back to the login page fails here clearly,
    // instead of masquerading as a later, unrelated assertion failure.
    await expect(page).toHaveURL(/\/portal(?!\/login)/);

    // 2. Attempting Client B's project URL directly must produce a safe
    // "not found" state, not an error page and not Client B's data.
    await page.goto(`/portal/projects/${fixtures.projectBId}`);
    await expect(page.getByRole("heading", { name: "Project not found" })).toBeVisible();
    await expect(page.getByText(E2E_PROJECT_B_NAME)).toHaveCount(0);
    await expect(page.getByText(E2E_PROJECT_B_FILE_NAME)).toHaveCount(0);

    // 3. Client A's own project list must never list Client B's project.
    await page.goto("/portal/projects");
    await expect(page.getByText(E2E_PROJECT_B_NAME)).toHaveCount(0);

    // 4. Direct, authenticated RPC calls (bypassing the UI, which never
    // offers a path to Client B's ids in the first place) must also be
    // rejected/empty — these are the exact SECURITY DEFINER functions the
    // portal queries use, called here with Client B's real ids while
    // authenticated as Client A.
    const ownerClient = await signInTestUser(
      config!.clientOwner.email,
      config!.clientOwner.password,
    );

    const { data: crossFiles, error: filesError } = await ownerClient.rpc(
      "get_client_project_files",
      { target_project_id: fixtures.projectBId },
    );
    expect(filesError).toBeNull();
    expect(crossFiles ?? []).toHaveLength(0);

    const { data: crossRevisions, error: revisionsError } = await ownerClient.rpc(
      "get_client_revisions",
      { target_project_id: fixtures.projectBId },
    );
    expect(revisionsError).toBeNull();
    expect(crossRevisions ?? []).toHaveLength(0);

    const { data: crossDownload, error: downloadError } = await ownerClient.rpc(
      "get_client_file_for_download",
      { target_file_id: fixtures.projectBFileId },
    );
    expect(downloadError).toBeNull();
    expect(crossDownload ?? []).toHaveLength(0);
  });
});
