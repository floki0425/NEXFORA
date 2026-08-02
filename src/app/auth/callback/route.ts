import { NextResponse, type NextRequest } from "next/server";

import { publicEnv } from "@/config/env.public";
import {
  isValidAuthCallbackCode,
  isValidAuthCallbackTokenHash,
  isValidRecoveryOtpType,
} from "@/features/auth/recovery";
import { logSupabaseAuthError } from "@/lib/auth/diagnostics";
import { setRecoverySessionMarker } from "@/lib/auth/recovery-session";
import { createClient } from "@/lib/supabase/server";

const UPDATE_PASSWORD_PATH = "/auth/update-password";
const RECOVERY_FAILURE_PATH =
  "/auth/forgot-password?error=invalid_reset_link";

function createApplicationUrl(path: string): URL {
  return new URL(path, publicEnv.NEXT_PUBLIC_APP_URL);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const otpType = request.nextUrl.searchParams.get("type");

  const hasValidTokenHash =
    isValidAuthCallbackTokenHash(tokenHash) && isValidRecoveryOtpType(otpType);

  if (!isValidAuthCallbackCode(code) && !hasValidTokenHash) {
    return NextResponse.redirect(
      createApplicationUrl(RECOVERY_FAILURE_PATH),
    );
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

      return NextResponse.redirect(
        createApplicationUrl(RECOVERY_FAILURE_PATH),
      );
    }

    await setRecoverySessionMarker(data.user.id);

    // Password recovery must only ever continue to the update-password
    // page. Any `next` value is ignored here so a verified recovery
    // session can never be redirected into /admin, /portal, or another
    // internal route.
    return NextResponse.redirect(createApplicationUrl(UPDATE_PASSWORD_PATH));
  } catch (error) {
    logSupabaseAuthError("password recovery callback", error);

    return NextResponse.redirect(
      createApplicationUrl(RECOVERY_FAILURE_PATH),
    );
  }
}
