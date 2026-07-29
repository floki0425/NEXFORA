import type { InternalRole } from "@/lib/auth/types";
import type { Database } from "@/types/database";

import type { ClientStatus } from "./constants";

export type ClientRow = Database["public"]["Tables"]["clients"]["Row"];
export type ClientInsert =
  Database["public"]["Tables"]["clients"]["Insert"];
export type ClientUpdate =
  Database["public"]["Tables"]["clients"]["Update"];

export interface ClientListItem extends Omit<ClientRow, "status"> {
  status: ClientStatus;
}

export interface ClientSourceLead {
  id: string;
  fullName: string;
  businessName: string | null;
}

export interface LeadConversionCandidate {
  id: string;
  fullName: string;
  businessName: string | null;
  email: string;
  phone: string | null;
  industry: string | null;
  status: string;
  convertedClientId: string | null;
}

export interface ClientDetail extends Omit<ClientRow, "status"> {
  status: ClientStatus;
  sourceLead: ClientSourceLead | null;
}

export interface ClientFilters {
  query: string;
  status: ClientStatus | "";
  page: number;
}

export interface ClientPageData {
  clients: ClientListItem[];
  total: number;
  page: number;
  pageCount: number;
}

export interface ClientAccessContext {
  organizationId: string;
  profileId: string;
  role: InternalRole;
  status: "active" | "inactive";
}

export interface ClientActionResult {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string[]>;
}
