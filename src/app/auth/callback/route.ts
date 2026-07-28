import { NextResponse, type NextRequest } from "next/server";

import { publicEnv } from "@/config/env.public";
import {
  getSafeInternalRedirectPath,
  isValidAuthCallbackCode,
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
  const nextPath = getSafeInternalRedirectPath(
    request.nextUrl.searchParams.get("next"),
    UPDATE_PASSWORD_PATH,
  );

  if (!isValidAuthCallbackCode(code)) {
    return NextResponse.redirect(
      createApplicationUrl(RECOVERY_FAILURE_PATH),
    );
  }

  try {
    const supabase = await createClient();
    const { data, error } =
      await supabase.auth.exchangeCodeForSession(code);

    if (error || !data.user) {
      logSupabaseAuthError("password recovery code exchange", error);

      return NextResponse.redirect(
        createApplicationUrl(RECOVERY_FAILURE_PATH),
      );
    }

    await setRecoverySessionMarker(data.user.id);

    return NextResponse.redirect(createApplicationUrl(nextPath));
  } catch (error) {
    logSupabaseAuthError("password recovery callback", error);

    return NextResponse.redirect(
      createApplicationUrl(RECOVERY_FAILURE_PATH),
    );
  }
}
