import { z } from "zod";

import { SUPPORT_TICKET_PRIORITIES } from "@/features/support/constants";

export const portalSupportTicketIdSchema = z.uuid();

export const portalSupportTicketCreateSchema = z.object({
  projectId: z.union([z.literal(""), z.uuid()]),
  title: z.string().trim().min(1, "A title is required.").max(200),
  description: z
    .string()
    .trim()
    .min(1, "A description is required.")
    .max(5000),
  category: z.string().trim().max(60).optional().default(""),
  priority: z.enum(SUPPORT_TICKET_PRIORITIES),
});

export type PortalSupportTicketCreateInput = z.input<
  typeof portalSupportTicketCreateSchema
>;

export const portalSupportReopenSchema = z.object({
  comment: z
    .string()
    .trim()
    .min(1, "Please tell us what is still not working.")
    .max(3000),
});
