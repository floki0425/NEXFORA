export type SendProposalEmailResult =
  | { ok: true }
  | {
      ok: false;
      reason: "not_configured" | "invalid_recipient" | "provider_error";
    };

/** The minimal shape of the Resend SDK's emails.send this module depends on. */
export interface ResendLikeClient {
  emails: {
    send: (params: {
      from: string;
      to: string;
      subject: string;
      html: string;
    }) => Promise<{
      data: unknown;
      error: { name: string; statusCode: number | null; message: string } | null;
    }>;
  };
}

export const SIMPLE_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function recipientDomain(email: string): string {
  const atIndex = email.indexOf("@");
  return atIndex === -1 ? "(no domain)" : email.slice(atIndex + 1);
}

/**
 * Masks a recipient address for development-only diagnostic logs — never
 * the raw address. Keeps only the first and last local-part characters
 * (e.g. "j***a@example.com") so logs stay useful without ever printing a
 * complete, copyable address.
 */
export function maskEmailForLogging(email: string): string {
  const atIndex = email.indexOf("@");
  if (atIndex <= 0) {
    return "(invalid)";
  }
  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);
  const masked =
    local.length <= 2
      ? `${local[0]}*`
      : `${local[0]}${"*".repeat(local.length - 2)}${local[local.length - 1]}`;
  return `${masked}@${domain}`;
}

export function normalizeAndValidateRecipient(
  toEmail: string,
): { ok: true; email: string } | { ok: false } {
  const normalized = toEmail.trim().toLowerCase();
  if (!SIMPLE_EMAIL_PATTERN.test(normalized)) {
    return { ok: false };
  }
  return { ok: true, email: normalized };
}

export function logEmailDiagnostics(
  operation: string,
  details: Record<string, unknown>,
): void {
  if (process.env.NODE_ENV !== "production") {
    console.error(`${operation} email diagnostics`, details);
  }
}

/**
 * Calls the Resend client and interprets its result. Kept dependency-free
 * (no env parsing, no server-only imports) so it can be unit tested with a
 * fake client — the Resend SDK reports provider failures via a returned
 * `error` object (not only via a thrown/rejected promise), and a returned
 * error must never be treated as success.
 */
export async function sendViaResendClient(
  client: ResendLikeClient,
  params: { from: string; to: string; subject: string; html: string },
  diagnostics: { operation: string; emailFromLoaded: boolean },
): Promise<SendProposalEmailResult> {
  try {
    const { error } = await client.emails.send(params);

    if (error) {
      logEmailDiagnostics(diagnostics.operation, {
        outcome: "provider_error",
        emailFromLoaded: diagnostics.emailFromLoaded,
        recipientDomain: recipientDomain(params.to),
        errorName: error.name,
        httpStatus: error.statusCode,
        errorMessage: error.message,
      });
      return { ok: false, reason: "provider_error" };
    }

    return { ok: true };
  } catch (error) {
    logEmailDiagnostics(diagnostics.operation, {
      outcome: "thrown_exception",
      emailFromLoaded: diagnostics.emailFromLoaded,
      recipientDomain: recipientDomain(params.to),
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });
    return { ok: false, reason: "provider_error" };
  }
}
