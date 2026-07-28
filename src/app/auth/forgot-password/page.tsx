import type { Metadata } from "next";
import Link from "next/link";

import { AuthPageShell } from "@/features/auth/components/auth-page-shell";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";

export const metadata: Metadata = {
  title: "Reset password | Nexfora",
  description: "Request a password reset link for NEXFORA OS.",
  robots: {
    index: false,
    follow: false,
  },
};

interface ForgotPasswordPageProps {
  searchParams: Promise<{
    error?: string | string[];
  }>;
}

export default async function ForgotPasswordPage({
  searchParams,
}: ForgotPasswordPageProps) {
  const params = await searchParams;
  const error = Array.isArray(params.error)
    ? params.error[0]
    : params.error;
  const hasInvalidRecoveryLink = error === "invalid_reset_link";

  return (
    <AuthPageShell
      eyebrow="Account recovery"
      title="Reset your password"
      description="Enter your account email and we'll send instructions for choosing a new password."
    >
      <div className="rounded-xl border border-border bg-white p-6 shadow-sm sm:p-8">
        {hasInvalidRecoveryLink ? (
          <div
            role="alert"
            className="mb-5 rounded-lg border border-error/25 bg-error-soft px-4 py-3 text-sm text-error"
          >
            This password reset link is invalid or has expired. Request a
            new link and try again.
          </div>
        ) : null}
        <ForgotPasswordForm />
        <div className="mt-6 border-t border-border pt-5 text-center">
          <Link
            href="/auth/login"
            className="text-sm font-medium text-accent underline-offset-4 hover:text-accent-hover hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </AuthPageShell>
  );
}
