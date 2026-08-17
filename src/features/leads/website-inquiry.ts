import { z } from "zod";

// The Nexfora website's "Start a Project" intake contract, mirrored here so
// the OS can validate what it receives and label what it stores.
//
// These canonical values are the WEBSITE's enums (its project_inquiries
// CHECK constraints), not this database's. They are never rewritten: the
// ingestion RPC stores them verbatim in website_inquiry_imports and derives
// the normalized public.leads columns itself. Everything below the value
// tuples is presentation only.
//
// Keep the tuples byte-identical to the website's
// src/lib/project-inquiries/contract.ts. The database repeats them a third
// time as CHECK constraints, which is the layer that actually enforces them.

export const WEBSITE_INQUIRY_CONTACT_METHODS = ["email", "phone"] as const;

export const WEBSITE_INQUIRY_SERVICES = [
  "website_development",
  "ecommerce_development",
  "booking_systems",
  "ordering_systems",
  "web_applications",
  "mobile_applications",
  "custom_business_systems",
  "not_sure_yet",
] as const;

export const WEBSITE_INQUIRY_BUDGETS = [
  "below_25000",
  "25000_50000",
  "50000_100000",
  "100000_250000",
  "250000_plus",
  "not_sure_yet",
] as const;

export const WEBSITE_INQUIRY_TIMELINES = [
  "as_soon_as_possible",
  "within_1_month",
  "1_3_months",
  "3_6_months",
  "flexible_not_sure_yet",
] as const;

export type WebsiteInquiryContactMethod =
  (typeof WEBSITE_INQUIRY_CONTACT_METHODS)[number];
export type WebsiteInquiryService = (typeof WEBSITE_INQUIRY_SERVICES)[number];
export type WebsiteInquiryBudget = (typeof WEBSITE_INQUIRY_BUDGETS)[number];
export type WebsiteInquiryTimeline =
  (typeof WEBSITE_INQUIRY_TIMELINES)[number];

export const WEBSITE_INQUIRY_CONTACT_METHOD_LABELS: Record<
  WebsiteInquiryContactMethod,
  string
> = {
  email: "Email",
  phone: "Phone",
};

export const WEBSITE_INQUIRY_SERVICE_LABELS: Record<
  WebsiteInquiryService,
  string
> = {
  website_development: "Website Development",
  ecommerce_development: "E-commerce Development",
  booking_systems: "Booking Systems",
  ordering_systems: "Ordering Systems",
  web_applications: "Web Applications",
  mobile_applications: "Mobile Applications",
  custom_business_systems: "Custom Business Systems",
  not_sure_yet: "Not sure yet",
};

export const WEBSITE_INQUIRY_BUDGET_LABELS: Record<
  WebsiteInquiryBudget,
  string
> = {
  below_25000: "Below ₱25,000",
  "25000_50000": "₱25,000 – ₱50,000",
  "50000_100000": "₱50,000 – ₱100,000",
  "100000_250000": "₱100,000 – ₱250,000",
  "250000_plus": "₱250,000+",
  not_sure_yet: "Not sure yet",
};

export const WEBSITE_INQUIRY_TIMELINE_LABELS: Record<
  WebsiteInquiryTimeline,
  string
> = {
  as_soon_as_possible: "As soon as possible",
  within_1_month: "Within 1 month",
  "1_3_months": "1–3 months",
  "3_6_months": "3–6 months",
  flexible_not_sure_yet: "Flexible / Not sure yet",
};

/**
 * The signed payload the website forwards after its own inquiry has already
 * been persisted. Bounds mirror the website's column limits so an oversized
 * field is rejected at the edge with a 400 rather than as a database CHECK
 * violation deeper in.
 */
export const websiteInquiryPayloadSchema = z.object({
  idempotencyKey: z.uuid(),
  submittedAt: z.iso.datetime({ offset: true }),
  fullName: z.string().trim().min(1).max(120),
  email: z
    .email()
    .trim()
    .max(254)
    .transform((value) => value.toLowerCase()),
  phone: z.string().trim().max(40).nullable(),
  businessOrganization: z.string().trim().max(160).nullable(),
  preferredContactMethod: z.enum(WEBSITE_INQUIRY_CONTACT_METHODS),
  serviceNeeded: z.enum(WEBSITE_INQUIRY_SERVICES),
  estimatedBudget: z.enum(WEBSITE_INQUIRY_BUDGETS).nullable(),
  targetTimeline: z.enum(WEBSITE_INQUIRY_TIMELINES).nullable(),
  projectDescription: z.string().trim().min(1).max(4000),
});

export type WebsiteInquiryPayload = z.infer<typeof websiteInquiryPayloadSchema>;

function labelFor<Value extends string>(
  labels: Record<Value, string>,
  value: string,
): string {
  // A stored value that predates a contract change should render as itself
  // rather than as an empty cell.
  return (labels as Record<string, string | undefined>)[value] ?? value;
}

export function websiteInquiryContactMethodLabel(value: string): string {
  return labelFor(WEBSITE_INQUIRY_CONTACT_METHOD_LABELS, value);
}

export function websiteInquiryServiceLabel(value: string): string {
  return labelFor(WEBSITE_INQUIRY_SERVICE_LABELS, value);
}

export function websiteInquiryBudgetLabel(value: string | null): string {
  return value === null
    ? "Not specified"
    : labelFor(WEBSITE_INQUIRY_BUDGET_LABELS, value);
}

export function websiteInquiryTimelineLabel(value: string | null): string {
  return value === null
    ? "Not specified"
    : labelFor(WEBSITE_INQUIRY_TIMELINE_LABELS, value);
}
