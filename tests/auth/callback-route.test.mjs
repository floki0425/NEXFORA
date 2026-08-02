// Route-level tests for src/app/auth/callback/route.ts. These execute the
// real exported GET handler rather than re-implementing its predicates, so
// a regression in the route itself (e.g. no longer validating
// `type=recovery`, or forwarding the raw `next`/`type` query values) fails
// here even if the pure helpers in src/features/auth/recovery.ts still
// pass their own unit tests.
//
// The route's dependencies on Supabase, cookies, and env config are
// replaced with in-process doubles via node:test's experimental
// `mock.module()` (run with --experimental-test-module-mocks), resolved
// through tests/support/app-alias-loader.mjs so the "@/*" alias and
// Next.js's extensionless deep imports work under plain `node --test`.
// publicEnv is loaded for real with harmless placeholder values so the
// route's own createApplicationUrl() logic is exercised unmodified.
import assert from "node:assert/strict";
import test, { mock } from "node:test";

process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test_key";

const APP_URL = "http://localhost:3000";
const UPDATE_PASSWORD_URL = `${APP_URL}/auth/update-password`;
const RECOVERY_FAILURE_URL = `${APP_URL}/auth/forgot-password?error=invalid_reset_link`;

let exchangeCodeForSessionImpl = async () => {
  throw new Error("exchangeCodeForSession stub not configured for this test");
};
let verifyOtpImpl = async () => {
  throw new Error("verifyOtp stub not configured for this test");
};
let recoveryMarkerCalls = [];
let authErrorLogCalls = [];

// Registered once at module load. Each test reassigns the *Impl variables
// above instead of re-mocking, since re-importing the already-evaluated
// route module would not rebind its imports to a new mock.module() call.
mock.module("@/lib/supabase/server", {
  namedExports: {
    createClient: async () => ({
      auth: {
        exchangeCodeForSession: (...args) => exchangeCodeForSessionImpl(...args),
        verifyOtp: (...args) => verifyOtpImpl(...args),
      },
    }),
  },
});

mock.module("@/lib/auth/recovery-session", {
  namedExports: {
    setRecoverySessionMarker: async (userId) => {
      recoveryMarkerCalls.push(userId);
    },
  },
});

mock.module("@/lib/auth/diagnostics", {
  namedExports: {
    logSupabaseAuthError: (...args) => {
      authErrorLogCalls.push(args);
    },
  },
});

const { GET } = await import("../../src/app/auth/callback/route.ts");
const { NextRequest } = await import("next/server");

function buildRequest(query) {
  return new NextRequest(`${APP_URL}/auth/callback${query}`);
}

function primeMocks({ exchangeCodeForSession, verifyOtp } = {}) {
  exchangeCodeForSessionImpl = mock.fn(
    exchangeCodeForSession ??
      (async () => {
        throw new Error("exchangeCodeForSession should not have been called");
      }),
  );
  verifyOtpImpl = mock.fn(
    verifyOtp ??
      (async () => {
        throw new Error("verifyOtp should not have been called");
      }),
  );
  recoveryMarkerCalls = [];
  authErrorLogCalls = [];
}

function successResult(userId) {
  return { data: { user: { id: userId } }, error: null };
}

test("token_hash + type=signup redirects to the failure path without verifying anything", async () => {
  primeMocks();

  const response = await GET(
    buildRequest("?token_hash=some-signup-token&type=signup"),
  );

  assert.equal(response.headers.get("location"), RECOVERY_FAILURE_URL);
  assert.equal(verifyOtpImpl.mock.calls.length, 0);
  assert.equal(exchangeCodeForSessionImpl.mock.calls.length, 0);
  assert.deepEqual(recoveryMarkerCalls, []);
});

test("token_hash + type=recovery calls verifyOtp with the literal recovery type, not the raw request type, and redirects to update-password", async () => {
  primeMocks({ verifyOtp: async () => successResult("user-recovery-1") });

  const response = await GET(
    buildRequest("?token_hash=abc123&type=recovery"),
  );

  assert.equal(response.headers.get("location"), UPDATE_PASSWORD_URL);
  assert.equal(verifyOtpImpl.mock.calls.length, 1);
  assert.deepEqual(verifyOtpImpl.mock.calls[0].arguments[0], {
    type: "recovery",
    token_hash: "abc123",
  });
  assert.equal(exchangeCodeForSessionImpl.mock.calls.length, 0);
});

