import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/types/database";

type SupportTicketRow = {
  assigned_to: string | null;
  category: string | null;
  client_id: string;
  closed_at: string | null;
  created_at: string;
  created_by: string | null;
  description: string;
  id: string;
  organization_id: string;
  priority: string;
  project_id: string | null;
  resolution_note: string | null;
  resolved_at: string | null;
  status: string;
  ticket_number: string;
  title: string;
  updated_at: string;
};

type TicketActivityRow = {
  activity_type: string;
  created_at: string;
  created_by: string | null;
  description: string | null;
  id: string;
  metadata: Json;
  organization_id: string;
  ticket_id: string;
  title: string;
};

type SupportDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables" | "Functions"> & {
    Tables: Database["public"]["Tables"] & {
      support_tickets: {
        Row: SupportTicketRow;
        Insert: Partial<SupportTicketRow> & {
          client_id: string;
          description: string;
          organization_id: string;
          ticket_number: string;
          title: string;
        };
        Update: Partial<SupportTicketRow>;
        Relationships: [
          {
            foreignKeyName: "support_tickets_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "support_tickets_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "support_tickets_assigned_to_fkey";
            columns: ["assigned_to"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "support_tickets_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      ticket_activities: {
        Row: TicketActivityRow;
        Insert: Partial<TicketActivityRow> & {
          activity_type: string;
          organization_id: string;
          ticket_id: string;
          title: string;
        };
        Update: Partial<TicketActivityRow>;
        Relationships: [
          {
            foreignKeyName: "ticket_activities_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: Database["public"]["Functions"] & {
      create_internal_support_ticket: {
        Args: {
          p_category: string;
          p_description: string;
          p_priority: string;
          p_title: string;
          target_client_id: string;
          target_project_id?: string;
        };
        Returns: {
          created_at: string;
          id: string;
          ticket_number: string;
        }[];
      };
      transition_ticket_status: {
        Args: {
          p_new_status: string;
          p_resolution_note?: string;
          target_ticket_id: string;
        };
        Returns: { status: string }[];
      };
    };
  };
};

/**
 * Temporary additive schema view used only by the Phase 10 support module
 * while generated database types lag a verified remote migration. It keeps
 * table, relationship, and RPC names explicit instead of weakening the
 * repository-wide client to an untyped value.
 */
export function asSupportSupabaseClient(
  client: unknown,
): SupabaseClient<SupportDatabase> {
  return client as SupabaseClient<SupportDatabase>;
}
