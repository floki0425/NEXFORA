import { FileText, Folder } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

import { getInternalFileDownloadUrlAction } from "../actions";
import { FILE_VISIBILITY_BADGES, FILE_VISIBILITY_LABELS } from "../constants";
import { formatFileDate, formatFileSize } from "../format";
import type { ProjectFileListItem } from "../types";
import { FileDownloadButton } from "./file-download-button";

interface InternalFileListProps {
  files: ProjectFileListItem[];
}

export function InternalFileList({ files }: InternalFileListProps) {
  if (files.length === 0) {
    return (
      <EmptyState
        icon={Folder}
        title="No files yet"
        description="Files uploaded to this project will appear here."
      />
    );
  }

  return (
    <div className="divide-y divide-border border-t border-border">
      {files.map((file) => (
        <div
          key={file.id}
          data-testid="project-file-row"
          data-file-name={file.file_name}
          className="flex flex-wrap items-center justify-between gap-4 py-4"
        >
          <div className="flex min-w-0 items-start gap-3">
            <FileText
              className="mt-0.5 size-5 shrink-0 text-text-muted"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {file.file_name}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
                <Badge
                  data-testid="file-visibility-badge"
                  variant={FILE_VISIBILITY_BADGES[file.visibility]}
                >
                  {FILE_VISIBILITY_LABELS[file.visibility]}
                </Badge>
                {file.category ? <span>{file.category}</span> : null}
                <span>{formatFileSize(file.file_size)}</span>
                {file.uploaderName ? (
                  <span>Uploaded by {file.uploaderName}</span>
                ) : null}
                <span>{formatFileDate(file.created_at)}</span>
              </div>
            </div>
          </div>
          <FileDownloadButton
            fileId={file.id}
            action={getInternalFileDownloadUrlAction}
          />
        </div>
      ))}
    </div>
  );
}
