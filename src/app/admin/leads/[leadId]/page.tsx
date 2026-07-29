import {
  ArrowLeft,
  BriefcaseBusiness,
  FileText,
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
import { canConvertLeadToClient } from "@/features/clients/permissions";
import { LeadNoteForm } from "@/features/leads/components/lead-note-form";
import { LeadStatusForm } from "@/features/leads/components/lead-status-form";
import {
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_BADGES,
  LEAD_STATUS_LABELS,
} from "@/features/leads/constants";
import { formatBudget, formatLeadDate } from "@/features/leads/format";
import { memberCanManageLeads } from "@/features/leads/permissions";
import { getLeadDetail } from "@/features/leads/queries";
import { leadIdSchema } from "@/features/leads/schemas";
import {
  isLeadEligibleForProposal,
  memberCanManageProposals,
} from "@/features/proposals/permissions";
import { requireInternalMember } from "@/lib/auth/server";

interface LeadPageProps {
  params: Promise<{ leadId: string }>;
}

export async function generateMetadata({
  params,
}: LeadPageProps): Promise<Metadata> {
  const { leadId } = await params;
  return {
    title: leadIdSchema.safeParse(leadId).success ? "Lead details" : "Lead not found",
  };
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
      <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className="mt-1.5 text-sm leading-6 text-foreground">{children || "Not provided"}</dd>
    </div>
  );
}

export default async function LeadDetailPage({ params }: LeadPageProps) {
  const { leadId } = await params;
  if (!leadIdSchema.safeParse(leadId).success) {
    notFound();
  }

  const member = await requireInternalMember();
  const lead = await getLeadDetail(member.organizationId, leadId);
  if (!lead) {
    notFound();
  }

  const canManage = memberCanManageLeads(member);
  const canConvert = canConvertLeadToClient(
    member.role,
    lead.status,
    lead.converted_client_id,
  );
  const canCreateProposal =
    memberCanManageProposals(member) && isLeadEligibleForProposal(lead.status);
  const requestedFeatures = Array.isArray(lead.requested_features)
    ? lead.requested_features.filter((value): value is string => typeof value === "string")
    : [];

  return (
    <div className="space-y-7">
      <Link href="/admin/leads" className="inline-flex items-center gap-2 text-sm font-medium text-text-secondary hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to leads
      </Link>
      <PageHeader
        eyebrow="Lead"
        title={lead.full_name}
        description={lead.business_name ?? lead.service_interest}
        action={
          canManage || lead.converted_client_id || canCreateProposal ? (
            <div className="flex flex-wrap gap-2">
              {canCreateProposal ? (
                <Link
                  href={`/admin/proposals/new?leadId=${lead.id}`}
                  className={buttonStyles({ variant: "secondary" })}
                >
                  <FileText className="size-4" aria-hidden="true" />
                  Create proposal
                </Link>
              ) : null}
              {lead.converted_client_id ? (
                <Link
                  href={`/admin/clients/${lead.converted_client_id}`}
                  className={buttonStyles()}
                >
                  <BriefcaseBusiness
                    className="size-4"
                    aria-hidden="true"
                  />
                  View client
                </Link>
              ) : canConvert ? (
                <Link
                  href={`/admin/leads/${lead.id}/convert`}
                  className={buttonStyles()}
                >
                  <BriefcaseBusiness
                    className="size-4"
                    aria-hidden="true"
                  />
                  Convert to client
                </Link>
              ) : null}
              {canManage ? (
                <Link
                  href={`/admin/leads/${lead.id}/edit`}
                  className={buttonStyles({ variant: "secondary" })}
                >
                  <Pencil className="size-4" aria-hidden="true" />
                  Edit lead
                </Link>
              ) : null}
            </div>
          ) : null
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-3">
                <CardTitle>Contact and qualification</CardTitle>
                <Badge variant={LEAD_STATUS_BADGES[lead.status]}>{LEAD_STATUS_LABELS[lead.status]}</Badge>
              </div>
              <CardDescription>Core inquiry details and commercial context.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-6 sm:grid-cols-2">
                <DataItem label="Email">
                  <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-2 text-accent hover:underline">
                    <Mail className="size-4" aria-hidden="true" />{lead.email}
                  </a>
                </DataItem>
                <DataItem label="Phone">
                  {lead.phone ? (
                    <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-2 text-accent hover:underline">
                      <Phone className="size-4" aria-hidden="true" />{lead.phone}
                    </a>
                  ) : "Not provided"}
                </DataItem>
                <DataItem label="Business">{lead.business_name}</DataItem>
                <DataItem label="Industry">{lead.industry}</DataItem>
                <DataItem label="Service interest">{lead.service_interest}</DataItem>
                <DataItem label="Budget">{formatBudget(lead.budget_min, lead.budget_max)}</DataItem>
                <DataItem label="Timeline">{lead.target_timeline}</DataItem>
                <DataItem label="Lead score">{lead.lead_score === null ? "Not scored" : `${lead.lead_score}/100`}</DataItem>
                <DataItem label="Source">
                  {LEAD_SOURCE_LABELS[lead.source]}{lead.source_detail ? ` — ${lead.source_detail}` : ""}
                </DataItem>
                <DataItem label="Assigned to">{lead.assigneeName ?? "Unassigned"}</DataItem>
                <DataItem label="Created">{formatLeadDate(lead.created_at)}</DataItem>
                <DataItem label="Last updated">{formatLeadDate(lead.updated_at)}</DataItem>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Project need</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Problem summary</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-text-secondary">
                  {lead.problem_summary ?? "No problem summary provided."}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Requested features</h3>
                {requestedFeatures.length ? (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {requestedFeatures.map((feature) => (
                      <li key={feature}><Badge>{feature}</Badge></li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-text-muted">No requested features provided.</p>
                )}
              </div>
              {lead.lost_reason ? (
                <div className="rounded-md border border-error/20 bg-error-soft p-4">
                  <h3 className="text-sm font-semibold text-error">Lost reason</h3>
                  <p className="mt-1 text-sm leading-6 text-text-secondary">{lead.lost_reason}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
              <CardDescription>Immutable notes and CRM events, newest first.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {canManage ? <LeadNoteForm leadId={lead.id} /> : null}
              {lead.activities.length ? (
                <ol className="space-y-4 border-t border-border pt-5">
                  {lead.activities.map((activity) => (
                    <li key={activity.id} className="relative border-l-2 border-border pl-4">
                      <div className="absolute -left-[5px] top-1.5 size-2 rounded-full bg-accent" />
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-sm font-semibold text-foreground">{activity.title}</p>
                        <time className="text-xs text-text-muted" dateTime={activity.created_at}>
                          {formatLeadDate(activity.created_at)}
                        </time>
                      </div>
                      {activity.description ? (
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-text-secondary">{activity.description}</p>
                      ) : null}
                      <p className="mt-1 text-xs text-text-muted">{activity.authorName ?? "Public inquiry"}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="border-t border-border pt-5 text-sm text-text-muted">No activity recorded yet.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6">
          {canManage ? (
            <Card>
              <CardHeader>
                <CardTitle>Pipeline status</CardTitle>
                <CardDescription>Record each status transition in the activity timeline.</CardDescription>
              </CardHeader>
              <CardContent>
                <LeadStatusForm
                  leadId={lead.id}
                  currentStatus={lead.status}
                  currentLostReason={lead.lost_reason}
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent>
                <p className="text-sm leading-6 text-text-secondary">
                  You have read-only access to CRM records. An administrator can update this lead.
                </p>
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
