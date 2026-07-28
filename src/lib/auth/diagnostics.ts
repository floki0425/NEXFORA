import "server-only";

/**
 * Logs only the Supabase Auth fields needed for development diagnostics.
 * Never pass form data, credentials, tokens, or session objects here.
 */
export function logSupabaseAuthError(
  operation: string,
  error: unknown,
): void {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  const errorRecord =
    typeof error === "object" && error !== null
      ? (error as Record<string, unknown>)
      : null;
  const name =
    typeof errorRecord?.name === "string"
      ? errorRecord.name
      : "UnknownAuthError";
  const status =
    typeof errorRecord?.status === "number"
      ? String(errorRecord.status)
      : "unknown";
  const code =
    typeof errorRecord?.code === "string"
      ? errorRecord.code
      : "unknown";
  const message =
    typeof errorRecord?.message === "string"
      ? errorRecord.message.replace(/[\r\n]+/g, " ")
      : "Unknown authentication error.";

  console.error(
    `[auth] ${operation} failed: name=${name} status=${status} code=${code} message=${message}`,
  );
}
