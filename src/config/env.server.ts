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
  // Optional: the proposal email service degrades to a safe setup error
  // instead of crashing the application when these are not configured.
  RESEND_API_KEY: z.string().trim().min(1).optional(),
  EMAIL_FROM: z.email("Use a valid from-address email.").optional(),
});

const serverEnvResult = serverEnvSchema.safeParse({
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  RESEND_API_KEY: process.env.RESEND_API_KEY || undefined,
  EMAIL_FROM: process.env.EMAIL_FROM || undefined,
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
