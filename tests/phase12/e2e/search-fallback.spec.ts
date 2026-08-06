import { expect, test, type Page } from "@playwright/test";

import { readPhase12Fixtures, signIn, signOut, type Phase12Fixtures } from "./helpers";
import { getPhase12E2EConfig, getPhase12E2ESkipReason } from "../helpers/test-env.mjs";

const config = getPhase12E2EConfig();
test.skip(!config, getPhase12E2ESkipReason());

// /admin/search is the server-rendered fallback for the ⌘K palette. It shares
// one query layer with the dialog, so authorization is identical -- but it
// must also work with JavaScript switched off, because that is the whole
// reason it exists. A fallback that silently depends on hydration is not a
// fallback.
//
// Result hrefs matter as much as result visibility: a row that renders but
// links to the wrong detail route is a real navigation defect that a
// text-only assertion would never notice.

let fixtures: Phase12Fixtures;

test.beforeAll(() => {
  fixtures = readPhase12Fixtures();
});

async function gotoSearch(page: Page, term: string): Promise<void> {
  await page.goto(`/admin/search?q=${encodeURIComponent(term)}`);
  await expect(page.getByRole("heading", { name: "Search", level: 1 })).toBeVisible();
}

/** Lowercased group headings actually rendered (empty groups are dropped). */
async function groupHeadings(page: Page): Promise<string[]> {
  const headings = await page.getByRole("heading", { level: 3 }).allInnerTexts();
  return headings.map((heading) => heading.trim().toLowerCase());
}

