import { z } from "zod";

const CONTROL_CHAR_PATTERN = /[\u0000-\u001F\u007F]/;

export const PASSWORD_RESET_SUCCESS_MESSAGE =
  "If an account exists for this email, a reset link has been sent.";

export const PASSWORD_REQUIREMENTS_MESSAGE =
  "Use 12–128 characters with uppercase, lowercase, number, and symbol.";

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .max(254, "Enter a valid email address.")
    .email("Enter a valid email address.")
    .transform((email) => email.toLowerCase()),
});

export const updatePasswordSchema = z
  .object({
    password: z
      .string()
      .min(12, "Use at least 12 characters.")
      .max(128, "Use no more than 128 characters.")
      .regex(/[a-z]/, "Include at least one lowercase letter.")
      .regex(/[A-Z]/, "Include at least one uppercase letter.")
      .regex(/[0-9]/, "Include at least one number.")
      .regex(/[^A-Za-z0-9]/, "Include at least one symbol."),
    passwordConfirmation: z
      .string()
      .min(1, "Confirm your new password.")
      .max(128, "Use no more than 128 characters."),
  })
  .superRefine(({ password, passwordConfirmation }, context) => {
    if (password !== passwordConfirmation) {
      context.addIssue({
        code: "custom",
        message: "The passwords do not match.",
        path: ["passwordConfirmation"],
      });
    }
  });

export function buildPasswordRecoveryRedirectUrl(appUrl: string): string {
  const normalizedAppUrl = appUrl.replace(/\/+$/, "");

  return `${normalizedAppUrl}/auth/callback?next=/auth/update-password`;
}

export function isValidAuthCallbackCode(code: string | null): code is string {
  return Boolean(
    code &&
      code.length <= 2048 &&
      !/[\u0000-\u001F\u007F]/.test(code),
  );
}

export const RECOVERY_OTP_TYPES = ["recovery"] as const;
export type RecoveryOtpType = (typeof RECOVERY_OTP_TYPES)[number];

export function isValidRecoveryOtpType(
  value: string | null,
): value is RecoveryOtpType {
  return (
    value !== null &&
    (RECOVERY_OTP_TYPES as readonly string[]).includes(value)
  );
}

export function isValidAuthCallbackTokenHash(
  value: string | null,
): value is string {
  return Boolean(
    value &&
      value.length <= 2048 &&
      !CONTROL_CHAR_PATTERN.test(value),
  );
}

export function getSafeInternalRedirectPath(
  destination: string | null,
  fallback = "/",
): string {
  if (
    !destination ||
    !destination.startsWith("/") ||
    destination.startsWith("//") ||
    destination.includes("\\") ||
    /[\u0000-\u001F\u007F]/.test(destination)
  ) {
    return fallback;
  }

  try {
    const internalOrigin = "https://nexfora.internal";
    const parsedDestination = new URL(destination, internalOrigin);

    if (parsedDestination.origin !== internalOrigin) {
      return fallback;
    }

    return `${parsedDestination.pathname}${parsedDestination.search}${parsedDestination.hash}`;
  } catch {
    return fallback;
  }
}
