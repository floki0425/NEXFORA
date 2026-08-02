import {
  getPhase10E2EConfig,
  getPhase10E2ESkipReason,
} from "../tests/phase10/helpers/test-env.mjs";
import { startE2EServer } from "./lib/e2e-server.mjs";

startE2EServer({
  config: getPhase10E2EConfig(),
  skipReason: getPhase10E2ESkipReason(),
  label: "Phase 10 E2E",
});
