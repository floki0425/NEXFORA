import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PortalSupportTicketList } from "@/features/portal/support/components/portal-support-ticket-list";
import { getPortalSupportTickets } from "@/features/portal/support/queries";
import { getPortalProjects } from "@/features/portal/projects/queries";
import { requirePortalMember } from "@/lib/auth/portal";

export const metadata: Metadata = {
  title: "Support",
  description: "Ask Nexfora for help and follow each request to resolution.",
};

export default async function PortalSupportPage() {
  const member = await requirePortalMember();
  const [tickets, projects] = await Promise.all([
    getPortalSupportTickets(),
    getPortalProjects(),
  ]);
  const canCreate = member.role === "owner" || member.role === "manager";
  const projectNames = Object.fromEntries(
    projects.map((project) => [project.id, project.name]),
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Support"
        description="Ask Nexfora for help and follow each request through to resolution."
        action={
          canCreate ? (
            <Link href="/portal/support/new" className={buttonStyles()}>
              <Plus className="size-4" aria-hidden="true" />
              New support request
            </Link>
          ) : null
        }
      />

      <Card>
        <CardContent>
          <PortalSupportTicketList
            tickets={tickets}
            projectNames={projectNames}
          />
        </CardContent>
      </Card>

      {!canCreate ? (
        <p className="text-sm text-text-muted">
          Your access is read-only. A client owner or manager can open a new
          support request.
        </p>
      ) : null}
    </div>
  );
}
