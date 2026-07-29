"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ConfirmDialog } from "@/features/proposals/components/confirm-dialog";

import {
  inviteClientUserAction,
  resendClientInvitationAction,
  revokeClientInvitationAction,
} from "../actions";
import {
  CLIENT_INVITATION_DEFAULT_TTL_DAYS,
  CLIENT_INVITATION_TTL_DAYS_OPTIONS,
  CLIENT_ROLE_LABELS,
  CLIENT_ROLES,
} from "../constants";
import { inviteClientUserSchema, type InviteClientUserInput } from "../schemas";
import type {
  ClientInvitationActionResult,
  ClientPortalAccessData,
} from "../types";

interface InviteClientFormProps {
  clientId: string;
  onResult: (result: ClientInvitationActionResult) => void;
}

function InviteClientForm({ clientId, onResult }: InviteClientFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InviteClientUserInput>({
    resolver: zodResolver(inviteClientUserSchema),
    defaultValues: {
      email: "",
      role: "viewer",
      expiresInDays: String(CLIENT_INVITATION_DEFAULT_TTL_DAYS),
    },
  });

  const submit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await inviteClientUserAction(clientId, values);
      onResult(result);
      if (result.ok) {
        reset();
        router.refresh();
      }
    });
  });

  return (
    <form onSubmit={submit} noValidate className="grid gap-3 sm:grid-cols-[1fr_9rem_9rem_auto]">
      <FormField id="invite-email" label="Email" error={errors.email?.message}>
        <Input
          id="invite-email"
          type="email"
          autoComplete="email"
          {...register("email")}
        />
      </FormField>
      <FormField id="invite-role" label="Client role" error={errors.role?.message}>
        <Select id="invite-role" {...register("role")}>
          {CLIENT_ROLES.map((role) => (
            <option key={role} value={role}>
              {CLIENT_ROLE_LABELS[role]}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField
        id="invite-expiration"
        label="Expiration"
        error={errors.expiresInDays?.message}
      >
        <Select id="invite-expiration" {...register("expiresInDays")}>
          {CLIENT_INVITATION_TTL_DAYS_OPTIONS.map((days) => (
            <option key={days} value={days}>
              {days} days
            </option>
          ))}
        </Select>
      </FormField>
      <div className="flex items-end">
        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? "Sending…" : "Invite client"}
        </Button>
      </div>
    </form>
  );
}

interface ClientPortalAccessCardProps {
  clientId: string;
  data: ClientPortalAccessData;
  canManage: boolean;
}

export function ClientPortalAccessCard({
  clientId,
  data,
  canManage,
}: ClientPortalAccessCardProps) {
  const router = useRouter();
  const [result, setResult] = useState<ClientInvitationActionResult | null>(
    null,
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleResend(invitationId: string) {
    setPendingId(invitationId);
    startTransition(async () => {
      const response = await resendClientInvitationAction(
        clientId,
        invitationId,
      );
      setResult(response);
      setPendingId(null);
      router.refresh();
    });
  }

  function handleRevoke(invitationId: string) {
    setPendingId(invitationId);
    startTransition(async () => {
      const response = await revokeClientInvitationAction(
        clientId,
        invitationId,
      );
      setResult(response);
      setPendingId(null);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Client portal access</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {canManage ? (
          <InviteClientForm clientId={clientId} onResult={setResult} />
        ) : null}

        {result ? (
          <p
            role={result.ok ? "status" : "alert"}
            className={result.ok ? "text-sm text-success" : "text-sm text-error"}
          >
            {result.message}
          </p>
        ) : null}

        <div className="border-t border-border pt-5">
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            Pending invitations
          </h3>
          {data.pendingInvitations.length ? (
            <ul className="space-y-3">
              {data.pendingInvitations.map((invitation) => (
                <li
                  key={invitation.id}
                  className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {invitation.email}
                    </p>
                    <p className="text-xs text-text-muted">
                      {CLIENT_ROLE_LABELS[invitation.role]} · expires{" "}
                      {new Date(invitation.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  {canManage ? (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={pendingId === invitation.id}
                        onClick={() => handleResend(invitation.id)}
                      >
                        Resend
                      </Button>
                      <ConfirmDialog
                        triggerLabel="Revoke"
                        triggerVariant="destructive"
                        title="Revoke this invitation?"
                        description="The invitation link will stop working immediately."
                        confirmLabel="Revoke invitation"
                        isPending={pendingId === invitation.id}
                        onConfirm={() => handleRevoke(invitation.id)}
                      />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-muted">No pending invitations.</p>
          )}
        </div>

        <div className="border-t border-border pt-5">
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            Portal members
          </h3>
          {data.members.length ? (
            <ul className="space-y-2">
              {data.members.map((member) => (
                <li
                  key={member.id}
                  className="flex items-center justify-between rounded-lg border border-border p-3"
                >
                  <p className="text-sm font-medium text-foreground">
                    {member.fullName}
                  </p>
                  <div className="flex items-center gap-2">
                    <Badge variant="neutral">
                      {CLIENT_ROLE_LABELS[member.role]}
                    </Badge>
                    <Badge variant={member.status === "active" ? "success" : "warning"}>
                      {member.status}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-muted">No portal members yet.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
