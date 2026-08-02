import { spawn } from "node:child_process";
import { createRequire } from "node:module";

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

/**
 * Builds and starts an isolated Next.js production server for a Playwright
 * E2E run, with the dedicated
 * TEST Supabase project's values mapped onto the exact variable names the
 * application itself reads (see src/config/env.public.ts and
 * src/config/env.server.ts).
 *
 * Shared by every phase's E2E suite because the mapping is identical for
 * all of them — each phase differs only in which test *users* its specs
 * sign in as, which the specs read directly and the server never needs.
 * Keeping one implementation avoids duplicating security-sensitive
 * environment mapping (in particular: the secret key must only ever reach
 * SUPABASE_SECRET_KEY, never a NEXT_PUBLIC_* name).
 *
 * `config` must expose { url, publishableKey, secretKey, appUrl }, as
 * returned by each phase's own getPhase*E2EConfig().
 */
export function startE2EServer({ config, skipReason, label }) {
  if (!config) {
    fail(
      skipReason
        .replace(`${label} skipped:`, `${label} server cannot start:`)
        .replace(
          " This is a missing-configuration skip, not a passing result.",
          "",
        ),
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
    fail("TEST_APP_URL must use http:// when the E2E server runs locally.");
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
  const distDirLabel = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  // These assignments intentionally replace any app-facing values inherited
  // from the shell. Next.js does not overwrite existing process variables when
  // it subsequently reads .env.local, so both the browser and server clients use
  // the same dedicated test project as the fixtures.
  const serverEnvironment = {
    ...process.env,
    NODE_ENV: "production",
    NEXT_PUBLIC_APP_URL: config.appUrl,
    NEXT_PUBLIC_SUPABASE_URL: config.url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: config.publishableKey,
    SUPABASE_SECRET_KEY: config.secretKey,
    // Next.js permits only one active writer per distDir. A phase-specific
    // path lets E2E build and serve while a developer's normal `.next` server
    // remains active in the same working tree.
    NEXFORA_NEXT_DIST_DIR: `.next/e2e-${distDirLabel}`,
  };

  let isStopping = false;
  let activeChild = null;

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      isStopping = true;
      activeChild?.kill(signal);
    });
  }

  console.log(`Building the ${label} app with test Supabase configuration.`);
  const build = spawn(process.execPath, [nextCliPath, "build"], {
    env: serverEnvironment,
    stdio: "inherit",
  });
  activeChild = build;

  build.once("error", () => {
    fail(`The ${label} Next.js build could not be started.`);
  });

  build.once("exit", (code, signal) => {
    if (isStopping) {
      process.exitCode = 0;
      return;
    }

    if (signal || code !== 0) {
      fail(
        signal
          ? `The ${label} Next.js build stopped unexpectedly (${signal}).`
          : `The ${label} Next.js build failed with exit code ${code}.`,
      );
    }

    console.log(`Starting the ${label} production server.`);
    const nextServer = spawn(
      process.execPath,
      [nextCliPath, "start", "--hostname", hostname, "--port", appUrl.port],
      {
        env: serverEnvironment,
        stdio: "inherit",
      },
    );
    activeChild = nextServer;

    nextServer.once("error", () => {
      fail(`The ${label} Next.js server could not be started.`);
    });

    nextServer.once("exit", (serverCode, serverSignal) => {
      if (serverSignal && !isStopping) {
        console.error(
          `The ${label} server stopped unexpectedly (${serverSignal}).`,
        );
      }

      process.exitCode = serverCode ?? (isStopping ? 0 : 1);
    });
  });
}
