import { expect, test, type Page } from "@playwright/test";

import {
  assertNoHorizontalOverflow,
  findOverflowingElements,
  readPhase12Fixtures,
  signIn,
  signOut,
  type Phase12Fixtures,
} from "./helpers";
import { getPhase12E2EConfig, getPhase12E2ESkipReason } from "../helpers/test-env.mjs";

const config = getPhase12E2EConfig();
test.skip(!config, getPhase12E2ESkipReason());

// Phase 12 inserted the Global Search trigger into a topbar that Phase 11
// already owned. These specs exist to prove the insertion did not regress the
// Notification Bell -- nothing here rewrites or reaches into Phase 11 logic,
// it only asserts the bell still behaves as it did before.
//
// Both popovers use role="dialog", so every locator below addresses them by
// ACCESSIBLE NAME. A bare [role=dialog] would match whichever happened to be
// open and would quietly pass while testing the wrong element.

let fixtures: Phase12Fixtures;

test.beforeAll(() => {
  fixtures = readPhase12Fixtures();
});

const searchTrigger = (page: Page) =>
  page.getByRole("button", { name: /search the workspace/i });
const searchDialog = (page: Page) =>
  page.getByRole("dialog", { name: /search the workspace/i });
const bellTrigger = (page: Page) =>
  page.getByRole("button", { name: /^Notifications(,|$)/ });
const bellPanel = (page: Page) => page.getByRole("dialog", { name: "Notifications" });

