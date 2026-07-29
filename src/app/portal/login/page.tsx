import type { Metadata } from "next";
import Link from "next/link";

import { AuthPageShell } from "@/features/auth/components/auth-page-shell";
import { PortalLoginForm } from "@/features/portal/auth/components/portal-login-form";

export const metadata: Metadata = {
  title: "Client sign in | Nexfora",
  description: "Secure sign in for the Nexfora client portal.",
  robots: {
    index: false,
    follow: false,
  },
};

const REASON_MESSAGES: Record<string, string> = {
  session_required: "Sign in to continue to your Nexfora portal.",
  access_denied:
    "This account does not have active client portal access.",
  verification_failed:
    "We couldn't verify your access. Please try again in a moment.",
  signed_out: "You have been signed out.",
};

interface PortalLoginPageProps {
  searchParams: Promise<{ reason?: string | string[] }>;
}

export default async function PortalLoginPage({
  searchParams,
}: PortalLoginPageProps) {
  const params = await searchParams;
  const reason = Array.isArray(params.reason) ? params.reason[0] : params.reason;
  const notice = reason ? REASON_MESSAGES[reason] : undefined;

  return (
    <AuthPageShell
      eyebrow="Client access"
      title="Sign in to your Nexfora portal"
      description="Use the email and password from your client invitation."
    >
      {notice ? (
        <div
          role="status"
          className="mb-5 rounded-lg border border-border bg-white px-4 py-3 text-sm text-text-secondary"
        >
          {notice}
        </div>
      ) : null}

      <div className="rounded-xl border border-border bg-white p-6 shadow-sm sm:p-8">
        <PortalLoginForm />
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
