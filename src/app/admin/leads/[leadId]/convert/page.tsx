import { ArrowLeft, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConversionConfirmationForm } from "@/features/clients/components/conversion-confirmation-form";
import { canConvertLeadToClient } from "@/features/clients/permissions";
import { getLeadConversionCandidate } from "@/features/clients/queries";
import { leadIdSchema } from "@/features/leads/schemas";
import { requireInternalMember } from "@/lib/auth/server";

interface ConvertLeadPageProps {
  params: Promise<{ leadId: string }>;
}

export const metadata: Metadata = {
  title: "Convert lead to client",
};

function ReviewItem({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </dt>
      <dd className="mt-1.5 text-sm leading-6 text-foreground">
        {value || "Not provided"}
      </dd>
    </div>
  );
}

export default async function ConvertLeadPage({
  params,
}: ConvertLeadPageProps) {
  const { leadId } = await params;
  if (!leadIdSchema.safeParse(leadId).success) {
    notFound();
  }

  const member = await requireInternalMember();
  const lead = await getLeadConversionCandidate(
    member.organizationId,
    leadId,
  );
  if (!lead) {
    notFound();
  }

  if (lead.convertedClientId) {
    redirect(
      `/admin/clients/${lead.convertedClientId}?conversion=existing`,
    );
  }

  if (
    !canConvertLeadToClient(
      member.role,
      lead.status,
      lead.convertedClientId,
    )
  ) {
    notFound();
  }

  const clientBusinessName = lead.businessName || lead.fullName;

  return (
    <div className="mx-auto max-w-3xl space-y-7">
      <Link
        href={`/admin/leads/${lead.id}`}
        className="inline-flex items-center gap-2 text-sm font-medium text-text-secondary hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to lead
      </Link>

      <PageHeader
        eyebrow="Lead conversion"
        title="Convert lead to client"
        description="Review the client record that will be created before confirming this conversion."
      />

      <Card>
        <CardHeader>
          <CardTitle>{lead.fullName}</CardTitle>
          <CardDescription>
            The following documented lead details will be copied into one new
            active client record.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-6 sm:grid-cols-2">
            <ReviewItem
              label="Business name"
              value={clientBusinessName}
            />
            <ReviewItem label="Primary contact" value={lead.fullName} />
            <ReviewItem label="Email" value={lead.email} />
            <ReviewItem label="Phone" value={lead.phone} />
            <ReviewItem label="Industry" value={lead.industry} />
            <ReviewItem label="Initial status" value="Active" />
          </dl>
        </CardContent>
      </Card>

      <Card className="border-accent/20 bg-accent-soft/40">
        <CardContent className="flex gap-4">
          <ShieldCheck
            className="mt-0.5 size-5 shrink-0 text-accent"
            aria-hidden="true"
          />
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              What confirmation does
            </h2>
            <ul className="mt-2 space-y-2 text-sm leading-6 text-text-secondary">
              <li>
                The source lead remains available as historical CRM data.
              </li>
              <li>
                The lead and client are linked in both directions, and the
                conversion is recorded in lead activity.
              </li>
              <li>
                A row lock and unique database constraint ensure this lead
                cannot create a second client.
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <ConversionConfirmationForm leadId={lead.id} />
    </div>
  );
}
