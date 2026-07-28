import { FolderKanban } from "lucide-react";
import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/layout/module-placeholder";

export const metadata: Metadata = {
  title: "Projects",
};

export default function ProjectsPage() {
  return (
    <ModulePlaceholder
      title="Projects"
      description="This workspace is reserved for future delivery planning and project tracking."
      phase="Phase 5"
      icon={FolderKanban}
      emptyTitle="Project tracking is not available yet"
      emptyDescription="Projects, milestones, and tasks will be implemented in Phase 5. No project data is fetched during Phase 2."
    />
  );
}
