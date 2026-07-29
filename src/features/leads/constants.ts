import type { BadgeVariant } from "@/components/ui/badge";

export const LEAD_MANAGER_ROLES = ["super_admin", "admin"] as const;

export const LEAD_STATUSES = [
  "new",
  "contacted",
  "discovery",
  "qualified",
  "proposal",
  "negotiation",
  "won",
  "lost",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_SOURCES = [
  "website",
  "facebook",
  "messenger",
  "email",
  "referral",
  "networking",
  "manual",
  "existing_client",
  "other",
] as const;

export type LeadSource = (typeof LEAD_SOURCES)[number];

export const SERVICE_INTERESTS = [
  "Business website",
  "Web application",
  "E-commerce",
  "Internal operations system",
  "Automation and integrations",
  "UI/UX design",
  "Other",
] as const;

export type ServiceInterest = (typeof SERVICE_INTERESTS)[number];

export const REQUESTED_FEATURES = [
  "Customer accounts",
  "Admin dashboard",
  "Online payments",
  "Bookings or scheduling",
  "Reports and analytics",
  "Workflow automation",
  "Third-party integrations",
  "Content management",
] as const;

export type RequestedFeature = (typeof REQUESTED_FEATURES)[number];

export const BUDGET_OPTIONS = [
  { label: "Under ₱50,000", min: 0, max: 49999 },
  { label: "₱50,000–₱99,999", min: 50000, max: 99999 },
  { label: "₱100,000–₱249,999", min: 100000, max: 249999 },
  { label: "₱250,000–₱499,999", min: 250000, max: 499999 },
  { label: "₱500,000 or more", min: 500000, max: null },
  { label: "Not sure yet", min: null, max: null },
] as const;

export const TIMELINE_OPTIONS = [
  "As soon as possible",
  "Within 1 month",
  "Within 2–3 months",
  "Within 3–6 months",
  "Flexible / exploring",
] as const;

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  discovery: "Discovery",
  qualified: "Qualified",
  proposal: "Proposal",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
};

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  website: "Website",
  facebook: "Facebook",
  messenger: "Messenger",
  email: "Email",
  referral: "Referral",
  networking: "Networking",
  manual: "Manual",
  existing_client: "Existing client",
  other: "Other",
};

export const LEAD_STATUS_BADGES: Record<LeadStatus, BadgeVariant> = {
  new: "info",
  contacted: "accent",
  discovery: "warning",
  qualified: "success",
  proposal: "accent",
  negotiation: "warning",
  won: "success",
  lost: "error",
};

export const LEADS_PAGE_SIZE = 20;