test("a valid PKCE code uses exchangeCodeForSession and redirects to update-password", async () => {
  primeMocks({
    exchangeCodeForSession: async () => successResult("user-pkce-1"),
  });

  const response = await GET(buildRequest("?code=pkce-auth-code-1"));

  assert.equal(response.headers.get("location"), UPDATE_PASSWORD_URL);
  assert.equal(exchangeCodeForSessionImpl.mock.calls.length, 1);
  assert.equal(exchangeCodeForSessionImpl.mock.calls[0].arguments[0], "pkce-auth-code-1");
  assert.equal(verifyOtpImpl.mock.calls.length, 0);
});

test("a code takes precedence when both a code and a token_hash are supplied", async () => {
  primeMocks({
    exchangeCodeForSession: async () => successResult("user-precedence-1"),
  });

  const response = await GET(
    buildRequest("?code=pkce-auth-code-2&token_hash=abc123&type=recovery"),
  );

  assert.equal(response.headers.get("location"), UPDATE_PASSWORD_URL);
  assert.equal(exchangeCodeForSessionImpl.mock.calls.length, 1);
  assert.equal(verifyOtpImpl.mock.calls.length, 0);
});

test("a successful verification with a valid data.user creates the recovery marker for that exact user id", async () => {
  primeMocks({ verifyOtp: async () => successResult("11111111-1111-4111-8111-111111111111") });

  await GET(buildRequest("?token_hash=abc123&type=recovery"));

  assert.deepEqual(recoveryMarkerCalls, ["11111111-1111-4111-8111-111111111111"]);
});

test("a successful-looking response without data.user fails safely and never creates a marker", async () => {
  primeMocks({ verifyOtp: async () => ({ data: {}, error: null }) });

  const response = await GET(buildRequest("?token_hash=abc123&type=recovery"));

  assert.equal(response.headers.get("location"), RECOVERY_FAILURE_URL);
  assert.deepEqual(recoveryMarkerCalls, []);
});

test("a provider error redirects safely, never creates a marker, and never exposes the raw error", async () => {
  const sensitiveMessage = "otp_expired: token for user 42 has expired";
  primeMocks({
    verifyOtp: async () => ({
      data: { user: null },
      error: { message: sensitiveMessage, status: 400, code: "otp_expired" },
    }),
  });

  const response = await GET(buildRequest("?token_hash=abc123&type=recovery"));
  const bodyText = await response.text();

  assert.equal(response.headers.get("location"), RECOVERY_FAILURE_URL);
  assert.deepEqual(recoveryMarkerCalls, []);
  assert.equal(response.headers.get("location").includes(sensitiveMessage), false);
  assert.equal(response.headers.get("location").includes("otp_expired"), false);
  assert.equal(bodyText.includes(sensitiveMessage), false);
  // The provider error is still available to the server-side diagnostics
  // channel (src/lib/auth/diagnostics.ts), which itself only logs in
  // development and never logs token_hash/code — just not to the client.
  assert.equal(authErrorLogCalls.length, 1);
});

test("a successful recovery always continues only to /auth/update-password, regardless of next", async () => {
  const nextValuesToIgnore = [
    undefined,
    "/admin/clients",
    "/portal",
    "https://attacker.example",
    "//attacker.example",
    "/auth/update-password",
  ];

  for (const nextValue of nextValuesToIgnore) {
    primeMocks({ verifyOtp: async () => successResult("user-next-check") });

    const query =
      nextValue === undefined
        ? "?token_hash=abc123&type=recovery"
        : `?token_hash=abc123&type=recovery&next=${encodeURIComponent(nextValue)}`;

    const response = await GET(buildRequest(query));

    assert.equal(
      response.headers.get("location"),
      UPDATE_PASSWORD_URL,
      `next=${String(nextValue)} must not change the recovery destination`,
    );
  }
});

test("a recovery link verified while a different user's session is already present is bound only to the freshly verified user", async () => {
  // The route never reads any ambient/pre-existing session (it has no
  // access to supabase.auth.getUser()/getSession() in this double — only
  // exchangeCodeForSession/verifyOtp exist here) before creating the
  // marker, so a stale or different signed-in identity cannot leak into
  // the recovery marker or the eventual password update. If a future
  // change made the route consult an ambient session first, this test's
  // fake client would throw a TypeError on the missing method and the
  // assertions below (expecting a clean success) would fail.
  primeMocks({
    verifyOtp: async () => successResult("verified-recovery-owner-999"),
  });

  const response = await GET(buildRequest("?token_hash=abc123&type=recovery"));

  assert.equal(response.headers.get("location"), UPDATE_PASSWORD_URL);
  assert.deepEqual(recoveryMarkerCalls, ["verified-recovery-owner-999"]);
});
