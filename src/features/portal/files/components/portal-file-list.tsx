import { FileText, Folder } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { formatFileSize } from "@/features/files/format";
import { FileDownloadButton } from "@/features/files/components/file-download-button";

import { getPortalFileDownloadUrlAction } from "../actions";
import type { PortalFileListItem } from "../types";

interface PortalFileListProps {
  files: PortalFileListItem[];
}

export function PortalFileList({ files }: PortalFileListProps) {
  if (files.length === 0) {
    return (
      <EmptyState
        icon={Folder}
        title="No files yet"
        description="Files shared with you for this project will appear here."
      />
    );
  }

  return (
    <div className="divide-y divide-border border-t border-border">
      {files.map((file) => (
        <div
          key={file.id}
          data-testid="portal-file-row"
          data-file-name={file.fileName}
          className="flex flex-wrap items-center justify-between gap-4 py-4"
        >
          <div className="flex min-w-0 items-start gap-3">
            <FileText
              className="mt-0.5 size-5 shrink-0 text-text-muted"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {file.fileName}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
                {file.category ? <span>{file.category}</span> : null}
                <span>{formatFileSize(file.fileSize)}</span>
              </div>
            </div>
          </div>
          <FileDownloadButton
            fileId={file.id}
            action={getPortalFileDownloadUrlAction}
          />
        </div>
      ))}
    </div>
  );
}
