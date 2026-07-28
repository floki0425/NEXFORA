import { BriefcaseBusiness } from "lucide-react";
import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/layout/module-placeholder";

export const metadata: Metadata = {
  title: "Clients",
};

export default function ClientsPage() {
  return (
    <ModulePlaceholder
      title="Clients"
      description="This workspace is reserved for structured client records and relationships."
      phase="Phase 4"
      icon={BriefcaseBusiness}
      emptyTitle="Client records are not available yet"
      emptyDescription="Client lists, details, and lead conversion will be implemented in Phase 4. No client data is fetched during Phase 2."
    />
  );
}
