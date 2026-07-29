import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonStyles } from "@/components/ui/button";
import { PortalProjectDetail } from "@/features/portal/projects/components/portal-project-detail";
import { getPortalProjectDetail } from "@/features/portal/projects/queries";
import { portalProjectIdSchema } from "@/features/portal/projects/schemas";
import { requirePortalMember } from "@/lib/auth/portal";

interface PortalProjectDetailPageProps {
  params: Promise<{ projectId: string }>;
}

export const metadata: Metadata = {
  title: "Project details",
};

export default async function PortalProjectDetailPage({
  params,
}: PortalProjectDetailPageProps) {
  const { projectId } = await params;

  if (!portalProjectIdSchema.safeParse(projectId).success) {
    notFound();
  }

  await requirePortalMember();
  const project = await getPortalProjectDetail(projectId);

  if (!project) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <Link
        href="/portal/projects"
        className={buttonStyles({ variant: "ghost", size: "sm" })}
      >
        ← Back to projects
      </Link>
      <PortalProjectDetail project={project} />
    </div>
  );
}
