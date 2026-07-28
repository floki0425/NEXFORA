import { ArrowRight, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";

interface QuickActionCardProps {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  status: string;
}

export function QuickActionCard({
  title,
  description,
  href,
  icon: Icon,
  status,
}: QuickActionCardProps) {
  return (
    <Link
      href={href}
      className="group flex h-full min-h-44 flex-col rounded-lg border border-border bg-white p-5 shadow-sm transition-colors hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <span className="flex size-10 items-center justify-center rounded-md bg-accent-soft text-accent">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <Badge>{status}</Badge>
      </div>
      <div className="mt-5">
        <h3 className="text-base font-semibold text-foreground">
          {title}
        </h3>
        <p className="mt-1.5 text-sm leading-6 text-text-secondary">
          {description}
        </p>
      </div>
      <span className="mt-auto flex items-center gap-1.5 pt-4 text-sm font-medium text-foreground">
        Open section
        <ArrowRight
          className="size-4 transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </span>
    </Link>
  );
}
