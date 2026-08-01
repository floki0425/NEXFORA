import { z } from "zod";

import {
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_STATUSES,
} from "./constants.ts";

export const supportTicketIdSchema = z.uuid();

const ticketFields = {
  title: z.string().trim().min(1, "A title is required.").max(200),
  description: z
    .string()
    .trim()
    .min(1, "A description is required.")
    .max(5000),
  category: z.string().trim().max(60).optional().default(""),
  priority: z.enum(SUPPORT_TICKET_PRIORITIES),
};

export const internalSupportTicketCreateSchema = z.object({
  clientId: z.uuid("Select a valid client."),
  projectId: z.union([z.literal(""), z.uuid()]),
  ...ticketFields,
});

export type InternalSupportTicketCreateInput = z.input<
  typeof internalSupportTicketCreateSchema
>;

export const supportTicketFiltersSchema = z.object({
  query: z.string().trim().max(160).catch(""),
  status: z
    .union([z.literal(""), z.enum(SUPPORT_TICKET_STATUSES)])
    .catch(""),
  priority: z
    .union([z.literal(""), z.enum(SUPPORT_TICKET_PRIORITIES)])
    .catch(""),
  assignedTo: z.union([z.literal(""), z.uuid()]).catch(""),
  page: z.coerce.number().int().min(1).max(10000).catch(1),
});

export const supportTicketAssignSchema = z.object({
  assigneeId: z.union([z.literal(""), z.uuid()]),
});

export const supportTicketTransitionSchema = z
  .object({
    status: z.enum([
      "assigned",
      "in_progress",
      "waiting_for_client",
      "resolved",
    ] as const),
    resolutionNote: z.string().trim().max(3000).optional().default(""),
  })
  .superRefine((value, context) => {
    if (value.status === "resolved" && value.resolutionNote.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["resolutionNote"],
        message: "A resolution note is required.",
      });
    }
  });
