import type { InternalRole } from "@/lib/auth/types";
import type { Database } from "@/types/database";

import type { ProposalStatus } from "./constants";

export type ProposalRow = Database["public"]["Tables"]["proposals"]["Row"];
export type ProposalInsert =
  Database["public"]["Tables"]["proposals"]["Insert"];
export type ProposalUpdate =
  Database["public"]["Tables"]["proposals"]["Update"];

export type ProposalItemRow =
  Database["public"]["Tables"]["proposal_items"]["Row"];
export type ProposalItemInsert =
  Database["public"]["Tables"]["proposal_items"]["Insert"];
export type ProposalItemUpdate =
  Database["public"]["Tables"]["proposal_items"]["Update"];

export type ProposalVersionRow =
  Database["public"]["Tables"]["proposal_versions"]["Row"];

export interface ProposalListItem
  extends Omit<ProposalRow, "status"> {
  status: ProposalStatus;
  leadName: string | null;
  clientName: string | null;
}

export interface ProposalDetail
  extends Omit<ProposalRow, "status"> {
  status: ProposalStatus;
  leadName: string | null;
  clientName: string | null;
  items: ProposalItemRow[];
  versions: ProposalVersionRow[];
}

export interface LeadProposalCandidate {
  id: string;
  fullName: string;
  businessName: string | null;
  email: string;
  serviceInterest: string;
  problemSummary: string | null;
  status: string;
}

export interface ProposalFilters {
  query: string;
  status: ProposalStatus | "";
  page: number;
}

export interface ProposalPageData {
  proposals: ProposalListItem[];
  total: number;
  page: number;
  pageCount: number;
}

export interface ProposalAccessContext {
  organizationId: string;
  profileId: string;
  role: InternalRole;
  status: "active" | "inactive";
}

export interface ProposalActionResult {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string[]>;
  proposalId?: string;
}

/**
 * Shape returned by both attachment download actions — the internal one keyed
 * by proposal id, and the token-gated client one. Structurally identical to
 * the files feature's DownloadUrlResult so the shared download button can
 * accept either without knowing which context it is in.
 */
export interface ProposalAttachmentDownloadResult {
  ok: boolean;
  message: string;
  url?: string;
  fileName?: string;
}

/** Attachment metadata as rendered by ProposalDocument in both contexts. */
export interface ProposalAttachmentSummary {
  fileName: string;
  fileSize: number | null;
}

export interface ClientProposalItemView {
  name: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  sort_order: number;
}

export interface ClientProposalView {
  id: string;
  proposal_number: string | null;
  title: string;
  summary: string | null;
  scope: string | null;
  deliverables: unknown;
  timeline_text: string | null;
  payment_terms_text: string | null;
  terms_text: string | null;
  currency: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  valid_until: string | null;
  status: ProposalStatus;
  sent_at: string | null;
  // Presence hints only. The storage path is never sent to the client on page
  // load — it is resolved at download time by
  // get_proposal_attachment_by_token.
  attachment_file_name: string | null;
  attachment_file_size: number | null;
  items: ClientProposalItemView[];
}

export interface ClientProposalActionResult {
  ok: boolean;
  message: string;
  status?: ProposalStatus;
}
