"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  portalLogin,
  type PortalLoginActionState,
} from "@/features/portal/auth/actions";

const initialState: PortalLoginActionState = {
  status: "idle",
  message: "",
  email: "",
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="flex min-h-11 w-full items-center justify-center rounded-md bg-nexfora-black px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-nexfora-graphite focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}

export function PortalLoginForm() {
  const [state, formAction] = useActionState(portalLogin, initialState);
  const emailErrorId = state.fieldErrors?.email ? "email-error" : undefined;
  const passwordErrorId = state.fieldErrors?.password
    ? "password-error"
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
        <label htmlFor="email" className="block text-sm font-medium">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          defaultValue={state.email}
          aria-invalid={Boolean(emailErrorId)}
          aria-describedby={emailErrorId}
          className="min-h-11 w-full rounded-md border border-border-strong bg-white px-3.5 text-base text-foreground outline-none transition focus:border-accent focus:ring-3 focus:ring-accent/15"
        />
        {state.fieldErrors?.email ? (
          <p id="email-error" className="text-sm text-error">
            {state.fieldErrors.email}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <label htmlFor="password" className="block text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(passwordErrorId)}
          aria-describedby={passwordErrorId}
          className="min-h-11 w-full rounded-md border border-border-strong bg-white px-3.5 text-base text-foreground outline-none transition focus:border-accent focus:ring-3 focus:ring-accent/15"
        />
        {state.fieldErrors?.password ? (
          <p id="password-error" className="text-sm text-error">
            {state.fieldErrors.password}
          </p>
        ) : null}
      </div>

      <SubmitButton />
    </form>
  );
}
