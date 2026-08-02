// Focused test for M-3: a successful password-reset submission must sign
// out every session (scope "global"), not just the browser that performed
// the reset — an attacker who is silently signed in elsewhere must be
// signed out too. Ordinary logout (src/features/auth/actions.ts's
// `logout()`) intentionally keeps scope "local" and is unaffected.
//
// This executes the real updatePassword() Server Action from
// src/features/auth/actions.ts, using the same module-mocking approach as
// tests/auth/callback-route.test.mjs (see that file's header comment).
//
// Session revocation here does not instantly invalidate an already-issued
// access token before its own short expiry — see docs/PHASE_1_SETUP.md.
import assert from "node:assert/strict";
import test, { mock } from "node:test";

process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test_key";

let getUserImpl = async () => {
  throw new Error("getUser stub not configured for this test");
};
let updateUserImpl = async () => {
  throw new Error("updateUser stub not configured for this test");
};
let signOutImpl = async () => {
  throw new Error("signOut stub not configured for this test");
};
let hasValidRecoverySessionMarkerImpl = async () => false;
let clearRecoverySessionMarkerCalls = 0;

mock.module("@/lib/supabase/server", {
  namedExports: {
    createClient: async () => ({
      auth: {
        getUser: (...args) => getUserImpl(...args),
        updateUser: (...args) => updateUserImpl(...args),
        signOut: (...args) => signOutImpl(...args),
      },
    }),
  },
});

mock.module("@/lib/auth/recovery-session", {
  namedExports: {
    hasValidRecoverySessionMarker: (...args) =>
      hasValidRecoverySessionMarkerImpl(...args),
    clearRecoverySessionMarker: async () => {
      clearRecoverySessionMarkerCalls += 1;
    },
  },
});

mock.module("@/lib/auth/server", {
  namedExports: {
    getInternalMemberForUser: async () => null,
    requireUser: async () => {
      throw new Error("requireUser should not be called by updatePassword");
    },
  },
});

mock.module("@/lib/auth/diagnostics", {
  namedExports: {
    logSupabaseAuthError: () => {},
  },
});

const { updatePassword } = await import("../../src/features/auth/actions.ts");

function buildValidPasswordFormData() {
  const formData = new FormData();
  formData.set("password", "StrongPassword1!");
  formData.set("passwordConfirmation", "StrongPassword1!");
  return formData;
}

async function callUpdatePassword(formData) {
  try {
    await updatePassword({ status: "idle", message: "" }, formData);
    throw new Error("updatePassword did not redirect as expected");
  } catch (error) {
    if (typeof error?.digest !== "string" || !error.digest.startsWith("NEXT_REDIRECT")) {
      throw error;
    }
    return error.digest;
  }
}

test("a successful password reset requests a global sign-out, not just the local session", async () => {
  getUserImpl = mock.fn(async () => ({
    data: { user: { id: "recovering-user-1" } },
    error: null,
  }));
  updateUserImpl = mock.fn(async () => ({ error: null }));
  signOutImpl = mock.fn(async () => ({ error: null }));
  hasValidRecoverySessionMarkerImpl = async () => true;
  clearRecoverySessionMarkerCalls = 0;

  const digest = await callUpdatePassword(buildValidPasswordFormData());

  assert.equal(signOutImpl.mock.calls.length, 1);
  assert.deepEqual(signOutImpl.mock.calls[0].arguments[0], { scope: "global" });
  assert.equal(digest, "NEXT_REDIRECT;replace;/auth/login?password_updated=true;307;");
  assert.equal(clearRecoverySessionMarkerCalls, 1);
});
