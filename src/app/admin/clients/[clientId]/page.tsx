import {
  ArrowLeft,
  ExternalLink,
  Mail,
  Pencil,
  Phone,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  CLIENT_STATUS_BADGES,
  CLIENT_STATUS_LABELS,
} from "@/features/clients/constants";
import { formatClientDate } from "@/features/clients/format";
import { memberCanManageClients } from "@/features/clients/permissions";
import { getClientDetail } from "@/features/clients/queries";
import { clientIdSchema } from "@/features/clients/schemas";
import { requireInternalMember } from "@/lib/auth/server";

interface ClientPageProps {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const metadata: Metadata = {
  title: "Client details",
};

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function DataItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </dt>
      <dd className="mt-1.5 text-sm leading-6 text-foreground">
        {children || "Not provided"}
      </dd>
    </div>
  );
}

export default async function ClientDetailPage({
  params,
  searchParams,
}: ClientPageProps) {
  const { clientId } = await params;
  if (!clientIdSchema.safeParse(clientId).success) {
    notFound();
  }

  const member = await requireInternalMember();
  const client = await getClientDetail(member.organizationId, clientId);
  if (!client) {
    notFound();
  }

  const rawSearchParams = await searchParams;
  const conversion = one(rawSearchParams.conversion);
  const updated = one(rawSearchParams.updated) === "1";
  const canManage = memberCanManageClients(member);

  return (
    <div className="space-y-7">
      <Link
        href="/admin/clients"
        className="inline-flex items-center gap-2 text-sm font-medium text-text-secondary hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to clients
      </Link>

      <PageHeader
        eyebrow="Client"
        title={client.business_name}
        description={`Primary contact: ${client.contact_name}`}
        action={
          canManage ? (
            <Link
              href={`/admin/clients/${client.id}/edit`}
              className={buttonStyles({ variant: "secondary" })}
            >
              <Pencil className="size-4" aria-hidden="true" />
              Edit client
            </Link>
          ) : null
        }
      />

      {conversion === "created" ? (
        <div
          role="status"
          className="rounded-lg border border-success/20 bg-success-soft px-4 py-3 text-sm text-success"
        >
          Client created successfully. The source lead remains available in
          CRM history.
        </div>
      ) : conversion === "existing" ? (
        <div
          role="status"
          className="rounded-lg border border-info/20 bg-info-soft px-4 py-3 text-sm text-info"
        >
          This lead was already converted. The existing client was opened and
          no duplicate was created.
        </div>
      ) : updated ? (
        <div
          role="status"
          className="rounded-lg border border-success/20 bg-success-soft px-4 py-3 text-sm text-success"
        >
          Client details updated successfully.
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-3">
                <CardTitle>Overview</CardTitle>
                <Badge variant={CLIENT_STATUS_BADGES[client.status]}>
                  {CLIENT_STATUS_LABELS[client.status]}
                </Badge>
              </div>
              <CardDescription>
                Primary business, contact, and relationship details.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-6 sm:grid-cols-2">
                <DataItem label="Business name">
                  {client.business_name}
                </DataItem>
                <DataItem label="Primary contact">
                  {client.contact_name}
                </DataItem>
                <DataItem label="Email">
                  <a
                    href={`mailto:${client.email}`}
                    className="inline-flex items-center gap-2 text-accent hover:underline"
                  >
                    <Mail className="size-4" aria-hidden="true" />
                    {client.email}
                  </a>
                </DataItem>
                <DataItem label="Phone">
                  {client.phone ? (
                    <a
                      href={`tel:${client.phone}`}
                      className="inline-flex items-center gap-2 text-accent hover:underline"
                    >
                      <Phone className="size-4" aria-hidden="true" />
                      {client.phone}
                    </a>
                  ) : (
                    "Not provided"
                  )}
                </DataItem>
                <DataItem label="Industry">{client.industry}</DataItem>
                <DataItem label="Website">
                  {client.website_url ? (
                    <a
                      href={client.website_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 text-accent hover:underline"
                    >
                      {client.website_url}
                      <ExternalLink
                        className="size-4"
                        aria-hidden="true"
                      />
                    </a>
                  ) : (
                    "Not provided"
                  )}
                </DataItem>
                <DataItem label="Created">
                  {formatClientDate(client.created_at)}
                </DataItem>
                <DataItem label="Last updated">
                  {formatClientDate(client.updated_at)}
                </DataItem>
                <div className="sm:col-span-2">
                  <DataItem label="Billing address">
                    <span className="whitespace-pre-wrap">
                      {client.billing_address}
                    </span>
                  </DataItem>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Internal notes</CardTitle>
              <CardDescription>
                Internal context stored on the client record.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm leading-7 text-text-secondary">
                {client.notes ?? "No internal notes have been added."}
              </p>
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>CRM source</CardTitle>
              <CardDescription>
                The original lead remains the historical sales record.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {client.sourceLead ? (
                <>
                  <p className="text-sm font-semibold text-foreground">
                    {client.sourceLead.fullName}
                  </p>
                  {client.sourceLead.businessName ? (
                    <p className="mt-1 text-sm text-text-muted">
                      {client.sourceLead.businessName}
                    </p>
                  ) : null}
                  <Link
                    href={`/admin/leads/${client.sourceLead.id}`}
                    className={buttonStyles({
                      variant: "secondary",
                      className: "mt-5 w-full",
                    })}
                  >
                    View source lead
                  </Link>
                </>
              ) : (
                <p className="text-sm leading-6 text-text-muted">
                  No source lead is linked to this client.
                </p>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
