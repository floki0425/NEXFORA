"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  acceptProposalByTokenAction,
  declineProposalByTokenAction,
  requestProposalChangesByTokenAction,
} from "../client-actions";
import type { ProposalStatus } from "../constants";
import { ConfirmDialog } from "./confirm-dialog";
import { RequestChangesDialog } from "./request-changes-dialog";

interface ProposalClientActionsProps {
  token: string;
  status: ProposalStatus;
}

export function ProposalClientActions({
  token,
  status,
}: ProposalClientActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const canRespond = status === "sent" || status === "viewed";
  const canDecline = canRespond || status === "changes_requested";

  if (!canDecline) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        {canRespond ? (
          <ConfirmDialog
            triggerLabel="Accept proposal"
            title="Accept this proposal?"
            description="Accepting confirms you want to move forward with this proposal as described."
            confirmLabel="Yes, accept"
            isPending={isPending}
            onConfirm={() => {
              startTransition(async () => {
                const response = await acceptProposalByTokenAction(token);
                setMessage({ ok: response.ok, text: response.message });
                if (response.ok) {
                  router.refresh();
                }
              });
            }}
          />
        ) : null}
        {canRespond ? (
          <RequestChangesDialog
            disabled={isPending}
            onSubmitMessage={(requestMessage) =>
              requestProposalChangesByTokenAction(token, {
                message: requestMessage,
              })
            }
            onSuccess={() => router.refresh()}
          />
        ) : null}
        <ConfirmDialog
          triggerLabel="Decline"
          triggerVariant="ghost"
          title="Decline this proposal?"
          description="Declining lets Nexfora know this proposal will not move forward. You can still reach out if anything changes."
          confirmLabel="Yes, decline"
          isPending={isPending}
          onConfirm={() => {
            startTransition(async () => {
              const response = await declineProposalByTokenAction(token);
              setMessage({ ok: response.ok, text: response.message });
              if (response.ok) {
                router.refresh();
              }
            });
          }}
        />
      </div>
      {message ? (
        <p
          role={message.ok ? "status" : "alert"}
          className={message.ok ? "text-sm text-success" : "text-sm text-error"}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
