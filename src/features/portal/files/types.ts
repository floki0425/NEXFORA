export interface PortalFileListItem {
  id: string;
  fileName: string;
  mimeType: string | null;
  fileSize: number | null;
  category: string | null;
  createdAt: string;
}

export interface PortalFileActionResult {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string[]>;
}

export interface PortalDownloadUrlResult {
  ok: boolean;
  message: string;
  url?: string;
  fileName?: string;
}
