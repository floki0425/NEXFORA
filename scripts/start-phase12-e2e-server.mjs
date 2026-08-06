import {
  getPhase12E2EConfig,
  getPhase12E2ESkipReason,
} from "../tests/phase12/helpers/test-env.mjs";
import { assertTestProjectRef } from "../tests/phase12/helpers/test-env.mjs";
import { startE2EServer } from "./lib/e2e-server.mjs";

// Refuse to build or serve unless TEST_SUPABASE_URL genuinely points at the
// dedicated TEST project. The shared helper validates key shapes and the app
// URL; this adds the project-identity guard so an E2E server can never be
// brought up against DEV.
assertTestProjectRef();

startE2EServer({
  config: getPhase12E2EConfig(),
  skipReason: getPhase12E2ESkipReason(),
  label: "Phase 12 E2E",
});
