import type { FileVisibility } from "./constants";

export interface ProjectFileListItem {
  id: string;
  file_name: string;
  mime_type: string | null;
  file_size: number | null;
  visibility: FileVisibility;
  category: string | null;
  created_at: string;
  uploaderName: string | null;
}

export interface FileActionResult {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string[]>;
}

export interface DownloadUrlResult {
  ok: boolean;
  message: string;
  url?: string;
  fileName?: string;
}

export interface ProjectFileAccessContext {
  projectManagerId: string | null;
  isProjectMember: boolean;
}
