import { z } from "zod";

import { REVISION_PRIORITIES } from "../../revisions/constants.ts";

export const portalRevisionIdSchema = z.uuid();

export const submitRevisionSchema = z.object({
  pageName: z.string().trim().max(160).optional().default(""),
  sectionName: z.string().trim().max(160).optional().default(""),
  title: z.string().trim().min(1, "A title is required.").max(200),
  description: z
    .string()
    .trim()
    .min(1, "A description is required.")
    .max(5000),
  priority: z.enum(REVISION_PRIORITIES),
  attachmentFileId: z.union([z.literal(""), z.uuid()]).optional().default(""),
});

export type SubmitRevisionInput = z.input<typeof submitRevisionSchema>;
export type SubmitRevisionValues = z.output<typeof submitRevisionSchema>;

export const requestChangesSchema = z.object({
  comment: z
    .string()
    .trim()
    .min(1, "Please describe the changes you would like to request.")
    .max(3000),
});
