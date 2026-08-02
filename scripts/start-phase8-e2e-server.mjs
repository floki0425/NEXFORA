import { spawn } from "node:child_process";
import { createRequire } from "node:module";

import {
  getPhase8E2EConfig,
  getPhase8E2ESkipReason,
} from "../tests/phase8/helpers/test-env.mjs";

const require = createRequire(import.meta.url);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseHttpUrl(variableName, value) {
  let parsed;

  try {
    parsed = new URL(value);
  } catch {
    fail(`${variableName} must be a valid absolute HTTP URL.`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    fail(`${variableName} must use http:// or https://.`);
  }

  return parsed;
}

const config = getPhase8E2EConfig();

if (!config) {
  fail(
    getPhase8E2ESkipReason()
      .replace("Phase 8 E2E skipped:", "Phase 8 E2E server cannot start:")
      .replace(" This is a missing-configuration skip, not a passing result.", ""),
  );
}

parseHttpUrl("TEST_SUPABASE_URL", config.url);

if (!config.publishableKey.startsWith("sb_publishable_")) {
  fail(
    "TEST_SUPABASE_PUBLISHABLE_KEY must contain a Supabase publishable key.",
  );
}

if (!config.secretKey.startsWith("sb_secret_")) {
  fail("TEST_SUPABASE_SECRET_KEY must contain a Supabase secret key.");
}

const appUrl = parseHttpUrl("TEST_APP_URL", config.appUrl);

if (appUrl.protocol !== "http:") {
  fail("TEST_APP_URL must use http:// when the E2E server runs with next dev.");
}

if (
  appUrl.pathname !== "/" ||
  appUrl.search ||
  appUrl.hash ||
  appUrl.username ||
  appUrl.password
) {
  fail("TEST_APP_URL must contain only an origin, without a path or credentials.");
}

if (!appUrl.port) {
  fail("TEST_APP_URL must include the port used by the E2E server.");
}

const hostname = appUrl.hostname.replace(/^\[|\]$/g, "");
const nextCliPath = require.resolve("next/dist/bin/next");

// These assignments intentionally replace any app-facing values inherited
// from the shell. Next.js does not overwrite existing process variables when
// it subsequently reads .env.local, so both the browser and server clients use
// the same dedicated test project as the Phase 8 fixtures.
const serverEnvironment = {
  ...process.env,
  NODE_ENV: "development",
  NEXT_PUBLIC_APP_URL: config.appUrl,
  NEXT_PUBLIC_SUPABASE_URL: config.url,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: config.publishableKey,
  SUPABASE_SECRET_KEY: config.secretKey,
};

console.log("Starting the Phase 8 E2E server with test Supabase configuration.");

const nextServer = spawn(
  process.execPath,
  [nextCliPath, "dev", "--hostname", hostname, "--port", appUrl.port],
  {
    env: serverEnvironment,
    stdio: "inherit",
  },
);

let isStopping = false;

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    isStopping = true;
    nextServer.kill(signal);
  });
}

nextServer.once("error", () => {
  fail("The Phase 8 E2E Next.js server could not be started.");
});

nextServer.once("exit", (code, signal) => {
  if (signal && !isStopping) {
    console.error(`The Phase 8 E2E server stopped unexpectedly (${signal}).`);
  }

  process.exitCode = code ?? (isStopping ? 0 : 1);
});
