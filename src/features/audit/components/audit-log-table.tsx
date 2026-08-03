import { ShieldCheck } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { NOTIFICATION_EVENT_LABELS } from "@/features/notifications/constants";

import type { AuditLogEntry } from "../types";

interface AuditLogTableProps {
  entries: AuditLogEntry[];
}

const ACTOR_TYPE_LABELS: Record<AuditLogEntry["actorType"], string> = {
  internal: "Internal",
  client: "Client",
  system: "System",
};

function formatAuditDate(value: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

function actionLabel(action: string): string {
  return (
    NOTIFICATION_EVENT_LABELS[action as keyof typeof NOTIFICATION_EVENT_LABELS] ??
    action
  );
}

export function AuditLogTable({ entries }: AuditLogTableProps) {
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="No audit activity yet"
        description="Sensitive actions across leads, clients, invoices, and more will appear here as they happen."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">
          Audit log entries, most recent first
        </caption>
        <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-text-muted">
          <tr>
            <th scope="col" className="px-5 py-3 font-semibold">
              When
            </th>
            <th scope="col" className="px-5 py-3 font-semibold">
              Action
            </th>
            <th scope="col" className="px-5 py-3 font-semibold">
              Entity
            </th>
            <th scope="col" className="px-5 py-3 font-semibold">
              Actor
            </th>
            <th scope="col" className="px-5 py-3 font-semibold">
              Details
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td className="px-5 py-3 whitespace-nowrap text-text-secondary">
                {formatAuditDate(entry.createdAt)}
              </td>
              <td className="px-5 py-3 font-medium text-foreground">
                {actionLabel(entry.action)}
              </td>
              <td className="px-5 py-3 text-text-secondary">
                {entry.entityType}
                {entry.entityId ? (
                  <span className="block font-mono text-xs text-text-muted">
                    {entry.entityId}
                  </span>
                ) : null}
              </td>
              <td className="px-5 py-3 text-text-secondary">
                {ACTOR_TYPE_LABELS[entry.actorType]}
              </td>
              <td className="px-5 py-3 text-text-secondary">
                {Object.keys(entry.metadata).length > 0 ? (
                  <code className="text-xs">
                    {JSON.stringify(entry.metadata)}
                  </code>
                ) : (
                  <span className="text-text-muted">-</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
