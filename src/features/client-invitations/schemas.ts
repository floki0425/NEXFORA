import { z } from "zod";

import {
  CLIENT_INVITATION_TTL_DAYS_OPTIONS,
  CLIENT_ROLES,
} from "./constants.ts";

export const clientIdParamSchema = z.uuid();

export const invitationIdSchema = z.uuid();

export const inviteClientUserSchema = z.object({
  email: z
    .string()
    .trim()
    .max(254)
    .refine(
      (value) => z.email().safeParse(value).success,
      "Enter a valid email address.",
    )
    .transform((value) => value.toLowerCase()),
  role: z.enum(CLIENT_ROLES, "Select a valid client role."),
  expiresInDays: z
    .string()
    .trim()
    .refine(
      (value) =>
        (CLIENT_INVITATION_TTL_DAYS_OPTIONS as readonly number[]).includes(
          Number(value),
        ),
      "Select a valid expiration.",
    ),
});

export type InviteClientUserInput = z.input<typeof inviteClientUserSchema>;
