import { FolderKanban } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getPortalProjects } from "@/features/portal/projects/queries";
import { PortalProjectCard } from "@/features/portal/projects/components/portal-project-card";
import { requirePortalMember } from "@/lib/auth/portal";

export const metadata: Metadata = {
  title: "Projects",
};

export default async function PortalProjectsPage() {
  await requirePortalMember();
  const projects = await getPortalProjects();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Your projects"
        description="Every project Nexfora is delivering for your business."
      />

      <Card>
        <CardContent>
          {projects.length ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {projects.map((project) => (
                <PortalProjectCard key={project.id} project={project} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={FolderKanban}
              title="No projects yet"
              description="Nexfora hasn't started a project for you yet. We'll notify you once one begins."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
