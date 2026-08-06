import { expect, test } from "@playwright/test";

import { readPhase12Fixtures, signIn, signOut, type Phase12Fixtures } from "./helpers";
import { getPhase12E2EConfig, getPhase12E2ESkipReason } from "../helpers/test-env.mjs";

const config = getPhase12E2EConfig();
test.skip(!config, getPhase12E2ESkipReason());

let fixtures: Phase12Fixtures;

test.beforeAll(() => {
  fixtures = readPhase12Fixtures();
});

const dialog = "[role=dialog]";

test.describe("Global search dialog keyboard and focus", () => {
  test.beforeEach(async ({ page }) => {
    fixtures = readPhase12Fixtures();
    await signIn(page, fixtures.users["admin-a"]);
  });

  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

  test("Ctrl+K opens the dialog and moves focus into it", async ({ page }) => {
    await page.keyboard.press("Control+k");

    await expect(page.locator(dialog)).toBeVisible();
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(focused).toBe("INPUT");
  });

  test("Meta+K also opens the dialog", async ({ page }) => {
    await page.keyboard.press("Meta+k");
    await expect(page.locator(dialog)).toBeVisible();
  });

  test("the shortcut is ignored while typing in a field", async ({ page }) => {
    // The reports filter bar gives a real text input on an admin page.
    await page.goto("/admin/search");
    const input = page.getByRole("searchbox", { name: /search term/i });
    await input.click();
    await input.type("ab");

    await page.keyboard.press("Control+k");
    await expect(page.locator(dialog)).toHaveCount(0);
    await expect(input).toHaveValue("ab");
  });

  test("clicking the trigger opens it; Escape closes and restores focus", async ({ page }) => {
    const trigger = page.getByRole("button", { name: /search the workspace/i });
    await trigger.click();
    await expect(page.locator(dialog)).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator(dialog)).toHaveCount(0);

    const focusedLabel = await page.evaluate(
      () => document.activeElement?.getAttribute("aria-haspopup"),
    );
    expect(focusedLabel).toBe("dialog");
  });

  test("minimum-length guidance shows before two characters", async ({ page }) => {
    await page.keyboard.press("Control+k");
    await page.keyboard.type("a");

    await expect(page.getByText(/type at least 2 characters/i)).toBeVisible();
  });

  test("a two-character query is accepted and results group by entity", async ({ page }) => {
    await page.keyboard.press("Control+k");
    await page.keyboard.type(fixtures.searchTerms.ticket);

    const group = page.locator(dialog).getByRole("heading", { name: "Support tickets" });
    await expect(group).toBeVisible({ timeout: 20_000 });

    // A group the role has no rows for is not rendered as an empty heading.
    await expect(page.locator(dialog).getByRole("heading", { name: "Invoices" })).toHaveCount(0);
  });

  test("arrow keys move the selection and Enter opens the highlighted result", async ({ page }) => {
    await page.keyboard.press("Control+k");
    await page.keyboard.type(fixtures.searchTerms.project);

    await expect(
      page.locator(dialog).getByRole("heading", { name: "Projects" }),
    ).toBeVisible({ timeout: 20_000 });

    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/admin\/projects\/[0-9a-f-]{36}/);
    await expect(page.locator(dialog)).toHaveCount(0);
  });

  test("a zero-result query shows the empty state, not an error", async ({ page }) => {
    await page.keyboard.press("Control+k");
    await page.keyboard.type("zzzznomatchzzzz");

    await expect(page.locator(dialog).getByText(/no matches for/i)).toBeVisible({
      timeout: 20_000,
    });
  });

  test("Tab stays within the dialog", async ({ page }) => {
    await page.keyboard.press("Control+k");
    await expect(page.locator(dialog)).toBeVisible();

    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press("Tab");
    }

    const insideDialog = await page.evaluate(() => {
      const active = document.activeElement;
      return Boolean(active?.closest("[role=dialog]"));
    });
    expect(insideDialog).toBe(true);
  });

  test("the dialog exposes an accessible name and a live result count", async ({ page }) => {
    await page.keyboard.press("Control+k");

    const panel = page.locator(dialog);
    await expect(panel).toHaveAttribute("aria-modal", "true");
    await expect(panel.getByRole("listbox", { name: /search results/i })).toBeAttached();
    await expect(panel.locator("[aria-live=polite]")).toBeAttached();
  });

  test("the shortcut is ignored while a select has focus", async ({ page }) => {
    // A real <select> on an admin page, not a synthetic one.
    await page.goto("/admin/reports/lead-conversion");
    const preset = page.getByLabel("Date range", { exact: true });
    await expect(preset).toBeVisible();
    await preset.focus();

    // Assert focus has actually landed BEFORE sending the keystroke.
    // Without this the test races hydration: React can re-render and drop
    // focus back to <body>, and the shortcut then fires legitimately --
    // proving nothing about the select.
    await expect(preset).toBeFocused();

    await page.keyboard.press("Control+k");
    await expect(page.locator(dialog)).toHaveCount(0);
    await expect(preset).toBeFocused();
  });

  test("the shortcut is ignored while a textarea has focus", async ({ page }) => {
    // A real <textarea> on an admin page.
    await page.goto("/admin/leads/new");
    const notes = page.locator("textarea#problemSummary");
    await expect(notes).toBeVisible();
    await notes.click();
    await notes.fill("ab");
    await expect(notes).toBeFocused();

    await page.keyboard.press("Control+k");
    await expect(page.locator(dialog)).toHaveCount(0);
    await expect(notes).toHaveValue("ab");
    await expect(notes).toBeFocused();
  });

  test("the shortcut is ignored while a contenteditable has focus", async ({ page }) => {
    // No admin surface renders a contenteditable, but isTypingTarget()
    // explicitly handles one, so the branch is exercised against a real
    // focused contenteditable element rather than left unproven.
    await page.evaluate(() => {
      const editor = document.createElement("div");
      editor.id = "e2e-contenteditable";
      editor.setAttribute("contenteditable", "true");
      editor.textContent = "note";
      document.body.appendChild(editor);
      editor.focus();
    });

    const isEditableFocused = await page.evaluate(
      () => document.activeElement?.id === "e2e-contenteditable",
    );
    expect(isEditableFocused).toBe(true);

    await page.keyboard.press("Control+k");
    await expect(page.locator(dialog)).toHaveCount(0);
  });

  test("Shift+Tab also stays within the dialog", async ({ page }) => {
    await page.keyboard.press("Control+k");
    await expect(page.locator(dialog)).toBeVisible();

    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press("Shift+Tab");
    }

    const insideDialog = await page.evaluate(() =>
      Boolean(document.activeElement?.closest("[role=dialog]")),
    );
    expect(insideDialog).toBe(true);
  });

  test("ArrowDown and ArrowUp move the selected option", async ({ page }) => {
    await page.keyboard.press("Control+k");
    await page.keyboard.type(fixtures.searchTerms.ticket);

    const options = page.locator(dialog).getByRole("option");
    await expect(options.first()).toBeVisible({ timeout: 20_000 });
    const total = await options.count();
    expect(total, "need at least two results to move a selection").toBeGreaterThan(1);

    // Exactly one option carries the selection at all times.
    const selected = page.locator(`${dialog} [role=option][aria-selected="true"]`);
    await expect(selected).toHaveCount(1);
    await expect(options.nth(0)).toHaveAttribute("aria-selected", "true");

    await page.keyboard.press("ArrowDown");
    await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(options.nth(0)).toHaveAttribute("aria-selected", "false");
    await expect(selected).toHaveCount(1);

    await page.keyboard.press("ArrowUp");
    await expect(options.nth(0)).toHaveAttribute("aria-selected", "true");
    await expect(selected).toHaveCount(1);

    // ArrowUp from the first option wraps to the last rather than sticking.
    await page.keyboard.press("ArrowUp");
    await expect(options.nth(total - 1)).toHaveAttribute("aria-selected", "true");
  });

  test("the live region announces the actual result count", async ({ page }) => {
    await page.keyboard.press("Control+k");
    await page.keyboard.type(fixtures.searchTerms.ticket);

    const panel = page.locator(dialog);
    await expect(panel.getByRole("option").first()).toBeVisible({ timeout: 20_000 });

    const optionCount = await panel.getByRole("option").count();
    const announced = (await panel.locator("[aria-live=polite]").innerText()).trim();

    expect(announced).toMatch(/^\d+ results?$/);
    expect(
      announced,
      `live region said "${announced}" but ${optionCount} options rendered`,
    ).toBe(`${optionCount} result${optionCount === 1 ? "" : "s"}`);
  });

  test("a slow search shows the loading state", async ({ page }) => {
    // Delay only the server action, so the dialog's pending state is
    // observable without changing what it eventually returns.
    await page.route("**/*", async (route) => {
      const request = route.request();
      if (request.method() === "POST" && request.headers()["next-action"]) {
        await new Promise((resolve) => setTimeout(resolve, 3_000));
      }
      await route.continue();
    });

    try {
      await page.keyboard.press("Control+k");
      await page.keyboard.type(fixtures.searchTerms.ticket);

      // The spinner is aria-hidden decoration, so it is addressed by class.
      await expect(page.locator(`${dialog} .animate-spin`)).toBeVisible({
        timeout: 10_000,
      });

      // ...and it clears once the response lands.
      await expect(
        page.locator(dialog).getByRole("heading", { name: "Support tickets" }),
      ).toBeVisible({ timeout: 25_000 });
      await expect(page.locator(`${dialog} .animate-spin`)).toHaveCount(0);
    } finally {
      await page.unroute("**/*");
    }
  });

  test("a failed search shows the error state, keeps the query, and retries", async ({ page }) => {
    let failNextSearch = true;

    await page.route("**/*", async (route) => {
      const request = route.request();
      if (
        failNextSearch &&
        request.method() === "POST" &&
        request.headers()["next-action"]
      ) {
        await route.abort("failed");
        return;
      }
      await route.continue();
    });

    try {
      await page.keyboard.press("Control+k");
      await page.keyboard.type(fixtures.searchTerms.ticket);

      const panel = page.locator(dialog);
      await expect(panel.getByText(/We couldn.t run that search/i)).toBeVisible({
        timeout: 20_000,
      });

      // The failure never surfaces database text, and never replaces the route.
      const body = (await page.locator("body").innerText()).toLowerCase();
      for (const leak of ["p0001", "42501", "sqlstate", "search_path", "fetch failed"]) {
        expect(body, `error state leaked "${leak}"`).not.toContain(leak);
      }
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      // The typed query is preserved, so retrying costs the user nothing.
      await expect(panel.getByRole("searchbox")).toHaveValue(fixtures.searchTerms.ticket);

      // Retry succeeds and returns the same results the query always had.
      failNextSearch = false;
      await panel.getByRole("button", { name: "Try again" }).click();
      await expect(panel.getByRole("heading", { name: "Support tickets" })).toBeVisible({
        timeout: 25_000,
      });
      await expect(panel.getByRole("searchbox")).toHaveValue(fixtures.searchTerms.ticket);
    } finally {
      await page.unroute("**/*");
    }
  });
});
