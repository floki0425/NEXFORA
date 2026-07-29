import { z } from "zod";

import {
  MILESTONE_STATUSES,
  PROJECT_MEMBER_ROLES,
  PROJECT_PRIORITIES,
  PROJECT_STATUSES,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from "./constants.ts";

const optionalText = (max: number) => z.string().trim().max(max);

const optionalDateText = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value),
    "Enter a valid date.",
  );

const optionalUuid = z.union([
  z.literal(""),
  z.uuid("Select a valid option."),
]);

function dateRangeCheck(
  value: { startDate: string; targetDate: string },
  context: z.RefinementCtx,
): void {
  if (
    value.startDate &&
    value.targetDate &&
    value.targetDate < value.startDate
  ) {
    context.addIssue({
      code: "custom",
      path: ["targetDate"],
      message: "Target date must be on or after the start date.",
    });
  }
}

export const projectIdSchema = z.uuid();

const projectBaseFields = {
  name: z.string().trim().min(1, "Project name is required.").max(160),
  description: optionalText(5000),
  priority: z.enum(PROJECT_PRIORITIES),
  startDate: optionalDateText,
  targetDate: optionalDateText,
  projectManagerId: optionalUuid,
};

export const projectCreateSchema = z
  .object({
    clientId: z.uuid("Select a valid client."),
    ...projectBaseFields,
  })
  .superRefine(dateRangeCheck);

export type ProjectCreateInput = z.input<typeof projectCreateSchema>;

export const projectEditSchema = z
  .object({
    ...projectBaseFields,
    status: z.enum(PROJECT_STATUSES),
  })
  .superRefine(dateRangeCheck);

export type ProjectEditInput = z.input<typeof projectEditSchema>;

export const projectFiltersSchema = z.object({
  query: z.string().trim().max(160).catch(""),
  status: z.union([z.literal(""), z.enum(PROJECT_STATUSES)]).catch(""),
  clientId: z.union([z.literal(""), z.uuid()]).catch(""),
  projectManagerId: z.union([z.literal(""), z.uuid()]).catch(""),
  page: z.coerce.number().int().min(1).max(10000).catch(1),
});

export const milestoneFormSchema = z.object({
  title: z.string().trim().min(1, "Milestone title is required.").max(160),
  description: optionalText(5000),
  dueDate: optionalDateText,
});

export type MilestoneFormInput = z.input<typeof milestoneFormSchema>;

export const milestoneStatusSchema = z.object({
  status: z.enum(MILESTONE_STATUSES),
});

export const taskFormSchema = z.object({
  title: z.string().trim().min(1, "Task title is required.").max(160),
  description: optionalText(5000),
  milestoneId: optionalUuid,
  priority: z.enum(TASK_PRIORITIES),
  assignedTo: optionalUuid,
  dueDate: optionalDateText,
});

export type TaskFormInput = z.input<typeof taskFormSchema>;

export const taskStatusSchema = z.object({
  status: z.enum(TASK_STATUSES),
});

export const projectMemberFormSchema = z.object({
  userId: z.uuid("Select a valid team member."),
  role: z.enum(PROJECT_MEMBER_ROLES),
});

export type ProjectMemberFormInput = z.input<typeof projectMemberFormSchema>;
