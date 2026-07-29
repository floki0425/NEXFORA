import { FolderKanban } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getPortalDashboardData } from "@/features/portal/dashboard/queries";
import { PortalProjectCard } from "@/features/portal/projects/components/portal-project-card";
import { requirePortalMember } from "@/lib/auth/portal";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function PortalDashboardPage() {
  const member = await requirePortalMember();
  const { activeProjects, totalProjects } = await getPortalDashboardData();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Welcome"
        title={member.businessName}
        description="Here's where things stand on your active projects with Nexfora."
      />

      <Card>
        <CardContent>
          {activeProjects.length ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {activeProjects.map((project) => (
                <PortalProjectCard key={project.id} project={project} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={FolderKanban}
              title="No active projects right now"
              description={
                totalProjects > 0
                  ? "All of your projects are currently completed or on hold."
                  : "Nexfora hasn't started a project for you yet. We'll notify you once one begins."
              }
            />
          )}
        </CardContent>
      </Card>

      {totalProjects > 0 ? (
        <div className="text-right">
          <Link
            href="/portal/projects"
            className={buttonStyles({ variant: "secondary" })}
          >
            View all projects
          </Link>
        </div>
      ) : null}
    </div>
  );
}
