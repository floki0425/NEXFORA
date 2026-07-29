import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  PROPOSAL_STATUS_BADGES,
  PROPOSAL_STATUS_LABELS,
  type ProposalStatus,
} from "../constants";
import { formatMoney, formatProposalDay } from "../format";

export interface ProposalDocumentItem {
  name: string;
  description: string | null;
  quantity: number;
  unit_price: number;
}

export interface ProposalDocumentData {
  proposalNumber: string | null;
  title: string;
  summary: string | null;
  scope: string | null;
  deliverables: unknown;
  timelineText: string | null;
  paymentTermsText: string | null;
  termsText: string | null;
  currency: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  validUntil: string | null;
  status: ProposalStatus;
  items: ProposalDocumentItem[];
  recipientLabel?: string | null;
}

function deliverablesList(deliverables: unknown): string[] {
  return Array.isArray(deliverables)
    ? deliverables.filter((value): value is string => typeof value === "string")
    : [];
}

/**
 * Renders the exact business content a client sees on the secure proposal
 * link. Reused by the internal preview page so the two can never drift
 * apart. This component never mutates proposal state.
 */
export function ProposalDocument({ proposal }: { proposal: ProposalDocumentData }) {
  const deliverables = deliverablesList(proposal.deliverables);

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="bg-nexfora-black px-6 py-5 sm:px-8">
          <span className="text-sm font-semibold tracking-wide text-white">NEXFORA</span>
        </div>
        <CardContent className="space-y-6 p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              {proposal.proposalNumber ? (
                <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                  {proposal.proposalNumber}
                </p>
              ) : null}
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                {proposal.title}
              </h1>
              {proposal.recipientLabel ? (
                <p className="mt-1 text-sm text-text-secondary">
                  Prepared for {proposal.recipientLabel}
                </p>
              ) : null}
            </div>
            <Badge variant={PROPOSAL_STATUS_BADGES[proposal.status]}>
              {PROPOSAL_STATUS_LABELS[proposal.status]}
            </Badge>
          </div>

          {proposal.summary ? (
            <section>
              <h2 className="text-sm font-semibold text-foreground">Overview</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-text-secondary">
                {proposal.summary}
              </p>
            </section>
          ) : null}

          {proposal.scope ? (
            <section>
              <h2 className="text-sm font-semibold text-foreground">Scope and solution</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-text-secondary">
                {proposal.scope}
              </p>
            </section>
          ) : null}

          {deliverables.length ? (
            <section>
              <h2 className="text-sm font-semibold text-foreground">Deliverables</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {deliverables.map((deliverable) => (
                  <li key={deliverable}>
                    <Badge>{deliverable}</Badge>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {proposal.timelineText ? (
            <section>
              <h2 className="text-sm font-semibold text-foreground">Timeline</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-text-secondary">
                {proposal.timelineText}
              </p>
            </section>
          ) : null}

          <section>
            <h2 className="text-sm font-semibold text-foreground">Investment</h2>
            {proposal.items.length ? (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Proposal line items</caption>
                  <thead className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
                    <tr>
                      <th scope="col" className="py-2 pr-3 font-semibold">Item</th>
                      <th scope="col" className="py-2 pr-3 font-semibold">Qty</th>
                      <th scope="col" className="py-2 pr-3 font-semibold">Unit price</th>
                      <th scope="col" className="py-2 font-semibold">Line total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {proposal.items.map((item) => (
                      <tr key={item.name}>
                        <td className="py-3 pr-3">
                          <p className="font-medium text-foreground">{item.name}</p>
                          {item.description ? (
                            <p className="mt-1 text-xs text-text-muted">{item.description}</p>
                          ) : null}
                        </td>
                        <td className="py-3 pr-3 text-text-secondary">{item.quantity}</td>
                        <td className="py-3 pr-3 text-text-secondary">
                          {formatMoney(item.unit_price, proposal.currency)}
                        </td>
                        <td className="py-3 font-medium text-foreground">
                          {formatMoney(item.quantity * item.unit_price, proposal.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-2 text-sm text-text-muted">No line items yet.</p>
            )}
            <dl className="ml-auto mt-5 max-w-xs space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-text-secondary">Subtotal</dt>
                <dd className="font-medium text-foreground">
                  {formatMoney(proposal.subtotal, proposal.currency)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-secondary">Discount</dt>
                <dd className="font-medium text-foreground">
                  -{formatMoney(proposal.discount, proposal.currency)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-secondary">Tax</dt>
                <dd className="font-medium text-foreground">
                  {formatMoney(proposal.tax, proposal.currency)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-border pt-2 text-base">
                <dt className="font-semibold text-foreground">Total</dt>
                <dd className="font-semibold text-foreground">
                  {formatMoney(proposal.total, proposal.currency)}
                </dd>
              </div>
            </dl>
          </section>

          {proposal.paymentTermsText ? (
            <section>
              <h2 className="text-sm font-semibold text-foreground">Payment terms</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-text-secondary">
                {proposal.paymentTermsText}
              </p>
            </section>
          ) : null}

          {proposal.termsText ? (
            <section>
              <h2 className="text-sm font-semibold text-foreground">Terms and conditions</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-text-secondary">
                {proposal.termsText}
              </p>
            </section>
          ) : null}

          <p className="text-sm text-text-muted">
            Valid until {formatProposalDay(proposal.validUntil)}.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
