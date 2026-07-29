"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { removeProjectMemberAction } from "../actions";

interface RemoveMemberButtonProps {
  projectId: string;
  memberRowId: string;
  memberName: string;
}

export function RemoveMemberButton({
  projectId,
  memberRowId,
  memberName,
}: RemoveMemberButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      aria-label={`Remove ${memberName} from this project`}
      className="inline-flex size-7 items-center justify-center rounded-md text-text-muted transition hover:bg-error-soft hover:text-error disabled:opacity-50"
      onClick={() => {
        if (!window.confirm(`Remove ${memberName} from this project?`)) {
          return;
        }

        startTransition(async () => {
          await removeProjectMemberAction(projectId, memberRowId);
          router.refresh();
        });
      }}
    >
      <X className="size-4" aria-hidden="true" />
    </button>
  );
}
