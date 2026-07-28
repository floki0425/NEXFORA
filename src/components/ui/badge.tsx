import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils/cn";

export type BadgeVariant =
  | "neutral"
  | "accent"
  | "success"
  | "warning"
  | "error"
  | "info";

const VARIANT_STYLES: Record<BadgeVariant, string> = {
  neutral: "border-border bg-surface-muted text-text-secondary",
  accent: "border-accent/20 bg-accent-soft text-accent",
  success: "border-success/20 bg-success-soft text-success",
  warning: "border-warning/20 bg-warning-soft text-warning",
  error: "border-error/20 bg-error-soft text-error",
  info: "border-info/20 bg-info-soft text-info",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({
  className,
  variant = "neutral",
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        VARIANT_STYLES[variant],
        className,
      )}
      {...props}
    />
  );
}
