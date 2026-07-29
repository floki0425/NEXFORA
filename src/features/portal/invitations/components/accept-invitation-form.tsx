"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

import { acceptInvitationAction } from "../actions";

interface AcceptInvitationFormProps {
  rawToken: string;
  email: string;
}

export function AcceptInvitationForm({
  rawToken,
  email,
}: AcceptInvitationFormProps) {
  const [mode, setMode] = useState<"create" | "sign_in">("create");
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Record<string, string[]> | undefined
  >(undefined);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setMessage(null);
    startTransition(async () => {
      const result = await acceptInvitationAction(rawToken, {
        mode,
        fullName: formData.get("fullName") ?? "",
        password: formData.get("password") ?? "",
        passwordConfirmation: formData.get("passwordConfirmation") ?? "",
      });

      setMessage(result.message);
      setFieldErrors(result.fieldErrors);

      if (result.switchToMode) {
        setMode(result.switchToMode);
      }
    });
  }

  return (
    <form action={handleSubmit} noValidate className="space-y-5">
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">Email</p>
        <p className="rounded-md border border-border bg-surface-muted px-3.5 py-2.5 text-sm text-text-secondary">
          {email}
        </p>
      </div>

      {message ? (
        <div
          role="alert"
          className="rounded-lg border border-error/25 bg-error-soft px-4 py-3 text-sm text-error"
        >
          {message}
        </div>
      ) : null}

      {mode === "create" ? (
        <FormField
          id="fullName"
          label="Full name"
          error={fieldErrors?.fullName?.[0]}
        >
          <Input id="fullName" name="fullName" autoComplete="name" required />
        </FormField>
      ) : (
        <p className="text-sm text-text-secondary">
          An account already exists for this email. Enter your existing
          password to sign in and accept this invitation.
        </p>
      )}

      <FormField
        id="password"
        label={mode === "create" ? "Choose a password" : "Password"}
        error={fieldErrors?.password?.[0]}
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "create" ? "new-password" : "current-password"}
          required
        />
      </FormField>

      {mode === "create" ? (
        <FormField
          id="passwordConfirmation"
          label="Confirm password"
          error={fieldErrors?.passwordConfirmation?.[0]}
        >
          <Input
            id="passwordConfirmation"
            name="passwordConfirmation"
            type="password"
            autoComplete="new-password"
            required
          />
        </FormField>
      ) : null}

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending
          ? "Please wait…"
          : mode === "create"
            ? "Create account and accept"
            : "Sign in and accept"}
      </Button>
    </form>
  );
}
