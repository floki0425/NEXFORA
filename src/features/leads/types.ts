import type { InternalRole } from "@/lib/auth/types";
import type { Database } from "@/types/database";

import type { LeadSource, LeadStatus } from "./constants";

export type LeadRow = Database["public"]["Tables"]["leads"]["Row"];
export type LeadActivityRow =
  Database["public"]["Tables"]["lead_activities"]["Row"];

export interface LeadListItem extends Omit<LeadRow, "source" | "status"> {
  source: LeadSource;
  status: LeadStatus;
  assigneeName: string | null;
}

export interface LeadActivityItem extends LeadActivityRow {
  authorName: string | null;
}

export interface LeadDetail extends Omit<LeadRow, "source" | "status"> {
  source: LeadSource;
  status: LeadStatus;
  assigneeName: string | null;
  activities: LeadActivityItem[];
}

export interface MemberOption {
  id: string;
  fullName: string;
}

export interface LeadFilters {
  query: string;
  status: LeadStatus | "";
  source: LeadSource | "";
  assignedTo: string;
  page: number;
}

export interface LeadPageData {
  leads: LeadListItem[];
  total: number;
  page: number;
  pageCount: number;
}

export interface LeadAccessContext {
  organizationId: string;
  profileId: string;
  role: InternalRole;
  status: "active" | "inactive";
}

export interface ActionResult {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string[]>;
}
