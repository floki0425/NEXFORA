import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { logout } from "@/features/auth/actions";
import {
  AuthenticationRequiredError,
  AuthorizationDeniedError,
} from "@/lib/auth/errors";
import { requireInternalMember } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "NEXFORA OS",
  robots: {
    index: false,
    follow: false,
  },
};

function formatRole(role: string) {
  return role
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

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
    <div className="min-h-svh bg-surface-muted">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
          <div className="flex min-w-0 items-center gap-4">
            <Link
              href="/admin"
              className="shrink-0 text-sm font-semibold uppercase tracking-[0.22em] text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
            >
              NEXFORA OS
            </Link>
            <span className="hidden h-5 w-px bg-border sm:block" />
            <p className="hidden truncate text-sm text-text-secondary sm:block">
              {member.organization.name}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-foreground">
                {member.profile.fullName}
              </p>
              <p className="text-xs text-text-muted">
                {formatRole(member.role)}
              </p>
            </div>
            <form action={logout}>
              <button
                type="submit"
                className="min-h-10 rounded-md border border-border-strong bg-white px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Log out
              </button>
            </form>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
