import { z } from "zod";

import { REVISION_PRIORITIES, REVISION_STATUSES } from "./constants.ts";

export const revisionIdSchema = z.uuid();

export const revisionFiltersSchema = z.object({
  query: z.string().trim().max(120).catch(""),
  status: z.union([z.literal(""), z.enum(REVISION_STATUSES)]).catch(""),
  priority: z.union([z.literal(""), z.enum(REVISION_PRIORITIES)]).catch(""),
  projectId: z.union([z.literal(""), z.uuid()]).catch(""),
  assignedTo: z.union([z.literal(""), z.uuid()]).catch(""),
  page: z.coerce.number().int().min(1).max(10000).catch(1),
});

// Only the internal-driven forward/reopen transitions can ever be requested
// this way — ready_for_review -> approved/rejected are client-only and have
// no form in the admin workspace.
export const revisionStatusTransitionSchema = z.object({
  status: z.enum([
    "reviewing",
    "in_progress",
    "ready_for_review",
    "closed",
  ] as const),
});

export const revisionAssignSchema = z.object({
  assigneeId: z.union([z.literal(""), z.uuid()]),
});
