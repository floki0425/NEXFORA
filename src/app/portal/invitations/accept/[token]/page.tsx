import type { Metadata } from "next";

import { ErrorState } from "@/components/ui/error-state";
import { AuthPageShell } from "@/features/auth/components/auth-page-shell";
import { confirmAcceptInvitationAction } from "@/features/portal/invitations/actions";
import { AcceptInvitationForm } from "@/features/portal/invitations/components/accept-invitation-form";
import { getInvitationPreview } from "@/features/portal/invitations/queries";
import { createClient } from "@/lib/supabase/server";

interface AcceptInvitationPageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string | string[] }>;
}

export const metadata: Metadata = {
  title: "Accept your invitation | Nexfora",
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";

export default async function AcceptInvitationPage({
  params,
  searchParams,
}: AcceptInvitationPageProps) {
  const { token } = await params;
  const { error } = await searchParams;
  const preview = await getInvitationPreview(token);

  if (!preview || error) {
    return (
      <div className="mx-auto flex min-h-svh max-w-lg items-center px-4">
        <ErrorState
          title="This invitation link is invalid or has expired"
          description="Ask Nexfora to send you a new invitation if you believe this is a mistake."
        />
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const hasMatchingSession =
    Boolean(user?.email) &&
    user!.email!.trim().toLowerCase() === preview.email;

  return (
    <AuthPageShell
      eyebrow="Client portal invitation"
      title={`You've been invited to ${preview.businessName}`}
      description={`Accept your invitation as a ${preview.roleLabel.toLowerCase()} to access the Nexfora client portal.`}
    >
      <div className="rounded-xl border border-border bg-white p-6 shadow-sm sm:p-8">
        {hasMatchingSession ? (
          <form
            action={confirmAcceptInvitationAction.bind(null, token)}
            className="space-y-5"
          >
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Email</p>
              <p className="rounded-md border border-border bg-surface-muted px-3.5 py-2.5 text-sm text-text-secondary">
                {preview.email}
              </p>
            </div>
            <button
              type="submit"
              className="flex min-h-11 w-full items-center justify-center rounded-md bg-nexfora-black px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-nexfora-graphite focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Accept invitation
            </button>
          </form>
        ) : (
          <AcceptInvitationForm rawToken={token} email={preview.email} />
        )}
      </div>
    </AuthPageShell>
  );
}
