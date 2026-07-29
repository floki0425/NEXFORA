import type { RequestedFeature, ServiceInterest } from "@/features/leads/constants";

export interface EstimateRange {
  min: number;
  max: number;
}

// Centralized, indicative pricing configuration. This is the single source
// consulted by the server-side estimate calculation — never duplicate these
// numbers across UI files. Ranges are intentionally indicative only; final
// pricing always depends on discovery and scope validation (PRODUCT.md §17).
export const BASE_PRICE_RANGES: Record<ServiceInterest, EstimateRange> = {
  "Business website": { min: 30000, max: 70000 },
  "Web application": { min: 80000, max: 200000 },
  "E-commerce": { min: 60000, max: 150000 },
  "Internal operations system": { min: 100000, max: 250000 },
  "Automation and integrations": { min: 40000, max: 120000 },
  "UI/UX design": { min: 25000, max: 60000 },
  Other: { min: 40000, max: 100000 },
};

export const FEATURE_PRICE_ADDERS: Record<RequestedFeature, EstimateRange> = {
  "Customer accounts": { min: 8000, max: 15000 },
  "Admin dashboard": { min: 10000, max: 20000 },
  "Online payments": { min: 12000, max: 25000 },
  "Bookings or scheduling": { min: 10000, max: 20000 },
  "Reports and analytics": { min: 8000, max: 18000 },
  "Workflow automation": { min: 15000, max: 30000 },
  "Third-party integrations": { min: 10000, max: 22000 },
  "Content management": { min: 6000, max: 12000 },
};

export function computeEstimateRange(
  projectType: ServiceInterest,
  features: readonly RequestedFeature[],
): EstimateRange {
  const base = BASE_PRICE_RANGES[projectType];
  return features.reduce<EstimateRange>(
    (range, feature) => {
      const adder = FEATURE_PRICE_ADDERS[feature];
      return adder
        ? { min: range.min + adder.min, max: range.max + adder.max }
        : range;
    },
    { ...base },
  );
}
