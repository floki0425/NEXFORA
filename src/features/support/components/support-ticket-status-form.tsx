"use client";

import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { transitionSupportTicketAction } from "../actions";
import {
  SUPPORT_INTERNAL_TRANSITIONS,
  SUPPORT_TRANSITION_LABELS,
  type SupportTicketStatus,
} from "../constants";

interface SupportTicketStatusFormProps {
  ticketId: string;
  currentStatus: SupportTicketStatus;
  hasAssignee: boolean;
}

export function SupportTicketStatusForm({
  ticketId,
  currentStatus,
  hasAssignee,
}: SupportTicketStatusFormProps) {
  const [isPending, startTransition] = useTransition();
  const [resolutionNote, setResolutionNote] = useState("");
  const [message, setMessage] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  // Declared before the early return below so this hook is never skipped.
  // Commit the action result first, then start a fresh document request:
  // router.refresh() inside the transition did not reliably re-render this
  // route, which left the status badge, the resolution note, and the set of
  // available next transitions all showing pre-transition state even though
  // the change had been committed. Matches the approach already adopted for
  // the file upload forms.
  useEffect(() => {
    if (!message?.ok) {
      return;
    }

    window.location.reload();
  }, [message]);

  const transitions = SUPPORT_INTERNAL_TRANSITIONS[currentStatus].filter(
    (status) => status !== "assigned" || hasAssignee,
  );
  const resolveAvailable = transitions.includes("resolved");
  const otherTransitions = transitions.filter((status) => status !== "resolved");

  if (transitions.length === 0) {
    return (
      <p className="text-sm text-text-muted">
        {currentStatus === "open" && !hasAssignee
          ? "Assign this ticket before moving it into the support workflow."
          : "This ticket has no further internal actions."}
      </p>
    );
  }

  function submitTransition(status: SupportTicketStatus): void {
    setMessage(null);
    startTransition(async () => {
      const response = await transitionSupportTicketAction(ticketId, {
        status,
        resolutionNote: status === "resolved" ? resolutionNote : "",
      });
      setMessage({ ok: response.ok, text: response.message });
      if (response.ok && status === "resolved") {
        setResolutionNote("");
      }
    });
  }

  return (
    <div className="space-y-4">
      {otherTransitions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {otherTransitions.map((status) => (
            <Button
              key={status}
              type="button"
              size="sm"
              variant="secondary"
              disabled={isPending}
              onClick={() => submitTransition(status)}
            >
              {SUPPORT_TRANSITION_LABELS[status] ?? "Update status"}
            </Button>
          ))}
        </div>
      ) : null}

      {resolveAvailable ? (
        <div className="space-y-2 border-t border-border pt-4">
          <label
            htmlFor="resolution-note"
            className="block text-xs font-semibold uppercase tracking-wide text-text-muted"
          >
            Resolution note
          </label>
          <Textarea
            id="resolution-note"
            value={resolutionNote}
            maxLength={3000}
            required
            disabled={isPending}
            onChange={(event) => setResolutionNote(event.target.value)}
            placeholder="Explain what was fixed and what the client should verify."
          />
          <Button
            type="button"
            size="sm"
            disabled={isPending || resolutionNote.trim().length === 0}
            onClick={() => submitTransition("resolved")}
          >
            {isPending ? "Resolving..." : "Resolve ticket"}
          </Button>
        </div>
      ) : null}

      {message ? (
        <p
          role={message.ok ? "status" : "alert"}
          className={message.ok ? "text-xs text-success" : "text-xs text-error"}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