test.describe("Admin search fallback route", () => {
  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

  test("renders grouped results with the correct entity headings", async ({ page }) => {
    await signIn(page, fixtures.users["admin-a"]);

    await gotoSearch(page, fixtures.searchTerms.ticket);
    expect(await groupHeadings(page)).toContain("support tickets");

    await gotoSearch(page, fixtures.searchTerms.lead);
    expect(await groupHeadings(page)).toContain("leads");

    await gotoSearch(page, fixtures.searchTerms.client);
    expect(await groupHeadings(page)).toContain("clients");

    await gotoSearch(page, fixtures.searchTerms.project);
    expect(await groupHeadings(page)).toContain("projects");

    await gotoSearch(page, fixtures.searchTerms.proposal);
    expect(await groupHeadings(page)).toContain("proposals");

    await gotoSearch(page, "NXF-INV-2026-0003");
    expect(await groupHeadings(page)).toContain("invoices");
  });

  test("result hrefs point at the correct detail routes", async ({ page }) => {
    await signIn(page, fixtures.users["admin-a"]);

    const cases = [
      { term: fixtures.searchTerms.lead, route: "leads", id: fixtures.leads.searchable },
      { term: fixtures.searchTerms.client, route: "clients", id: fixtures.clients.converted },
      { term: fixtures.searchTerms.project, route: "projects", id: fixtures.projects.managedByPm },
      { term: fixtures.searchTerms.proposal, route: "proposals", id: fixtures.proposals.searchable },
      { term: "NXF-INV-2026-0003", route: "invoices", id: fixtures.invoices.overdue },
      {
        term: fixtures.searchTerms.ticket,
        route: "support",
        id: fixtures.tickets.assignedToTeamMember,
      },
    ];

    for (const { term, route, id } of cases) {
      await gotoSearch(page, term);
      const link = page.locator(
        `section[aria-labelledby^="search-group-"] a[href="/admin/${route}/${id}"]`,
      );
      await expect(
        link,
        `${term} should link to /admin/${route}/${id}`,
      ).toHaveCount(1);
    }
  });

  test("with no query it shows the idle state, not an error", async ({ page }) => {
    await signIn(page, fixtures.users["admin-a"]);
    await page.goto("/admin/search");

    await expect(page.getByRole("heading", { name: "Search", level: 1 })).toBeVisible();
    // The idle EmptyState's own description -- "Search the workspace" alone
    // would also match the topbar trigger's screen-reader label.
    await expect(
      page.getByText("Enter a term above to find records you have access to."),
    ).toBeVisible();
    expect(await groupHeadings(page)).toHaveLength(0);
  });

  test("a zero-result query shows the empty state", async ({ page }) => {
    await signIn(page, fixtures.users["admin-a"]);
    await gotoSearch(page, "zzzznomatchzzzz");

    await expect(page.getByText("No matches").first()).toBeVisible();
    expect(await groupHeadings(page)).toHaveLength(0);
  });

  test("a one-character query shows the minimum-query guidance", async ({ page }) => {
    await signIn(page, fixtures.users["admin-a"]);
    await gotoSearch(page, "a");

    // The guidance states the minimum explicitly rather than failing silently.
    await expect(page.getByText(/Enter at least 2 characters/i)).toBeVisible();
    expect(await groupHeadings(page)).toHaveLength(0);
    // A single character is below threshold, not an error.
    await expect(page.getByText(/We couldn.t run that search/i)).toHaveCount(0);
  });

  test("an oversized query does not crash", async ({ page }) => {
    await signIn(page, fixtures.users["admin-a"]);

    // Well past the 120-character server-side cap.
    await gotoSearch(page, "x".repeat(2000));

    await expect(page.getByRole("heading", { name: "Search", level: 1 })).toBeVisible();
    const headings = await page.getByRole("heading", { level: 1 }).allInnerTexts();
    expect(headings, "an oversized query fell into an error page").toHaveLength(1);
    await expect(page.getByText(/We couldn.t run that search/i)).toHaveCount(0);
  });

  test("wildcard characters match literally rather than everything", async ({ page }) => {
    await signIn(page, fixtures.users["admin-a"]);

    // A bare LIKE wildcard must not behave as "match all rows".
    for (const wildcard of ["%", "_%", "%%", "\\", "__"]) {
      await gotoSearch(page, wildcard);

      const headings = await groupHeadings(page);
      expect(
        headings,
        `wildcard ${JSON.stringify(wildcard)} produced uncontrolled matches: ${JSON.stringify(headings)}`,
      ).toHaveLength(0);
      await expect(page.getByText("No matches").first()).toBeVisible();
    }

    // Positive control: escaping is literal, not a blanket rejection -- a real
    // term still returns rows through the same code path.
    await gotoSearch(page, fixtures.searchTerms.ticket);
    expect(await groupHeadings(page)).toContain("support tickets");
  });

  test("project_manager restrictions match the dialog", async ({ page }) => {
    await signIn(page, fixtures.users["pm-a"]);

    for (const [term, forbidden] of [
      [fixtures.searchTerms.lead, "leads"],
      [fixtures.searchTerms.proposal, "proposals"],
      ["NXF-INV-2026-0003", "invoices"],
    ] as const) {
      await gotoSearch(page, term);
      expect(
        await groupHeadings(page),
        `PM must not receive a ${forbidden} group from the fallback route`,
      ).not.toContain(forbidden);
    }

    // They do reach the project they manage, and only that one.
    await gotoSearch(page, fixtures.searchTerms.project);
    const managed = page.locator(
      `a[href="/admin/projects/${fixtures.projects.managedByPm}"]`,
    );
    const contributorOnly = page.locator(
      `a[href="/admin/projects/${fixtures.projects.pmContributorOnly}"]`,
    );
    await expect(managed).toHaveCount(1);
    await expect(
      contributorOnly,
      "a contributor-only project must not appear in a PM's search",
    ).toHaveCount(0);
  });

  test("team_member restrictions match the dialog", async ({ page }) => {
    await signIn(page, fixtures.users["team-a"]);

    for (const [term, forbidden] of [
      [fixtures.searchTerms.lead, "leads"],
      [fixtures.searchTerms.client, "clients"],
      [fixtures.searchTerms.proposal, "proposals"],
      ["NXF-INV-2026-0003", "invoices"],
    ] as const) {
      await gotoSearch(page, term);
      expect(
        await groupHeadings(page),
        `team_member must not receive a ${forbidden} group`,
      ).not.toContain(forbidden);
    }

    // Their own assigned ticket is reachable; a colleague's is not.
    await gotoSearch(page, fixtures.searchTerms.ticket);
    await expect(
      page.locator(`a[href="/admin/support/${fixtures.tickets.assignedToTeamMember}"]`),
    ).toHaveCount(1);
    await expect(
      page.locator(`a[href="/admin/support/${fixtures.tickets.assignedToAdmin}"]`),
    ).toHaveCount(0);
  });

  test("a portal user cannot reach the admin fallback route", async ({ page }) => {
    await page.goto("/auth/login");
    await page.getByLabel("Email address").fill(fixtures.users["portal-owner-a"].email);
    await page.getByLabel("Password").fill(fixtures.users["portal-owner-a"].password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await page.goto(`/admin/search?q=${encodeURIComponent(fixtures.searchTerms.client)}`);

    await expect(page).not.toHaveURL(/\/admin\/search/);
    await expect(page.getByRole("heading", { name: "Search", level: 1 })).toHaveCount(0);
    // No fragment of a result may render before the redirect settles.
    await expect(
      page.locator('section[aria-labelledby^="search-group-"]'),
    ).toHaveCount(0);
  });

  test("cross-tenant rows never appear in the fallback route", async ({ page }) => {
    await signIn(page, fixtures.users["admin-a"]);
    await gotoSearch(page, fixtures.searchTerms.crossTenant);

    expect(await groupHeadings(page)).toHaveLength(0);
    await expect(page.getByText("No matches").first()).toBeVisible();
    await expect(
      page.locator(`a[href="/admin/clients/${fixtures.clients.orgB}"]`),
    ).toHaveCount(0);

    // Positive control: the row genuinely exists for its own tenant, so the
    // absence above is isolation rather than missing fixture data.
    await signOut(page);
    await signIn(page, fixtures.users["admin-b"]);
    await gotoSearch(page, fixtures.searchTerms.crossTenant);
    expect(await groupHeadings(page)).toContain("clients");
  });
});

test.describe("Admin search route addressability and safety", () => {
  // These three replaced an earlier "Admin search without JavaScript" block.
  //
  // That block asserted a PRODUCT REQUIREMENT THAT HAS SINCE BEEN WITHDRAWN:
  // that /admin/search renders with scripting disabled. Browser verification
  // showed it cannot, because Next.js parks streamed Suspense content in a
  // <template> and relocates it with an inline script -- a consequence of the
  // App Router loading.tsx boundaries the admin shell has used since Phase 2,
  // not of anything in Phase 12. Removing those boundaries would change
  // loading behaviour across every Phase 2-11 admin surface, so they stay.
  //
  // The authenticated admin application therefore requires JavaScript. What
  // remains genuinely required of the route -- and is asserted below -- is
  // that it is directly addressable, bookmarkable and refreshable, that its
  // state lives in the URL rather than in client memory, that hostile input
  // degrades safely, and that nothing unauthorized is ever sent to the
  // browser. Those are the properties that make it a usable fallback target
  // for the dialog.

  test.beforeEach(async ({ page }) => {
    await signIn(page, fixtures.users["admin-a"]);
  });

  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

  test("the route is URL-addressable, bookmarkable and refreshable", async ({ page }) => {
    // Results arrive in a streamed chunk, so every group read below waits for
    // the group itself first. Asserting only on the URL or the page heading
    // would race the skeleton and read an empty list.
    const awaitGroup = (name: string) =>
      expect(page.getByRole("heading", { level: 3, name })).toBeVisible();

    // Reached by URL alone -- never by opening the dialog first.
    await gotoSearch(page, fixtures.searchTerms.ticket);
    await awaitGroup("Support tickets");
    expect(await groupHeadings(page)).toContain("support tickets");

    // The query is rendered back from the URL into the control, so the view
    // is shareable: someone opening this link sees the same thing.
    await expect(page.getByLabel("Search term", { exact: true })).toHaveValue(
      fixtures.searchTerms.ticket,
    );

    // A refresh re-runs the same search rather than dropping to an idle page.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Search", exact: true })).toBeVisible();
    await expect(page.getByLabel("Search term", { exact: true })).toHaveValue(
      fixtures.searchTerms.ticket,
    );
    await awaitGroup("Support tickets");
    expect(await groupHeadings(page)).toContain("support tickets");
    await expect(
      page.locator(`a[href="/admin/support/${fixtures.tickets.assignedToTeamMember}"]`),
    ).toHaveCount(1);

    // Editing the URL alone changes the results, proving the state is held in
    // the URL and not in client memory carried over from the previous view.
    await gotoSearch(page, fixtures.searchTerms.project);
    await awaitGroup("Projects");
    const projectGroups = await groupHeadings(page);
    expect(projectGroups).toContain("projects");
    expect(projectGroups).not.toContain("support tickets");

    // Submitting the form is a plain GET, so it produces a linkable URL too.
    // `exact` matters: the topbar trigger's accessible name also begins
    // "Search" ("Search Ctrl K Search the workspace").
    await page.getByLabel("Search term", { exact: true }).fill(fixtures.searchTerms.client);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page).toHaveURL(
      new RegExp(`[?&]q=${encodeURIComponent(fixtures.searchTerms.client)}`),
    );
    await awaitGroup("Clients");
    expect(await groupHeadings(page)).toContain("clients");
  });

  test("malformed queries degrade safely and never leak database text", async ({ page }) => {
    // Ordinary malformed input: must reach a NORMAL state (results, empty or
    // idle) -- never the error state, and never an unhandled crash.
    const ordinary = [
      "?q[]=abc",
      `?q=${encodeURIComponent(fixtures.searchTerms.ticket)}&q=zzzznomatchzzzz`,
      "?q=%",
      `?q=${encodeURIComponent("'; drop table leads; --")}`,
      `?q=${encodeURIComponent("\\_%")}`,
      `?q=${encodeURIComponent("<script>alert(1)</script>")}`,
      `?q=${"x".repeat(3000)}`,
      "?q=",
    ];

    // A NUL byte is not representable as PostgreSQL `text`, so the RPC call
    // itself cannot succeed. The requirement is safe DEGRADATION, not success:
    // it must land in the designed error state with a plain-language message
    // and no database detail -- which is exactly the `error` arm of the
    // four-state union. It is listed separately so the distinction is
    // deliberate and visible rather than absorbed by a loose assertion.
    const unencodable = ["?q=%00%01%02"];

    const leaks = [
      "p0001",
      "42501",
      "sqlstate",
      "pg_",
      "search_path",
      "select ",
      "relation ",
      "syntax error",
      "postgres",
      "stack",
    ];

    async function assertSafe(query: string) {
      // The page is still the search surface and is still usable -- not an
      // error boundary, not a blank shell.
      await expect(
        page.getByLabel("Search term", { exact: true }),
        `${query} lost the search form`,
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Search", exact: true })).toBeEnabled();

      const body = (await page.locator("body").innerText()).toLowerCase();
      for (const leak of leaks) {
        expect(body, `${query} leaked "${leak}"`).not.toContain(leak);
      }
    }

    for (const query of ordinary) {
      await page.goto(`/admin/search${query}`);
      await expect(page.getByRole("heading", { name: "Search", exact: true })).toBeVisible();

      await expect(
        page.getByText(/We couldn.t run that search/i),
        `${query} should not reach the error state`,
      ).toHaveCount(0);
      await assertSafe(query);
    }

    for (const query of unencodable) {
      await page.goto(`/admin/search${query}`);

      // The designed error state, stated in plain language.
      await expect(page.getByText(/We couldn.t run that search/i)).toBeVisible();
      await expect(page.getByText(/Nothing was changed/i)).toBeVisible();
      await assertSafe(query);
    }
  });

  test("no unauthorized row is ever sent to the browser for this route", async ({ page }) => {
    // Asserting on the RESPONSE BYTES, not on the rendered DOM: a row that is
    // streamed and then hidden would still be a leak, and a DOM-only check
    // would never notice it.
    const restricted = await page.context().request.get(
      `/admin/search?q=${encodeURIComponent(fixtures.searchTerms.lead)}`,
      { maxRedirects: 0 },
    );
    const adminBody = await restricted.text();
    // Positive control. The ROW TITLE is the marker, not the bare search term:
    // the term alone is echoed back into the input's value on every response,
    // so matching it would prove nothing about what rows were returned.
    expect(adminBody).toContain(`${fixtures.searchTerms.lead} Primary`);

    // A team member may not see leads at all.
    await signOut(page);
    await signIn(page, fixtures.users["team-a"]);
    const teamResponse = await page.context().request.get(
      `/admin/search?q=${encodeURIComponent(fixtures.searchTerms.lead)}`,
      { maxRedirects: 0 },
    );
    const teamBody = await teamResponse.text();
    expect(
      teamBody,
      "a team member's response carried a lead they may not see",
    ).not.toContain(`${fixtures.searchTerms.lead} Primary`);

    // Cross-tenant: Org A must never receive Org B's row.
    await signOut(page);
    await signIn(page, fixtures.users["admin-a"]);
    const crossResponse = await page.context().request.get(
      `/admin/search?q=${encodeURIComponent(fixtures.searchTerms.crossTenant)}`,
      { maxRedirects: 0 },
    );
    const crossBody = await crossResponse.text();
    expect(crossBody, "Org A's response carried an Org B row").not.toContain(
      "OrgB Client",
    );
    expect(crossBody).not.toContain("OrgB Lead");

    // A portal user's request never yields search markup at all -- so there
    // is nothing that could flash before the redirect settles.
    await signOut(page);
    await page.goto("/auth/login");
    await page.getByLabel("Email address").fill(fixtures.users["portal-owner-a"].email);
    await page.getByLabel("Password").fill(fixtures.users["portal-owner-a"].password);
    await page.getByRole("button", { name: "Sign in" }).click();

    const portalResponse = await page.context().request.get(
      `/admin/search?q=${encodeURIComponent(fixtures.searchTerms.client)}`,
      { maxRedirects: 0 },
    );
    const portalBody = await portalResponse.text();
    expect(portalBody).not.toContain('aria-labelledby="search-group-');
    expect(portalBody).not.toContain(fixtures.searchTerms.client);
  });
});
