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
});

const serverEnvResult = serverEnvSchema.safeParse({
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
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
