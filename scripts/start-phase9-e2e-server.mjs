import {
  getPhase9E2EConfig,
  getPhase9E2ESkipReason,
} from "../tests/phase9/helpers/test-env.mjs";
import { startE2EServer } from "./lib/e2e-server.mjs";

startE2EServer({
  config: getPhase9E2EConfig(),
  skipReason: getPhase9E2ESkipReason(),
  label: "Phase 9 E2E",
});
