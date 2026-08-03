import {
  getPhase11E2EConfig,
  getPhase11E2ESkipReason,
} from "../tests/phase11/helpers/test-env.mjs";
import { startE2EServer } from "./lib/e2e-server.mjs";

startE2EServer({
  config: getPhase11E2EConfig(),
  skipReason: getPhase11E2ESkipReason(),
  label: "Phase 11 E2E",
});
