"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";

export interface PortalLoginActionState {
  status: "idle" | "error";
  message: string;
  email: string;
  fieldErrors?: {
    email?: string;
    password?: string;
  };
}

const portalLoginSchema = z.object({
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

function getFieldErrors(
  error: z.ZodError,
): PortalLoginActionState["fieldErrors"] {
  const fieldErrors: PortalLoginActionState["fieldErrors"] = {};

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

/**
 * Mirrors src/features/auth/actions.ts's login() exactly, but resolves an
 * active client_users membership (via get_active_client_membership, reusing
 * the same just-authenticated client instance rather than creating a new
 * one) instead of an internal organization membership, and redirects to
 * /portal instead of /admin. Internal and client membership are resolved
 * completely independently — an internal-only account is denied here even
 * though it can sign in, and vice versa.
 */
export async function portalLogin(
  _previousState: PortalLoginActionState,
  formData: FormData,
): Promise<PortalLoginActionState> {
  const emailValue = formData.get("email");
  const parsedCredentials = portalLoginSchema.safeParse({
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

  const { data: membershipRows, error: membershipError } =
    await supabase.rpc("get_active_client_membership");

  if (membershipError || !membershipRows || membershipRows.length === 0) {
    await supabase.auth.signOut({ scope: "local" });

    return {
      status: "error",
      message:
        "This account does not have active client portal access. Ask Nexfora for a new invitation if you believe this is a mistake.",
      email: parsedCredentials.data.email,
    };
  }

  redirect("/portal");
}

export async function portalLogout(): Promise<void> {
  try {
    await requireUser();
  } catch {
    redirect("/portal/login?reason=session_required");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "local" });

  if (error) {
    redirect("/portal?notice=logout_failed");
  }

  redirect("/portal/login?reason=signed_out");
}
