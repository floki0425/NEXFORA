import { z } from "zod";

export const acceptInvitationSchema = z
  .object({
    mode: z.enum(["create", "sign_in"]),
    fullName: z.string().trim().max(160).optional().default(""),
    password: z
      .string()
      .min(8, "Use at least 8 characters.")
      .max(72, "Use at most 72 characters."),
    passwordConfirmation: z.string().max(72).optional().default(""),
  })
  .refine((data) => data.mode !== "create" || data.fullName.length > 0, {
    message: "Enter your full name.",
    path: ["fullName"],
  })
  .refine(
    (data) =>
      data.mode !== "create" || data.password === data.passwordConfirmation,
    { message: "Passwords do not match.", path: ["passwordConfirmation"] },
  );

export type AcceptInvitationInput = z.input<typeof acceptInvitationSchema>;
