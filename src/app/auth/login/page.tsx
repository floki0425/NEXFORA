import type { Metadata } from "next";
import Link from "next/link";

import { AuthPageShell } from "@/features/auth/components/auth-page-shell";
import { LoginForm } from "@/features/auth/components/login-form";

export const metadata: Metadata = {
  title: "Internal sign in | Nexfora",
  description: "Secure sign in for authorized Nexfora team members.",
  robots: {
    index: false,
    follow: false,
  },
};

const REASON_MESSAGES: Record<string, string> = {
  session_required: "Sign in to continue to the admin workspace.",
  access_denied:
    "This account does not have an active internal membership.",
  verification_failed:
    "We couldn't verify your access. Please try again in a moment.",
  signed_out: "You have been signed out.",
  password_updated:
    "Your password has been updated. Sign in with your new password.",
};

interface LoginPageProps {
  searchParams: Promise<{
    reason?: string | string[];
    password_updated?: string | string[];
  }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const reason = Array.isArray(params.reason)
    ? params.reason[0]
    : params.reason;
  const passwordUpdated = Array.isArray(params.password_updated)
    ? params.password_updated[0]
    : params.password_updated;
  const hasPasswordUpdated = passwordUpdated === "true";
  const notice = hasPasswordUpdated
    ? REASON_MESSAGES.password_updated
    : reason
      ? REASON_MESSAGES[reason]
      : undefined;

  return (
    <AuthPageShell
      eyebrow="Internal access"
      title="Sign in to NEXFORA OS"
      description="Use the email and password assigned to your internal account."
    >
      {notice ? (
        <div
          role="status"
          className={
            hasPasswordUpdated
              ? "mb-5 rounded-lg border border-success/25 bg-success-soft px-4 py-3 text-sm text-success"
              : "mb-5 rounded-lg border border-border bg-white px-4 py-3 text-sm text-text-secondary"
          }
        >
          {notice}
        </div>
      ) : null}

      <div className="rounded-xl border border-border bg-white p-6 shadow-sm sm:p-8">
        <LoginForm />
        <div className="mt-6 border-t border-border pt-5 text-center">
          <Link
            href="/auth/forgot-password"
            className="text-sm font-medium text-accent underline-offset-4 hover:text-accent-hover hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
          >
            Forgot your password?
          </Link>
        </div>
      </div>
    </AuthPageShell>
  );
}
