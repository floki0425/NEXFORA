import { NextResponse, type NextRequest } from "next/server";

import { publicEnv } from "@/config/env.public";
import {
  isValidAuthCallbackCode,
  isValidAuthCallbackTokenHash,
  isValidRecoveryOtpType,
  sanitizeProviderErrorCode,
} from "@/features/auth/recovery";
import {
  logAuthRecoveryIssue,
  logSupabaseAuthError,
} from "@/lib/auth/diagnostics";
import { setRecoverySessionMarker } from "@/lib/auth/recovery-session";
import { createClient } from "@/lib/supabase/server";

const UPDATE_PASSWORD_PATH = "/auth/update-password";
const RECOVERY_FAILURE_PATH =
  "/auth/forgot-password?error=invalid_reset_link";

function createApplicationUrl(path: string): URL {
  return new URL(path, publicEnv.NEXT_PUBLIC_APP_URL);
}

function recoveryFailure(): NextResponse {
  return NextResponse.redirect(createApplicationUrl(RECOVERY_FAILURE_PATH));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const otpType = searchParams.get("type");

  const hasValidTokenHash =
    isValidAuthCallbackTokenHash(tokenHash) && isValidRecoveryOtpType(otpType);

  if (!isValidAuthCallbackCode(code) && !hasValidTokenHash) {
    // Supabase rejects a link in one of two shapes. The PKCE shape puts
    // `error`/`error_code` in the query string, which is readable here. The
    // implicit shape puts them in the URL *fragment*, which browsers never
    // send to the server — so an expired or already-consumed link arrives
    // with no parameters at all and is indistinguishable from a hand-typed
    // URL. Both end on the same user-facing failure page; only the log
    // tells them apart.
    const providerErrorCode = sanitizeProviderErrorCode(
      searchParams.get("error_code") ?? searchParams.get("error"),
    );

    if (providerErrorCode) {
      logAuthRecoveryIssue(
        `callback (provider error_code=${providerErrorCode})`,
        "provider_reported_error",
      );
    } else {
      logAuthRecoveryIssue(
        "callback (no query parameters; check the URL fragment for #error=...)",
        "missing_callback_parameters",
      );
    }

    return recoveryFailure();
  }

  try {
    const supabase = await createClient();

    const { data, error } = isValidAuthCallbackCode(code)
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({
          type: "recovery",
          token_hash: tokenHash as string,
        });

    if (error || !data.user) {
      logSupabaseAuthError(
        isValidAuthCallbackCode(code)
          ? "password recovery code exchange"
          : "password recovery token verification",
        error,
      );
      logAuthRecoveryIssue(
        isValidAuthCallbackCode(code) ? "callback (code)" : "callback (token_hash)",
        error ? "verification_rejected" : "verification_returned_no_user",
      );

      return recoveryFailure();
    }

    await setRecoverySessionMarker(data.user.id);

    // Password recovery must only ever continue to the update-password
    // page. Any `next` value is ignored here so a verified recovery
    // session can never be redirected into /admin, /portal, or another
    // internal route.
    return NextResponse.redirect(createApplicationUrl(UPDATE_PASSWORD_PATH));
  } catch (error) {
    logSupabaseAuthError("password recovery callback", error);
    logAuthRecoveryIssue("callback (unexpected)", "verification_rejected");

    return recoveryFailure();
  }
}