test.describe("Admin topbar regression", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, fixtures.users["admin-a"]);
  });

  test.afterEach(async ({ page }) => {
    await signOut(page);
  });

  test("the Global Search trigger sits immediately before the Notification Bell", async ({ page }) => {
    await expect(searchTrigger(page)).toBeVisible();
    await expect(bellTrigger(page)).toBeVisible();

    const ordering = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("header button"));
      const search = buttons.find((button) =>
        (button.textContent ?? "").toLowerCase().includes("search the workspace"),
      );
      const bell = buttons.find((button) =>
        (button.getAttribute("aria-label") ?? "").startsWith("Notifications"),
      );
      if (!search || !bell) return { found: false as const };

      // Interactive controls between the two, in document order.
      const between = buttons.filter((button) => {
        const afterSearch =
          search.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING;
        const beforeBell =
          bell.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_PRECEDING;
        return Boolean(afterSearch && beforeBell);
      });

      return {
        found: true as const,
        searchPrecedesBell: Boolean(
          search.compareDocumentPosition(bell) & Node.DOCUMENT_POSITION_FOLLOWING,
        ),
        controlsBetween: between.length,
      };
    });

    expect(ordering.found).toBe(true);
    if (!ordering.found) return;
    expect(ordering.searchPrecedesBell, "search trigger must precede the bell").toBe(true);
    expect(
      ordering.controlsBetween,
      "no interactive control may sit between the search trigger and the bell",
    ).toBe(0);
  });

  test("the Notification Bell still opens and closes", async ({ page }) => {
    await expect(bellPanel(page)).toHaveCount(0);

    await bellTrigger(page).click();
    await expect(bellPanel(page)).toBeVisible();
    await expect(bellTrigger(page)).toHaveAttribute("aria-expanded", "true");
    await expect(bellPanel(page).getByRole("link", { name: "View all" })).toBeVisible();

    await bellTrigger(page).click();
    await expect(bellPanel(page)).toHaveCount(0);
    await expect(bellTrigger(page)).toHaveAttribute("aria-expanded", "false");
  });

  test("the unread badge and the bell's accessible name stay consistent", async ({ page }) => {
    const label = await bellTrigger(page).getAttribute("aria-label");
    expect(label, "the bell must always carry an accessible name").toBeTruthy();

    const badge = page.locator("header button span.bg-error");
    const badgeCount = await badge.count();
    const unreadMatch = label?.match(/,\s*(\d+)\s+unread/);

    if (unreadMatch) {
      // A stated unread count must be shown visually as well.
      expect(badgeCount, `label "${label}" claims unread but no badge rendered`).toBe(1);
      expect((await badge.innerText()).trim()).toBe(unreadMatch[1]);
    } else {
      expect(label).toBe("Notifications");
      expect(badgeCount, `label "${label}" claims none unread but a badge rendered`).toBe(0);
    }
  });

  test("opening and closing Global Search does not break the bell", async ({ page }) => {
    const labelBefore = await bellTrigger(page).getAttribute("aria-label");

    await searchTrigger(page).click();
    await expect(searchDialog(page)).toBeVisible();
    // The bell must not have opened as a side effect.
    await expect(bellPanel(page)).toHaveCount(0);

    await page.keyboard.press("Escape");
    await expect(searchDialog(page)).toHaveCount(0);

    // The bell still works, and its unread state is untouched.
    await expect(bellTrigger(page)).toHaveAttribute("aria-label", labelBefore ?? "");
    await bellTrigger(page).click();
    await expect(bellPanel(page)).toBeVisible();
    await bellTrigger(page).click();
    await expect(bellPanel(page)).toHaveCount(0);
  });

  test("closing the bell does not break Global Search", async ({ page }) => {
    await bellTrigger(page).click();
    await expect(bellPanel(page)).toBeVisible();

    // Dismiss by clicking the trigger again, the documented Phase 11 path.
    await bellTrigger(page).click();
    await expect(bellPanel(page)).toHaveCount(0);

    await searchTrigger(page).click();
    await expect(searchDialog(page)).toBeVisible();

    // And the keyboard path still works after the bell has been used.
    await page.keyboard.press("Escape");
    await expect(searchDialog(page)).toHaveCount(0);
    await page.keyboard.press("Control+k");
    await expect(searchDialog(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(searchDialog(page)).toHaveCount(0);
  });

  test("the two popovers do not fight over Ctrl+K or Escape", async ({ page }) => {
    await bellTrigger(page).click();
    await expect(bellPanel(page)).toBeVisible();

    // Ctrl+K still belongs to search even with the bell open: focus is on a
    // button, not a typing target, so the shortcut is not suppressed.
    await page.keyboard.press("Control+k");
    await expect(searchDialog(page)).toBeVisible();

    // Escape dismisses both -- neither is left stuck open behind the other.
    await page.keyboard.press("Escape");
    await expect(searchDialog(page)).toHaveCount(0);
    await expect(bellPanel(page)).toHaveCount(0);

    // Both remain independently operable afterwards.
    await bellTrigger(page).click();
    await expect(bellPanel(page)).toBeVisible();
    await bellTrigger(page).click();
    await expect(bellPanel(page)).toHaveCount(0);

    await searchTrigger(page).click();
    await expect(searchDialog(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(searchDialog(page)).toHaveCount(0);
  });

  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "tablet", width: 1024, height: 768 },
    { name: "mobile", width: 390, height: 844 },
  ] as const) {
    test(`the topbar stays usable at ${viewport.name} (${viewport.width}x${viewport.height})`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/admin");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      // Both controls remain reachable and named at every width, even where
      // the visible "Search" text and the ⌘K hint are hidden by breakpoint.
      await expect(searchTrigger(page)).toBeVisible();
      await expect(bellTrigger(page)).toBeVisible();

      const overflow = await assertNoHorizontalOverflow(page);
      const offenders = overflow > 1 ? await findOverflowingElements(page) : [];
      expect(
        overflow,
        `topbar page overflows by ${overflow}px at ${viewport.name}; offenders: ${JSON.stringify(offenders)}`,
      ).toBeLessThanOrEqual(1);

      // Both still operate at this width.
      await searchTrigger(page).click();
      await expect(searchDialog(page)).toBeVisible();
      const box = await searchDialog(page).boundingBox();
      expect(box, "the search dialog must have a box").not.toBeNull();
      expect(box!.width).toBeLessThanOrEqual(viewport.width);
      await page.keyboard.press("Escape");
      await expect(searchDialog(page)).toHaveCount(0);

      await bellTrigger(page).click();
      await expect(bellPanel(page)).toBeVisible();
      const bellBox = await bellPanel(page).boundingBox();
      expect(bellBox!.width).toBeLessThanOrEqual(viewport.width);
      await bellTrigger(page).click();
      await expect(bellPanel(page)).toHaveCount(0);
    });
  }

  test("the topbar does not shift materially after hydration", async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __cls: number }).__cls = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & {
            value: number;
            hadRecentInput: boolean;
          };
          if (!shift.hadRecentInput) {
            (window as unknown as { __cls: number }).__cls += shift.value;
          }
        }
      }).observe({ type: "layout-shift", buffered: true });
    });

    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    const early = await searchTrigger(page).boundingBox();

    await page.waitForLoadState("networkidle");
    await expect(searchTrigger(page)).toBeVisible();
    const settled = await searchTrigger(page).boundingBox();

    expect(early, "the trigger must render before hydration").not.toBeNull();
    expect(settled).not.toBeNull();

    // The server-rendered trigger must not jump once React takes over. The
    // shortcut hint is read through useSyncExternalStore precisely so this
    // stays true.
    expect(Math.abs(settled!.x - early!.x), "trigger moved horizontally").toBeLessThanOrEqual(2);
    expect(Math.abs(settled!.y - early!.y), "trigger moved vertically").toBeLessThanOrEqual(2);

    const cls = await page.evaluate(
      () => (window as unknown as { __cls: number }).__cls ?? 0,
    );
    // 0.1 is the "good" Cumulative Layout Shift threshold.
    expect(cls, `cumulative layout shift was ${cls}`).toBeLessThan(0.1);
  });

  test("a team_member keeps a working topbar with no Reports entry", async ({ page }) => {
    await signOut(page);
    await signIn(page, fixtures.users["team-a"]);

    // Phase 12 hid the Reports nav for this role; the topbar must be intact.
    await expect(page.getByRole("link", { name: "Reports", exact: true })).toHaveCount(0);
    await expect(searchTrigger(page)).toBeVisible();
    await expect(bellTrigger(page)).toBeVisible();

    await bellTrigger(page).click();
    await expect(bellPanel(page)).toBeVisible();
    await bellTrigger(page).click();

    await searchTrigger(page).click();
    await expect(searchDialog(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(searchDialog(page)).toHaveCount(0);
  });
});
