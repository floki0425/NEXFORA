import { z } from "zod";

import { NOTIFICATION_EVENT_TYPES } from "./constants";

export const notificationIdSchema = z.uuid();

export const notificationPreferenceUpdateSchema = z.object({
  eventType: z.enum(NOTIFICATION_EVENT_TYPES),
  inApp: z.boolean(),
  email: z.boolean(),
});

export type NotificationPreferenceUpdateInput = z.input<
  typeof notificationPreferenceUpdateSchema
>;
