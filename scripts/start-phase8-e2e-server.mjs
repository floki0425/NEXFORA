import {
  getPhase8E2EConfig,
  getPhase8E2ESkipReason,
} from "../tests/phase8/helpers/test-env.mjs";
import { startE2EServer } from "./lib/e2e-server.mjs";

startE2EServer({
  config: getPhase8E2EConfig(),
  skipReason: getPhase8E2ESkipReason(),
  label: "Phase 8 E2E",
});
