import type { RevisionPriority, RevisionStatus } from "./constants";

export interface RevisionListItem {
  id: string;
  project_id: string;
  title: string;
  priority: RevisionPriority;
  status: RevisionStatus;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  projectName: string;
  clientName: string;
  assigneeName: string | null;
}

export interface RevisionActivityItem {
  activity_type: string;
  title: string;
  description: string | null;
  created_at: string;
  actorName: string | null;
}

export interface RevisionDetail {
  id: string;
  organization_id: string;
  project_id: string;
  client_id: string;
  page_name: string | null;
  section_name: string | null;
  title: string;
  description: string;
  priority: RevisionPriority;
  status: RevisionStatus;
  assigned_to: string | null;
  attachment_file_id: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  projectName: string;
  clientName: string;
  submitterName: string | null;
  assigneeName: string | null;
  activities: RevisionActivityItem[];
}

export interface RevisionFilters {
  query: string;
  status: RevisionStatus | "";
  priority: RevisionPriority | "";
  projectId: string;
  assignedTo: string;
  page: number;
}

export interface RevisionPageData {
  revisions: RevisionListItem[];
  total: number;
  page: number;
  pageCount: number;
}

export interface RevisionActionResult {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string[]>;
}

export interface RevisionAssignContext {
  projectManagerId: string | null;
  isProjectMember: boolean;
}
