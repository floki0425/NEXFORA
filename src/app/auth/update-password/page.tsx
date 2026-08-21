import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthPageShell } from "@/features/auth/components/auth-page-shell";
import { UpdatePasswordForm } from "@/features/auth/components/update-password-form";
import { logAuthRecoveryIssue } from "@/lib/auth/diagnostics";
import { hasValidRecoverySessionMarker } from "@/lib/auth/recovery-session";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Choose a new password | Nexfora",
  description: "Choose a new password for your NEXFORA OS account.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function UpdatePasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  // Both guards below end on the same user-facing failure URL the callback
  // uses, so the log is the only thing that distinguishes "the callback never
  // ran, or the link was opened in a different browser" from "the callback
  // ran but its marker is missing or expired".
  if (error || !user) {
    logAuthRecoveryIssue("update-password page", "no_recovery_user_session");
    redirect("/auth/forgot-password?error=invalid_reset_link");
  }

  if (!(await hasValidRecoverySessionMarker(user.id))) {
    logAuthRecoveryIssue("update-password page", "no_recovery_marker");
    redirect("/auth/forgot-password?error=invalid_reset_link");
  }

  return (
    <AuthPageShell
      eyebrow="Account recovery"
      title="Choose a new password"
      description="Create a strong password you don't use for another account."
    >
      <div className="rounded-xl border border-border bg-white p-6 shadow-sm sm:p-8">
        <UpdatePasswordForm />
      </div>
    </AuthPageShell>
  );
}
