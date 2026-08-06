import { expect, test, type Page } from "@playwright/test";

import { readPhase12Fixtures, signIn, signOut, type Phase12Fixtures } from "./helpers";
import { getPhase12E2EConfig, getPhase12E2ESkipReason } from "../helpers/test-env.mjs";

const config = getPhase12E2EConfig();
test.skip(!config, getPhase12E2ESkipReason());

let fixtures: Phase12Fixtures;

test.beforeAll(() => {
  fixtures = readPhase12Fixtures();
});

/**
 * Searches through the server-rendered fallback route rather than the dialog.
 * The dialog and the route share one query layer, so this exercises the same
 * authorization while keeping the assertion about RESULTS rather than about
 * debounce timing.
 *
 * Returns the RESULT GROUP HEADINGS, not the page text. The page's own
 * description reads "Find leads, clients, projects, proposals, invoices and
 * support tickets", so a substring check against the body would report a leak
 * on every single query. Group headings are rendered only for entity types
 * that actually returned rows.
 */
async function searchGroups(page: Page, term: string): Promise<string[]> {
  await page.goto(`/admin/search?q=${encodeURIComponent(term)}`);
  await expect(page.getByRole("heading", { name: "Search", level: 1 })).toBeVisible();

  const headings = await page.getByRole("heading", { level: 3 }).allInnerTexts();
  return headings.map((heading) => heading.trim().toLowerCase());
}

/** Lowercased result-region text, for title-level assertions. */
async function searchResultText(page: Page, term: string): Promise<string> {
  await page.goto(`/admin/search?q=${encodeURIComponent(term)}`);
  await expect(page.getByRole("heading", { name: "Search", level: 1 })).toBeVisible();

  // Scope to the result groups. page.locator("ul").first() would return the
  // sidebar navigation, whose text begins "Dashboard".
  const sections = page.locator('section[aria-labelledby^="search-group-"]');
  if ((await sections.count()) === 0) return "";
  return (await sections.allInnerTexts()).join(" ").toLowerCase();
}

async function hasNoMatches(page: Page): Promise<boolean> {
  return (await page.getByText(/no matches/i).count()) > 0;
}

test.describe("Global search permissions in the browser", () => {
  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

  test("admin finds every authorized entity type", async ({ page }) => {
    await signIn(page, fixtures.users["admin-a"]);

    expect(await searchGroups(page, fixtures.searchTerms.lead)).toContain("leads");
    expect(await searchGroups(page, fixtures.searchTerms.client)).toContain("clients");
    expect(await searchGroups(page, fixtures.searchTerms.project)).toContain("projects");
    expect(await searchGroups(page, fixtures.searchTerms.proposal)).toContain("proposals");
    expect(await searchGroups(page, fixtures.searchTerms.ticket)).toContain("support tickets");
    expect(await searchGroups(page, "NXF-INV-2026-0003")).toContain("invoices");
  });

  test("project_manager cannot find leads, proposals or invoices", async ({ page }) => {
    await signIn(page, fixtures.users["pm-a"]);

    for (const [term, forbidden] of [
      [fixtures.searchTerms.lead, "leads"],
      [fixtures.searchTerms.proposal, "proposals"],
      ["NXF-INV-2026-0003", "invoices"],
    ] as const) {
      const groups = await searchGroups(page, term);
      expect(groups, `PM must not receive a ${forbidden} group`).not.toContain(forbidden);
      expect(await hasNoMatches(page)).toBe(true);
    }
  });

  test("project_manager finds only their managed project", async ({ page }) => {
    await signIn(page, fixtures.users["pm-a"]);
    const text = await searchResultText(page, fixtures.searchTerms.project);

    expect(text).toContain("managed");
    expect(text).not.toContain("contributor");
  });

  test("team_member finds an assigned project but no leads, clients, proposals or invoices", async ({ page }) => {
    await signIn(page, fixtures.users["team-a"]);

    expect(await searchGroups(page, "Phase12 Project")).toContain("projects");

    for (const [term, forbidden] of [
      [fixtures.searchTerms.lead, "leads"],
      [fixtures.searchTerms.client, "clients"],
      [fixtures.searchTerms.proposal, "proposals"],
      ["NXF-INV-2026-0003", "invoices"],
    ] as const) {
      const groups = await searchGroups(page, term);
      expect(groups, `team_member must not receive a ${forbidden} group`).not.toContain(forbidden);
    }
  });

  test("team_member finds their own ticket but not a colleague's", async ({ page }) => {
    await signIn(page, fixtures.users["team-a"]);
    const text = await searchResultText(page, fixtures.searchTerms.ticket);

    expect(text).toContain("assignedteam");
    expect(text).not.toContain("assignedadmin");

    // Positive control: an admin genuinely finds the other ticket, so the
    // absence above is authorization rather than missing fixture data.
    await signOut(page);
    await signIn(page, fixtures.users["admin-a"]);
    const adminText = await searchResultText(page, fixtures.searchTerms.ticket);
    expect(adminText).toContain("assignedadmin");
  });

  test("a portal client user cannot reach admin search at all", async ({ page }) => {
    await page.goto("/auth/login");
    await page.getByLabel("Email address").fill(fixtures.users["portal-owner-a"].email);
    await page.getByLabel("Password").fill(fixtures.users["portal-owner-a"].password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await page.goto(`/admin/search?q=${encodeURIComponent(fixtures.searchTerms.lead)}`);

    await expect(page).not.toHaveURL(/\/admin\/search/);
    await expect(page.getByRole("heading", { name: "Search", level: 1 })).toHaveCount(0);
  });

  test("cross-tenant: Org A cannot find Org B's record, Org B can", async ({ page }) => {
    await signIn(page, fixtures.users["admin-a"]);
    await searchGroups(page, fixtures.searchTerms.crossTenant);
    expect(await hasNoMatches(page)).toBe(true);

    // Positive control from the other tenant.
    await signOut(page);
    await signIn(page, fixtures.users["admin-b"]);
    const orgBGroups = await searchGroups(page, fixtures.searchTerms.crossTenant);
    expect(orgBGroups).toContain("leads");
  });

  test("no raw database error text ever reaches the page", async ({ page }) => {
    await signIn(page, fixtures.users["admin-a"]);

    for (const term of ["%", "__", "a'; drop table leads; --", "x".repeat(400)]) {
      await page.goto(`/admin/search?q=${encodeURIComponent(term)}`);
      const text = (await page.locator("body").innerText()).toLowerCase();

      for (const leak of ["p0001", "42501", "pg_", "sqlstate", "select ", "search_path"]) {
        expect(text, `leaked "${leak}" for query ${term}`).not.toContain(leak);
      }
    }
  });
});
