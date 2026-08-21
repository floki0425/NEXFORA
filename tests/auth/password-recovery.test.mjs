import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPasswordRecoveryRedirectUrl,
  forgotPasswordSchema,
  getSafeInternalRedirectPath,
  isValidAuthCallbackCode,
  isValidAuthCallbackTokenHash,
  isValidRecoveryOtpType,
  PASSWORD_RESET_SUCCESS_MESSAGE,
  updatePasswordSchema,
  sanitizeProviderErrorCode,
} from "../../src/features/auth/recovery.ts";

test("accepts and normalizes a valid email address", () => {
  const result = forgotPasswordSchema.safeParse({
    email: "  Owner@Example.com  ",
  });

  assert.equal(result.success, true);

  if (result.success) {
    assert.equal(result.data.email, "owner@example.com");
  }
});

test("accepts an unknown but well-formed email without changing the neutral response", () => {
  const result = forgotPasswordSchema.safeParse({
    email: "unknown-user@example.com",
  });

  assert.equal(result.success, true);
  assert.equal(
    PASSWORD_RESET_SUCCESS_MESSAGE,
    "If an account exists for this email, a reset link has been sent.",
  );
});

test("rejects an invalid email format", () => {
  const result = forgotPasswordSchema.safeParse({
    email: "not-an-email",
  });

  assert.equal(result.success, false);
});

test("uses the same neutral public response for delivery failures", () => {
  assert.equal(
    PASSWORD_RESET_SUCCESS_MESSAGE,
    "If an account exists for this email, a reset link has been sent.",
  );
  assert.equal(
    PASSWORD_RESET_SUCCESS_MESSAGE.includes(
      "over_email_send_rate_limit",
    ),
    false,
  );
  assert.equal(
    PASSWORD_RESET_SUCCESS_MESSAGE.includes(
      "email rate limit exceeded",
    ),
    false,
  );
});

test("builds the required password recovery callback URL", () => {
  assert.equal(
    buildPasswordRecoveryRedirectUrl("http://localhost:3000/"),
    "http://localhost:3000/auth/callback?next=/auth/update-password",
  );
});

test("rejects a missing or malformed callback code", () => {
  assert.equal(isValidAuthCallbackCode(null), false);
  assert.equal(isValidAuthCallbackCode(""), false);
  assert.equal(isValidAuthCallbackCode("bad\ncode"), false);
  assert.equal(isValidAuthCallbackCode("x".repeat(2049)), false);
});

test("accepts a bounded callback code", () => {
  assert.equal(isValidAuthCallbackCode("pkce-auth-code"), true);
});

test("rejects an invalid or missing recovery OTP type", () => {
  assert.equal(isValidRecoveryOtpType(null), false);
  assert.equal(isValidRecoveryOtpType(""), false);
  assert.equal(isValidRecoveryOtpType("signup"), false);
  assert.equal(isValidRecoveryOtpType("invite"), false);
  assert.equal(isValidRecoveryOtpType("magiclink"), false);
  assert.equal(isValidRecoveryOtpType("email_change"), false);
  assert.equal(isValidRecoveryOtpType("recovery "), false);
});

test("accepts the recovery OTP type", () => {
  assert.equal(isValidRecoveryOtpType("recovery"), true);
});

test("rejects a missing or malformed callback token hash", () => {
  assert.equal(isValidAuthCallbackTokenHash(null), false);
  assert.equal(isValidAuthCallbackTokenHash(""), false);
  assert.equal(isValidAuthCallbackTokenHash("bad\nhash"), false);
  assert.equal(isValidAuthCallbackTokenHash("x".repeat(2049)), false);
});

test("accepts a bounded callback token hash", () => {
  assert.equal(
    isValidAuthCallbackTokenHash("pkce_recovery_token_hash"),
    true,
  );
});

test("supports both code and token_hash+type recovery callback params", () => {
  assert.equal(isValidAuthCallbackCode("pkce-auth-code"), true);
  assert.equal(
    isValidAuthCallbackTokenHash("otp-token-hash") &&
      isValidRecoveryOtpType("recovery"),
    true,
  );
});

test("allows only internal redirect destinations", () => {
  assert.equal(
    getSafeInternalRedirectPath(
      "/auth/update-password?source=recovery",
      "/auth/update-password",
    ),
    "/auth/update-password?source=recovery",
  );
  assert.equal(
    getSafeInternalRedirectPath(
      "https://attacker.example",
      "/auth/update-password",
    ),
    "/auth/update-password",
  );
  assert.equal(
    getSafeInternalRedirectPath(
      "//attacker.example",
      "/auth/update-password",
    ),
    "/auth/update-password",
  );
  assert.equal(
    getSafeInternalRedirectPath(
      "/\\attacker.example",
      "/auth/update-password",
    ),
    "/auth/update-password",
  );
});

test("rejects a weak password", () => {
  const result = updatePasswordSchema.safeParse({
    password: "weakpassword",
    passwordConfirmation: "weakpassword",
  });

  assert.equal(result.success, false);
});

test("rejects a password mismatch", () => {
  const result = updatePasswordSchema.safeParse({
    password: "StrongPassword1!",
    passwordConfirmation: "DifferentPassword1!",
  });

  assert.equal(result.success, false);

  if (!result.success) {
    assert.equal(
      result.error.issues.some(
        (issue) =>
          issue.path[0] === "passwordConfirmation" &&
          issue.message === "The passwords do not match.",
      ),
      true,
    );
  }
});

test("accepts a strong matching password", () => {
  const result = updatePasswordSchema.safeParse({
    password: "StrongPassword1!",
    passwordConfirmation: "StrongPassword1!",
  });

  assert.equal(result.success, true);
});


// sanitizeProviderErrorCode feeds a server log line. Supabase supplies the
// value over the network, so it is untrusted input: anything that could
// forge a log line or carry part of a one-time token must be stripped.

test("keeps a well-formed provider error code", () => {
  assert.equal(sanitizeProviderErrorCode("otp_expired"), "otp_expired");
  assert.equal(sanitizeProviderErrorCode("ACCESS_DENIED"), "access_denied");
  assert.equal(sanitizeProviderErrorCode("  flow_state_not_found  "), "flow_state_not_found");
});

test("treats a missing or empty provider error code as absent", () => {
  assert.equal(sanitizeProviderErrorCode(null), null);
  assert.equal(sanitizeProviderErrorCode(""), null);
  assert.equal(sanitizeProviderErrorCode("   "), null);
  assert.equal(sanitizeProviderErrorCode("!!!"), null);
});

test("strips characters that could forge a log line", () => {
  const hostile = ["otp_expired", "reason=spoofed"].join(String.fromCharCode(10));
  const sanitized = sanitizeProviderErrorCode(hostile);

  assert.ok(!sanitized.includes(String.fromCharCode(10)));
  assert.ok(!sanitized.includes(" "));
  assert.ok(!sanitized.includes("="));
  assert.equal(sanitized, "otp_expiredreasonspoofed");
});

test("bounds the provider error code so a long value cannot flood the log", () => {
  assert.equal(sanitizeProviderErrorCode("a".repeat(500)).length, 64);
});
