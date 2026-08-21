import "server-only";

/**
 * Logs only the Supabase Auth fields needed for development diagnostics.
 * Never pass form data, credentials, tokens, or session objects here.
 */
export function logSupabaseAuthError(
  operation: string,
  error: unknown,
): void {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  const errorRecord =
    typeof error === "object" && error !== null
      ? (error as Record<string, unknown>)
      : null;
  const name =
    typeof errorRecord?.name === "string"
      ? errorRecord.name
      : "UnknownAuthError";
  const status =
    typeof errorRecord?.status === "number"
      ? String(errorRecord.status)
      : "unknown";
  const code =
    typeof errorRecord?.code === "string"
      ? errorRecord.code
      : "unknown";
  const message =
    typeof errorRecord?.message === "string"
      ? errorRecord.message.replace(/[\r\n]+/g, " ")
      : "Unknown authentication error.";

  console.error(
    `[auth] ${operation} failed: name=${name} status=${status} code=${code} message=${message}`,
  );
}

/**
 * Logs a coarse reason for a password-recovery dead end.
 *
 * Every recovery failure ends on the same
 * `/auth/forgot-password?error=invalid_reset_link` URL, by design — the
 * user-facing message must not reveal whether a link was wrong, expired,
 * already spent, or simply opened in the wrong browser. That makes the
 * flow undiagnosable from the outside, so each distinct dead end records a
 * fixed reason code here instead.
 *
 * `reason` must be a constant from RECOVERY_FAILURE_REASONS. Never pass a
 * code, token hash, access token, password, email address, user id, or any
 * value taken from the request.
 */
export function logAuthRecoveryIssue(
  stage: string,
  reason: RecoveryFailureReason,
): void {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.error(`[auth] password recovery stopped: stage=${stage} reason=${reason}`);
}

export const RECOVERY_FAILURE_REASONS = [
  // The callback was reached with neither a `code` nor a usable
  // `token_hash`+`type=recovery` pair. Supabase reports a rejected link in
  // the URL *fragment* (`#error=...&error_code=otp_expired`), which is
  // never sent to the server — so an expired, already-consumed, or
  // wrong-flow link arrives here looking simply empty.
  "missing_callback_parameters",
  // Supabase reported the failure in the query string instead (the PKCE
  // error shape). The provider's own error code is logged separately.
  "provider_reported_error",
  // exchangeCodeForSession/verifyOtp rejected the link.
  "verification_rejected",
  // Verification looked successful but returned no user.
  "verification_returned_no_user",
  // The update-password page was reached without a Supabase session. With
  // the PKCE handoff this is what "opened the link in a different browser
  // than the one that requested it" looks like.
  "no_recovery_user_session",
  // A session exists, but not the short-lived server-signed marker the
  // callback issues — the page was reached without passing the callback.
  "no_recovery_marker",
] as const;

export type RecoveryFailureReason =
  (typeof RECOVERY_FAILURE_REASONS)[number];
