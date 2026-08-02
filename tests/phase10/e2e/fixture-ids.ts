import { readFileSync } from "node:fs";
import path from "node:path";

export interface Phase10E2EFixtureIds {
  organizationId: string;
  clientAId: string;
  clientBId: string;
  projectAId: string;
  projectBId: string;
  crossClientTicketId: string;
  crossClientSubscriptionId: string;
}

const FIXTURE_IDS_PATH = path.join(
  process.cwd(),
  "tests/phase10/e2e/.e2e-fixture-ids.json",
);

export function readPhase10FixtureIds(): Phase10E2EFixtureIds {
  return JSON.parse(readFileSync(FIXTURE_IDS_PATH, "utf8"));
}
