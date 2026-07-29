import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PortalShell } from "@/features/portal/components/portal-shell";
import {
  AuthenticationRequiredError,
  AuthorizationDeniedError,
} from "@/lib/auth/errors";
import { requirePortalMember } from "@/lib/auth/portal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: "Portal | Nexfora",
    template: "%s | Nexfora Client Portal",
  },
  description: "Your Nexfora client portal.",
  robots: {
    index: false,
    follow: false,
  },
};

async function getPortalMemberOrRedirect() {
  try {
    return await requirePortalMember();
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect("/portal/login?reason=session_required");
    }

    if (error instanceof AuthorizationDeniedError) {
      redirect("/portal/login?reason=access_denied");
    }

    console.error("Client portal authorization verification failed.");
    redirect("/portal/login?reason=verification_failed");
  }
}

export default async function PortalProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const member = await getPortalMemberOrRedirect();

  return (
    <PortalShell
      fullName={member.profile.fullName}
      businessName={member.businessName}
    >
      {children}
    </PortalShell>
  );
}
