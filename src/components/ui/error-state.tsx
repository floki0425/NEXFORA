import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

interface ErrorStateProps {
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function ErrorState({
  title = "We couldn't load this page",
  description = "The workspace ran into a problem. Please try again.",
  action,
  className,
}: ErrorStateProps) {
  return (
    <section
      className={cn(
        "flex flex-col items-center rounded-lg border border-border bg-white px-5 py-12 text-center shadow-sm sm:px-8",
        className,
      )}
      aria-label={title}
    >
      <div className="flex size-11 items-center justify-center rounded-lg border border-error/20 bg-error-soft text-error">
        <AlertTriangle className="size-5" aria-hidden="true" />
      </div>
      <h1 className="mt-4 text-lg font-semibold text-foreground">
        {title}
      </h1>
      <p className="mt-2 max-w-md text-sm leading-6 text-text-secondary">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </section>
  );
}
