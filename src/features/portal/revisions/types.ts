import type {
  RevisionPriority,
  RevisionStatus,
} from "@/features/revisions/constants";

export interface PortalRevisionListItem {
  id: string;
  pageName: string | null;
  sectionName: string | null;
  title: string;
  description: string;
  priority: RevisionPriority;
  status: RevisionStatus;
  attachmentFileId: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface PortalRevisionActivityItem {
  activityType: string;
  title: string;
  description: string | null;
  createdAt: string;
}

export interface PortalRevisionActionResult {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string[]>;
}
