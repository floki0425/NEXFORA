"use client";

import { useState, useTransition } from "react";

import { setNotificationPreferenceAction } from "../actions";
import { NOTIFICATION_EVENT_LABELS } from "../constants";
import type { NotificationPreference } from "../types";

interface NotificationPreferencesFormProps {
  initialPreferences: NotificationPreference[];
}

function groupLabel(eventType: string): string {
  const domain = eventType.split(".")[0] ?? eventType;
  const labels: Record<string, string> = {
    lead: "Leads",
    client: "Clients",
    client_invitation: "Client invitations",
    proposal: "Proposals",
    invoice: "Invoices",
    payment: "Payments",
    project: "Projects",
    project_member: "Project members",
    milestone: "Milestones",
    file: "Files",
    revision: "Revisions",
    ticket: "Support tickets",
    subscription: "Subscriptions",
    role: "Roles",
  };
  return labels[domain] ?? domain;
}

export function NotificationPreferencesForm({
  initialPreferences,
}: NotificationPreferencesFormProps) {
  const [preferences, setPreferences] = useState(initialPreferences);
  const [pendingEventType, setPendingEventType] = useState<string | null>(
    null,
  );
  const [, startTransition] = useTransition();

  const groups = new Map<string, NotificationPreference[]>();
  for (const preference of preferences) {
    const key = groupLabel(preference.eventType);
    const existing = groups.get(key) ?? [];
    existing.push(preference);
    groups.set(key, existing);
  }

  function handleToggle(eventType: string, channel: "inApp" | "email") {
    const current = preferences.find((pref) => pref.eventType === eventType);
    if (!current) {
      return;
    }
    const next = { ...current, [channel]: !current[channel] };

    setPreferences((all) =>
      all.map((pref) => (pref.eventType === eventType ? next : pref)),
    );
    setPendingEventType(eventType);

    startTransition(async () => {
      await setNotificationPreferenceAction({
        eventType,
        inApp: next.inApp,
        email: next.email,
      });
      setPendingEventType((current) =>
        current === eventType ? null : current,
      );
    });
  }

  return (
    <div className="space-y-8">
      {Array.from(groups.entries()).map(([group, rows]) => (
        <section key={group}>
          <h2 className="text-sm font-semibold text-foreground">{group}</h2>
          <div className="mt-3 overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-left text-xs font-medium uppercase tracking-wide text-text-muted">
                <tr>
                  <th scope="col" className="px-4 py-2.5">
                    Event
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-center">
                    In-app
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-center">
                    Email
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((preference) => {
                  const isPending = pendingEventType === preference.eventType;
                  return (
                    <tr key={preference.eventType}>
                      <td className="px-4 py-2.5 text-foreground">
                        {NOTIFICATION_EVENT_LABELS[preference.eventType]}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={preference.inApp}
                          disabled={isPending}
                          onChange={() =>
                            handleToggle(preference.eventType, "inApp")
                          }
                          aria-label={`In-app notifications for ${NOTIFICATION_EVENT_LABELS[preference.eventType]}`}
                          className="size-4 rounded border-border-strong text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        />
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={preference.email}
                          disabled={isPending}
                          onChange={() =>
                            handleToggle(preference.eventType, "email")
                          }
                          aria-label={`Email notifications for ${NOTIFICATION_EVENT_LABELS[preference.eventType]}`}
                          className="size-4 rounded border-border-strong text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
