import { readFileSync } from "node:fs";
import path from "node:path";

export interface Phase11E2EFixtureIds {
  organizationId: string;
  clientId: string;
}

const FIXTURE_IDS_PATH = path.join(
  process.cwd(),
  "tests/phase11/e2e/.e2e-fixture-ids.json",
);

/**
 * Reads the fixture ids written by global-setup.ts. Mirrors
 * tests/phase8/e2e/fixture-ids.ts exactly.
 */
export function readPhase11FixtureIds(): Phase11E2EFixtureIds {
  const raw = readFileSync(FIXTURE_IDS_PATH, "utf8");
  return JSON.parse(raw);
}
