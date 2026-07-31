import { readFileSync } from "node:fs";
import path from "node:path";

export interface Phase8E2EFixtureIds {
  organizationId: string;
  clientAId: string;
  clientBId: string;
  projectAId: string;
  projectBId: string;
  clientVisibleFileId: string;
  internalOnlyFileId: string;
  projectARevisionId: string;
  projectAReadyForReviewRevisionId: string;
  projectBFileId: string;
  projectBRevisionId: string;
}

const FIXTURE_IDS_PATH = path.join(
  process.cwd(),
  "tests/phase8/e2e/.e2e-fixture-ids.json",
);

/**
 * Reads the fixture ids written by global-setup.ts. Throws a clear error
 * (rather than a confusing downstream failure) if global setup has not run
 * — which only happens if TEST_APP_URL/TEST_* env vars were missing, in
 * which case playwright.config.ts already skips wiring globalSetup up at
 * all, and every spec's own env guard should already have skipped first.
 */
export function readPhase8FixtureIds(): Phase8E2EFixtureIds {
  const raw = readFileSync(FIXTURE_IDS_PATH, "utf8");
  return JSON.parse(raw);
}
