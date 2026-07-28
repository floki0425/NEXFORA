import { UsersRound } from "lucide-react";
import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/layout/module-placeholder";

export const metadata: Metadata = {
  title: "Leads",
};

export default function LeadsPage() {
  return (
    <ModulePlaceholder
      title="Leads"
      description="This workspace is reserved for project inquiries and the future sales pipeline."
      phase="Phase 3"
      icon={UsersRound}
      emptyTitle="Lead management is not available yet"
      emptyDescription="Lead records, search, filters, and CRM functionality will be implemented in Phase 3. No lead data is fetched during Phase 2."
    />
  );
}
