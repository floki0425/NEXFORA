"use server";

import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hashClientInvitationToken } from "@/lib/tokens/client-invitation-token";

import { getInvitationPreview } from "./queries.ts";
import { acceptInvitationSchema } from "./schemas.ts";
import type { AcceptInvitationActionResult } from "./types.ts";

const GENERIC_ERROR = "This invitation link is invalid or has expired.";

function isRedirectError(error: unknown): error is { digest: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof error.digest === "string" &&
    error.digest.startsWith("NEXT_REDIRECT")
  );
}

function logInvitationDiagnostics(
  operation: string,
  error: { code?: string | null; message?: string | null } | null | undefined,
): void {
  if (process.env.NODE_ENV !== "production") {
    console.error(`${operation} error`, {
      code: error?.code,
      message: error?.message,
    });
  }
}

/**
 * Used when the visitor already has an authenticated session whose email
 * matches the invitation — no password/account step needed, just confirm.
 * A plain <form action={...}> cannot receive a returned result, so failure
 * redirects back to the same accept page with a safe, generic query-param
 * indicator instead (the page renders the same generic invalid/expired
 * message the token-preview lookup already uses).
 */
export async function confirmAcceptInvitationAction(
  rawToken: string,
): Promise<void> {
  try {
    const tokenHash = hashClientInvitationToken(rawToken);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("accept_client_invitation", {
      p_token_hash: tokenHash,
    });

    if (error || !data) {
      logInvitationDiagnostics("confirmAcceptInvitationAction", error);
      redirect(`/portal/invitations/accept/${rawToken}?error=1`);
    }
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    console.error("Invitation confirmation failed.");
    redirect(`/portal/invitations/accept/${rawToken}?error=1`);
  }

  redirect("/portal");
}

/**
 * Handles both onboarding branches for an unauthenticated (or
 * mismatched-session) visitor. "create" first tries to provision a brand
 * new Auth user (+ profile row, via the admin client — no INSERT grant
 * exists for authenticated on profiles) using the submitted password; if an
 * account already exists for this email, it reports back so the form can
 * re-render as "sign_in" instead of silently failing. "sign_in" is only
 * ever submitted after that hand-off, so it simply signs in with the
 * submitted password. Either branch converges on the same
 * accept_client_invitation call, keeping membership creation idempotent and
 * in one place.
 */
export async function acceptInvitationAction(
  rawToken: string,
  input: unknown,
): Promise<AcceptInvitationActionResult> {
  const parsed = acceptInvitationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Please correct the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const preview = await getInvitationPreview(rawToken);
  if (!preview) {
    return { ok: false, message: GENERIC_ERROR };
  }

  try {
    if (parsed.data.mode === "create") {
      const admin = createAdminClient();
      const { data: createdUser, error: createError } =
        await admin.auth.admin.createUser({
          email: preview.email,
          password: parsed.data.password,
          email_confirm: true,
        });

      if (createError || !createdUser.user) {
        if (createError?.code === "email_exists") {
          return {
            ok: false,
            message:
              "An account with this email already exists. Enter your existing password to sign in.",
            switchToMode: "sign_in",
          };
        }

        logInvitationDiagnostics("acceptInvitationAction.createUser", createError);
        return {
          ok: false,
          message: "We could not create your account. Please try again.",
        };
      }

      const { error: profileError } = await admin.from("profiles").insert({
        auth_user_id: createdUser.user.id,
        full_name: parsed.data.fullName,
      });

      if (profileError) {
        logInvitationDiagnostics(
          "acceptInvitationAction.createProfile",
          profileError,
        );
        return {
          ok: false,
          message: "We could not set up your account. Please try again.",
        };
      }
    }

    const supabase = await createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: preview.email,
      password: parsed.data.password,
    });

    if (signInError) {
      return {
        ok: false,
        message:
          parsed.data.mode === "create"
            ? "We could not sign you in. Please try again."
            : "We couldn't sign you in with that password.",
      };
    }

    const tokenHash = hashClientInvitationToken(rawToken);
    const { data: acceptResult, error: acceptError } = await supabase.rpc(
      "accept_client_invitation",
      { p_token_hash: tokenHash },
    );

    if (acceptError || !acceptResult) {
      logInvitationDiagnostics("acceptInvitationAction.accept", acceptError);
      await supabase.auth.signOut({ scope: "local" });
      return { ok: false, message: GENERIC_ERROR };
    }
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    console.error("Invitation acceptance failed.");
    return { ok: false, message: GENERIC_ERROR };
  }

  redirect("/portal");
}
