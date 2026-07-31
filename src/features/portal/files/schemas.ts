import { z } from "zod";

export const portalFileIdSchema = z.uuid();

export const uploadPortalFileFieldsSchema = z.object({
  category: z.string().trim().max(60).optional().default(""),
  // Client-generated once per upload attempt and resent unchanged on retry —
  // never trusted for authorization, only for idempotency.
  idempotencyKey: z.uuid(),
});
