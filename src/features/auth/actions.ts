"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { publicEnv } from "@/config/env.public";
import {
  buildPasswordRecoveryRedirectUrl,
  forgotPasswordSchema,
  PASSWORD_RESET_SUCCESS_MESSAGE,
  updatePasswordSchema,
} from "@/features/auth/recovery";
import {
  logAuthRecoveryIssue,
  logSupabaseAuthError,
} from "@/lib/auth/diagnostics";
import { AuthorizationLookupError } from "@/lib/auth/errors";
import {
  clearRecoverySessionMarker,
  hasValidRecoverySessionMarker,
} from "@/lib/auth/recovery-session";
import {
  getInternalMemberForUser,
  requireUser,
} from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";

export interface LoginActionState {
  status: "idle" | "error";
  message: string;
  email: string;
  fieldErrors?: {
    email?: string;
    password?: string;
  };
}

export interface ForgotPasswordActionState {
  status: "idle" | "success" | "error";
  message: string;
  email: string;
  fieldErrors?: {
    email?: string;
  };
}

export interface UpdatePasswordActionState {
  status: "idle" | "error";
  message: string;
  fieldErrors?: {
    password?: string;
    passwordConfirmation?: string;
  };
}

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .max(254, "Enter a valid email address.")
    .email("Enter a valid email address.")
    .transform((email) => email.toLowerCase()),
  password: z
    .string()
    .min(1, "Enter your password.")
    .max(512, "The password is too long."),
});

function getFieldErrors(error: z.ZodError): LoginActionState["fieldErrors"] {
  const fieldErrors: LoginActionState["fieldErrors"] = {};

  for (const issue of error.issues) {
    const field = issue.path[0];

    if (field === "email" && !fieldErrors.email) {
      fieldErrors.email = issue.message;
    }

    if (field === "password" && !fieldErrors.password) {
      fieldErrors.password = issue.message;
    }
  }

  return fieldErrors;
}

function getUpdatePasswordFieldErrors(
  error: z.ZodError,
): UpdatePasswordActionState["fieldErrors"] {
  const fieldErrors: UpdatePasswordActionState["fieldErrors"] = {};

  for (const issue of error.issues) {
    const field = issue.path[0];

    if (field === "password" && !fieldErrors.password) {
      fieldErrors.password = issue.message;
    }

    if (
      field === "passwordConfirmation" &&
      !fieldErrors.passwordConfirmation
    ) {
      fieldErrors.passwordConfirmation = issue.message;
    }
  }

  return fieldErrors;
}

export async function login(
  _previousState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const emailValue = formData.get("email");
  const parsedCredentials = loginSchema.safeParse({
    email: emailValue,
    password: formData.get("password"),
  });
  const email = typeof emailValue === "string" ? emailValue.trim() : "";

  if (!parsedCredentials.success) {
    return {
      status: "error",
      message: "Check the highlighted fields and try again.",
      email,
      fieldErrors: getFieldErrors(parsedCredentials.error),
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(
    parsedCredentials.data,
  );

  if (error || !data.user) {
    return {
      status: "error",
      message: "We couldn't sign you in with those credentials.",
      email: parsedCredentials.data.email,
    };
  }

  try {
    const membership = await getInternalMemberForUser(supabase, data.user.id);

    if (!membership) {
      await supabase.auth.signOut({ scope: "local" });

      return {
        status: "error",
        message: "This account does not have access to the admin workspace.",
        email: parsedCredentials.data.email,
      };
    }
  } catch (error) {
    await supabase.auth.signOut({ scope: "local" });

    if (error instanceof AuthorizationLookupError) {
      return {
        status: "error",
        message: "We couldn't verify your access. Please try again later.",
        email: parsedCredentials.data.email,
      };
    }

    throw error;
  }

  redirect("/admin");
}

export async function requestPasswordReset(
  _previousState: ForgotPasswordActionState,
  formData: FormData,
): Promise<ForgotPasswordActionState> {
  const emailValue = formData.get("email");
  const parsedEmail = forgotPasswordSchema.safeParse({
    email: emailValue,
  });
  const email = typeof emailValue === "string" ? emailValue.trim() : "";

  if (!parsedEmail.success) {
    return {
      status: "error",
      message: "Check the highlighted field and try again.",
      email,
      fieldErrors: {
        email: parsedEmail.error.issues[0]?.message,
      },
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(
    parsedEmail.data.email,
    {
      redirectTo: buildPasswordRecoveryRedirectUrl(
        publicEnv.NEXT_PUBLIC_APP_URL,
      ),
    },
  );

  if (error) {
    logSupabaseAuthError("password reset email", error);
  }

  return {
    status: "success",
    message: PASSWORD_RESET_SUCCESS_MESSAGE,
    email: parsedEmail.data.email,
  };
}

export async function updatePassword(
  _previousState: UpdatePasswordActionState,
  formData: FormData,
): Promise<UpdatePasswordActionState> {
  const parsedPasswords = updatePasswordSchema.safeParse({
    password: formData.get("password"),
    passwordConfirmation: formData.get("passwordConfirmation"),
  });

  if (!parsedPasswords.success) {
    return {
      status: "error",
      message: "Check the highlighted fields and try again.",
      fieldErrors: getUpdatePasswordFieldErrors(parsedPasswords.error),
    };
  }

  const supabase = await createClient();
  const { data: userData, error: userError } =
    await supabase.auth.getUser();

  if (userError || !userData.user) {
    logAuthRecoveryIssue("update-password action", "no_recovery_user_session");
    redirect("/auth/forgot-password?error=invalid_reset_link");
  }

  if (!(await hasValidRecoverySessionMarker(userData.user.id))) {
    logAuthRecoveryIssue("update-password action", "no_recovery_marker");
    redirect("/auth/forgot-password?error=invalid_reset_link");
  }

  const { error } = await supabase.auth.updateUser({
    password: parsedPasswords.data.password,
  });

  if (error) {
    logSupabaseAuthError("password update", error);

    return {
      status: "error",
      message:
        "We couldn't update your password. Request a new reset link and try again.",
    };
  }

  // Global scope revokes every session's refresh token, not just this
  // browser's, since the account's other active sessions were not
  // necessarily compromised by whoever triggered this reset. This does not
  // instantly invalidate an already-issued access token before its own
  // short expiry — see docs/PHASE_1_SETUP.md.
  const { error: signOutError } = await supabase.auth.signOut({
    scope: "global",
  });

  if (signOutError) {
    logSupabaseAuthError("post-password-update sign out", signOutError);
  }

  await clearRecoverySessionMarker();
  redirect("/auth/login?password_updated=true");
}

export async function logout(): Promise<void> {
  try {
    await requireUser();
  } catch {
    redirect("/auth/login?reason=session_required");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "local" });

  if (error) {
    redirect("/admin?notice=logout_failed");
  }

  redirect("/auth/login?reason=signed_out");
}
