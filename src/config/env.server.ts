import "server-only";

import { z } from "zod";

import { publicEnv } from "@/config/env.public";

const serverEnvSchema = z.object({
  SUPABASE_SECRET_KEY: z
    .string()
    .trim()
    .startsWith(
      "sb_secret_",
      "Use a Supabase secret key beginning with sb_secret_.",
    ),
  // Optional: the proposal/invoice email service degrades to a safe setup
  // error instead of crashing the application when these are not
  // configured.
  RESEND_API_KEY: z.string().trim().min(1).optional(),
  EMAIL_FROM: z.email("Use a valid from-address email.").optional(),
  // Optional: PayMongo checkout-session creation and webhook verification
  // both degrade to a safe "not configured" result rather than crashing —
  // see src/lib/paymongo/client.ts and the webhook route handler.
  PAYMONGO_SECRET_KEY: z.string().trim().min(1).optional(),
  PAYMONGO_WEBHOOK_SECRET: z.string().trim().min(1).optional(),
  // Optional: the reminders cron route fails closed (401) when this is
  // unset rather than crashing — see src/lib/reminders/cron-secret.ts. Local
  // dev and tests do not need it since the manual "Run reminders now" admin
  // action does not go through the HTTP route.
  CRON_SECRET: z.string().trim().min(32).optional(),
  // Optional: shared HMAC secret for the Nexfora website's project-inquiry
  // forwarding endpoint (OS-L1, POST /api/webhooks/website-inquiry). When
  // unset the route rejects every request with 401 rather than accepting
  // unsigned ones — see src/lib/website-inquiry/signature.ts. Nothing else
  // in the application reads it, so local dev and tests do not need it.
  WEBSITE_INQUIRY_WEBHOOK_SECRET: z.string().trim().min(32).optional(),
});

const serverEnvResult = serverEnvSchema.safeParse({
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  RESEND_API_KEY: process.env.RESEND_API_KEY || undefined,
  EMAIL_FROM: process.env.EMAIL_FROM || undefined,
  PAYMONGO_SECRET_KEY: process.env.PAYMONGO_SECRET_KEY || undefined,
  PAYMONGO_WEBHOOK_SECRET: process.env.PAYMONGO_WEBHOOK_SECRET || undefined,
  CRON_SECRET: process.env.CRON_SECRET || undefined,
  WEBSITE_INQUIRY_WEBHOOK_SECRET:
    process.env.WEBSITE_INQUIRY_WEBHOOK_SECRET || undefined,
});

if (!serverEnvResult.success) {
  const issues = serverEnvResult.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");

  throw new Error(`Invalid server environment configuration: ${issues}`);
}

export const serverEnv = {
  ...publicEnv,
  ...serverEnvResult.data,
};
