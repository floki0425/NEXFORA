import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getPortalProjects } from "@/features/portal/projects/queries";
import { PortalSupportTicketCreateForm } from "@/features/portal/support/components/portal-support-ticket-create-form";
import { requirePortalMember } from "@/lib/auth/portal";

export const metadata: Metadata = {
  title: "New support request",
};

export default async function PortalNewSupportTicketPage() {
  const member = await requirePortalMember();
  if (member.role !== "owner" && member.role !== "manager") {
    notFound();
  }

  const projects = await getPortalProjects();

  return (
    <div className="space-y-8">
      <Link
        href="/portal/support"
        className={buttonStyles({ variant: "ghost", size: "sm" })}
      >
        Back to support
      </Link>

      <PageHeader
        title="How can we help?"
        description="Describe the issue clearly and our team will keep you updated here."
      />

      <Card>
        <CardContent>
          <PortalSupportTicketCreateForm
            projects={projects.map((project) => ({
              id: project.id,
              name: project.name,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
