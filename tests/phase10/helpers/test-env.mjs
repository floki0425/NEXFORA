// Phase 10 deliberately reuses the fixed Phase 8 E2E identities and their
// existing organization/client memberships. Its global setup calls Phase 8's
// idempotent setup instead of adding a second membership, so the auth helpers'
// single-active-membership fail-closed rule remains intact. The suites run
// sequentially and Phase 10 owns only support/subscription fixture rows.
import {
  getPhase8E2EConfig,
  getPhase8E2ESkipReason,
} from "../../phase8/helpers/test-env.mjs";

export function getPhase10E2EConfig() {
  return getPhase8E2EConfig();
}

export function getPhase10E2ESkipReason() {
  return getPhase8E2ESkipReason().replaceAll("Phase 8", "Phase 10");
}
