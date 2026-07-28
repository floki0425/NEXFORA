"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  updatePassword,
  type UpdatePasswordActionState,
} from "@/features/auth/actions";
import { PASSWORD_REQUIREMENTS_MESSAGE } from "@/features/auth/recovery";

const initialState: UpdatePasswordActionState = {
  status: "idle",
  message: "",
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="flex min-h-11 w-full items-center justify-center rounded-md bg-nexfora-black px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-nexfora-graphite focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Updating password…" : "Update password"}
    </button>
  );
}

export function UpdatePasswordForm() {
  const [state, formAction] = useActionState(updatePassword, initialState);
  const passwordErrorId = state.fieldErrors?.password
    ? "password-error"
    : "password-requirements";
  const passwordConfirmationErrorId = state.fieldErrors?.passwordConfirmation
    ? "password-confirmation-error"
    : undefined;

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.status === "error" ? (
        <div
          role="alert"
          className="rounded-lg border border-error/25 bg-error-soft px-4 py-3 text-sm text-error"
        >
          {state.message}
        </div>
      ) : null}

      <div className="space-y-2">
        <label htmlFor="password" className="block text-sm font-medium">
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={128}
          aria-invalid={Boolean(state.fieldErrors?.password)}
          aria-describedby={passwordErrorId}
          className="min-h-11 w-full rounded-md border border-border-strong bg-white px-3.5 text-base text-foreground outline-none transition focus:border-accent focus:ring-3 focus:ring-accent/15"
        />
        {state.fieldErrors?.password ? (
          <p id="password-error" className="text-sm text-error">
            {state.fieldErrors.password}
          </p>
        ) : (
          <p
            id="password-requirements"
            className="text-sm text-text-secondary"
          >
            {PASSWORD_REQUIREMENTS_MESSAGE}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label
          htmlFor="passwordConfirmation"
          className="block text-sm font-medium"
        >
          Confirm new password
        </label>
        <input
          id="passwordConfirmation"
          name="passwordConfirmation"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={128}
          aria-invalid={Boolean(
            state.fieldErrors?.passwordConfirmation,
          )}
          aria-describedby={passwordConfirmationErrorId}
          className="min-h-11 w-full rounded-md border border-border-strong bg-white px-3.5 text-base text-foreground outline-none transition focus:border-accent focus:ring-3 focus:ring-accent/15"
        />
        {state.fieldErrors?.passwordConfirmation ? (
          <p id="password-confirmation-error" className="text-sm text-error">
            {state.fieldErrors.passwordConfirmation}
          </p>
        ) : null}
      </div>

      <SubmitButton />
    </form>
  );
}
