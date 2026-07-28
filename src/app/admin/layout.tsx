import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AdminShell } from "@/components/layout/admin-shell";
import {
  AuthenticationRequiredError,
  AuthorizationDeniedError,
} from "@/lib/auth/errors";
import { requireInternalMember } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: "Dashboard | NEXFORA OS",
    template: "%s | NEXFORA OS",
  },
  description: "Secure internal operations workspace for Nexfora.",
  robots: {
    index: false,
    follow: false,
  },
};

async function getMemberOrRedirect() {
  try {
    return await requireInternalMember();
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect("/auth/login?reason=session_required");
    }

    if (error instanceof AuthorizationDeniedError) {
      redirect("/auth/login?reason=access_denied");
    }

    console.error("Internal authorization verification failed.");
    redirect("/auth/login?reason=verification_failed");
  }
}

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const member = await getMemberOrRedirect();

  return (
    <AdminShell
      fullName={member.profile.fullName}
      organizationName={member.organization.name}
      role={member.role}
    >
      {children}
    </AdminShell>
  );
}
