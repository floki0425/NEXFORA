import { readFileSync } from "node:fs";
import path from "node:path";

import type { Page } from "@playwright/test";

// Shared spec helpers. Mirrors tests/phase11/e2e/fixture-ids.ts in spirit:
// read the ids global-setup wrote, and give specs one way to sign in.

export interface FixtureUser {
  email: string;
  password: string;
  profileId: string;
}

export interface Phase12Fixtures {
  runId: string;
  organizations: { a: string; b: string };
  searchTerms: Record<string, string>;
  clients: Record<string, string>;
  projects: Record<string, string>;
  tickets: Record<string, string>;
  leads: Record<string, string>;
  proposals: Record<string, string>;
  invoices: Record<string, string>;
  users: Record<string, FixtureUser>;
}

const FIXTURE_FILE = path.join(
  process.cwd(),
  "tests/phase12/e2e/.e2e-fixture-ids.json",
);

export function readPhase12Fixtures(): Phase12Fixtures {
  return JSON.parse(readFileSync(FIXTURE_FILE, "utf8")) as Phase12Fixtures;
}

/** The deterministic report window the integration factory seeds data into. */
export const WINDOW_FROM = "2026-03-01";
export const WINDOW_TO = "2026-03-31";

/** Appends the seeded window to a report route as a custom range. */
export function reportUrl(route: string, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams({
    preset: "custom",
    from: WINDOW_FROM,
    to: WINDOW_TO,
    ...extra,
  });
  return `${route}?${params.toString()}`;
}

/**
 * Signs in through the real login form. Specs never inject a session or use
 * the service-role client -- the browser must exercise the same auth path a
 * person does, or the authorization assertions prove nothing.
 */
export async function signIn(page: Page, user: FixtureUser): Promise<void> {
  await page.goto("/auth/login");
  await page.getByLabel("Email address").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/admin/);
}

/** Signs out by clearing cookies, so the next signIn starts clean. */
export async function signOut(page: Page): Promise<void> {
  await page.context().clearCookies();
}

/** Horizontal overflow in px at the current viewport. */
export async function assertNoHorizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth - doc.clientWidth;
  });
}

/** Names the widest elements exceeding the viewport, for diagnosis. */
export async function findOverflowingElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const limit = document.documentElement.clientWidth;
    const offenders: string[] = [];

    document.querySelectorAll<HTMLElement>("body *").forEach((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.right > limit + 1 || rect.width > limit + 1) {
        const id = element.id ? `#${element.id}` : "";
        const cls = element.className && typeof element.className === "string"
          ? `.${element.className.split(/\s+/).filter(Boolean).slice(0, 3).join(".")}`
          : "";
        offenders.push(
          `${element.tagName.toLowerCase()}${id}${cls} w=${Math.round(rect.width)} right=${Math.round(rect.right)}`,
        );
      }
    });

    return offenders.slice(0, 6);
  });
}
