import { z } from "zod";

import { CLIENT_STATUSES } from "./constants.ts";

const optionalText = (max: number) => z.string().trim().max(max);

const optionalUrl = z
  .string()
  .trim()
  .max(2048)
  .refine(
    (value) => value === "" || z.url().safeParse(value).success,
    "Enter a valid URL, including http:// or https://.",
  );

export const clientIdSchema = z.uuid();

export const clientFormSchema = z.object({
  businessName: z
    .string()
    .trim()
    .min(1, "Business name is required.")
    .max(160),
  contactName: z
    .string()
    .trim()
    .min(1, "Contact name is required.")
    .max(120),
  email: z
    .string()
    .trim()
    .max(254)
    .refine(
      (value) => z.email().safeParse(value).success,
      "Enter a valid email address.",
    )
    .transform((value) => value.toLowerCase()),
  phone: optionalText(40),
  industry: optionalText(120),
  websiteUrl: optionalUrl,
  billingAddress: optionalText(2000),
  notes: optionalText(5000),
  status: z.enum(CLIENT_STATUSES),
});

export type ClientFormInput = z.input<typeof clientFormSchema>;
export type ClientFormValues = z.output<typeof clientFormSchema>;

export const clientFiltersSchema = z.object({
  query: z.string().trim().max(120).catch(""),
  status: z.union([z.literal(""), z.enum(CLIENT_STATUSES)]).catch(""),
  page: z.coerce.number().int().min(1).max(10000).catch(1),
});
