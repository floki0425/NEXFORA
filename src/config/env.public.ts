import { z } from "zod";

const absoluteHttpUrlSchema = z
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;

    return protocol === "http:" || protocol === "https:";
  }, "Use an absolute http:// or https:// URL.");

const applicationOriginSchema = absoluteHttpUrlSchema.refine((value) => {
  const url = new URL(value);

  return (
    url.pathname === "/" &&
    !url.search &&
    !url.hash &&
    !url.username &&
    !url.password
  );
}, "Use only the application origin, without a path, query, hash, or credentials.");

const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: applicationOriginSchema,
  NEXT_PUBLIC_SUPABASE_URL: absoluteHttpUrlSchema,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .trim()
    .startsWith(
      "sb_publishable_",
      "Use a Supabase publishable key beginning with sb_publishable_.",
    ),
});

const publicEnvResult = publicEnvSchema.safeParse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});

if (!publicEnvResult.success) {
  const issues = publicEnvResult.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");

  throw new Error(`Invalid public environment configuration: ${issues}`);
}

export const publicEnv = publicEnvResult.data;
