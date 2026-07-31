"use client";

import { ListChecks } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/features/proposals/components/confirm-dialog";
import {
  REVISION_PRIORITY_BADGES,
  REVISION_PRIORITY_LABELS,
  REVISION_STATUS_BADGES,
  REVISION_STATUS_LABELS,
} from "@/features/revisions/constants";
import { formatRevisionDate } from "@/features/revisions/format";

import { approveRevisionAction, requestRevisionChangesAction } from "../actions";
import type { PortalRevisionListItem } from "../types";
import { RevisionRequestChangesDialog } from "./revision-request-changes-dialog";

interface PortalRevisionListProps {
  projectId: string;
  revisions: PortalRevisionListItem[];
  canReview: boolean;
}

export function PortalRevisionList({
  projectId,
  revisions,
  canReview,
}: PortalRevisionListProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [messages, setMessages] = useState<Record<string, string>>({});

  if (revisions.length === 0) {
    return (
      <EmptyState
        icon={ListChecks}
        title="No revisions yet"
        description="Revisions you submit for this project will appear here."
      />
    );
  }

  return (
    <div className="divide-y divide-border border-t border-border">
      {revisions.map((revision) => (
        <div
          key={revision.id}
          data-testid="portal-revision-row"
          data-revision-title={revision.title}
          className="space-y-3 py-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {revision.title}
              </p>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-muted">
                {revision.pageName ? <span>{revision.pageName}</span> : null}
                {revision.sectionName ? (
                  <span>{revision.sectionName}</span>
                ) : null}
                <span>Submitted {formatRevisionDate(revision.createdAt)}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={REVISION_PRIORITY_BADGES[revision.priority]}>
                {REVISION_PRIORITY_LABELS[revision.priority]}
              </Badge>
              <Badge
                data-testid="revision-status-badge"
                variant={REVISION_STATUS_BADGES[revision.status]}
              >
                {REVISION_STATUS_LABELS[revision.status]}
              </Badge>
            </div>
          </div>
          <p className="whitespace-pre-wrap text-sm text-text-secondary">
            {revision.description}
          </p>
          {canReview && revision.status === "ready_for_review" ? (
            <div className="flex flex-wrap items-center gap-3">
              <ConfirmDialog
                triggerLabel="Approve"
                title="Approve this revision?"
                description="Approving confirms this change is complete and correct."
                confirmLabel="Yes, approve"
                isPending={isPending}
                onConfirm={() => {
                  startTransition(async () => {
                    const response = await approveRevisionAction(
                      revision.id,
                      projectId,
                    );
                    setMessages((prev) => ({
                      ...prev,
                      [revision.id]: response.message,
                    }));
                    if (response.ok) {
                      router.refresh();
                    }
                  });
                }}
              />
              <RevisionRequestChangesDialog
                disabled={isPending}
                onSubmitComment={(comment) =>
                  requestRevisionChangesAction(revision.id, projectId, {
                    comment,
                  })
                }
                onSuccess={() => router.refresh()}
              />
            </div>
          ) : null}
          {messages[revision.id] ? (
            <p className="text-sm text-text-secondary">
              {messages[revision.id]}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
