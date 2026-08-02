export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      client_invitations: {
        Row: {
          accepted_at: string | null
          client_id: string
          created_at: string
          created_by: string | null
          email: string
          expires_at: string
          id: string
          role: string
          status: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          email: string
          expires_at: string
          id?: string
          role?: string
          status?: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          email?: string
          expires_at?: string
          id?: string
          role?: string
          status?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_invitations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_invitations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_users: {
        Row: {
          client_id: string
          created_at: string
          id: string
          role: string
          status: string
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          role?: string
          status?: string
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          role?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_users_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          billing_address: string | null
          business_name: string
          contact_name: string
          created_at: string
          email: string
          id: string
          industry: string | null
          notes: string | null
          organization_id: string
          phone: string | null
          source_lead_id: string | null
          status: string
          updated_at: string
          website_url: string | null
        }
        Insert: {
          billing_address?: string | null
          business_name: string
          contact_name: string
          created_at?: string
          email: string
          id?: string
          industry?: string | null
          notes?: string | null
          organization_id: string
          phone?: string | null
          source_lead_id?: string | null
          status?: string
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          billing_address?: string | null
          business_name?: string
          contact_name?: string
          created_at?: string
          email?: string
          id?: string
          industry?: string | null
          notes?: string | null
          organization_id?: string
          phone?: string | null
          source_lead_id?: string | null
          status?: string
          updated_at?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_source_lead_id_fkey"
            columns: ["source_lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          created_at: string
          description: string
          id: string
          invoice_id: string
          line_total: number | null
          quantity: number
          sort_order: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          line_total?: number | null
          quantity?: number
          sort_order?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          line_total?: number | null
          quantity?: number
          sort_order?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_paid: number
          balance_due: number | null
          client_id: string
          created_at: string
          created_by: string | null
          currency: string
          discount: number
          due_date: string | null
          id: string
          invoice_number: string | null
          issue_date: string | null
          notes: string | null
          organization_id: string
          paid_at: string | null
          project_id: string | null
          sent_at: string | null
          status: string
          subtotal: number
          tax: number
          total: number
          updated_at: string
          viewed_at: string | null
          voided_at: string | null
        }
        Insert: {
          amount_paid?: number
          balance_due?: number | null
          client_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          discount?: number
          due_date?: string | null
          id?: string
          invoice_number?: string | null
          issue_date?: string | null
          notes?: string | null
          organization_id: string
          paid_at?: string | null
          project_id?: string | null
          sent_at?: string | null
          status?: string
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
          viewed_at?: string | null
          voided_at?: string | null
        }
        Update: {
          amount_paid?: number
          balance_due?: number | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          discount?: number
          due_date?: string | null
          id?: string
          invoice_number?: string | null
          issue_date?: string | null
          notes?: string | null
          organization_id?: string
          paid_at?: string | null
          project_id?: string | null
          sent_at?: string | null
          status?: string
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
          viewed_at?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_project_org_client_fkey"
            columns: ["project_id", "organization_id", "client_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id", "client_id"]
          },
        ]
      }
      lead_activities: {
        Row: {
          activity_type: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          lead_id: string
          metadata: Json
          organization_id: string
          title: string
        }
        Insert: {
          activity_type: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          lead_id: string
          metadata?: Json
          organization_id: string
          title: string
        }
        Update: {
          activity_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          lead_id?: string
          metadata?: Json
          organization_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_to: string | null
          budget_max: number | null
          budget_min: number | null
          business_name: string | null
          converted_at: string | null
          converted_client_id: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          industry: string | null
          lead_score: number | null
          lost_reason: string | null
          organization_id: string
          phone: string | null
          problem_summary: string | null
          requested_features: Json
          service_interest: string
          source: string
          source_detail: string | null
          status: string
          target_timeline: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          budget_max?: number | null
          budget_min?: number | null
          business_name?: string | null
          converted_at?: string | null
          converted_client_id?: string | null
          created_at?: string
          email: string
          full_name: string
          id?: string
          industry?: string | null
          lead_score?: number | null
          lost_reason?: string | null
          organization_id: string
          phone?: string | null
          problem_summary?: string | null
          requested_features?: Json
          service_interest: string
          source: string
          source_detail?: string | null
          status?: string
          target_timeline?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          budget_max?: number | null
          budget_min?: number | null
          business_name?: string | null
          converted_at?: string | null
          converted_client_id?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          industry?: string | null
          lead_score?: number | null
          lost_reason?: string | null
          organization_id?: string
          phone?: string | null
          problem_summary?: string | null
          requested_features?: Json
          service_interest?: string
          source?: string
          source_detail?: string | null
          status?: string
          target_timeline?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_converted_client_id_fkey"
            columns: ["converted_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      milestones: {
        Row: {
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          project_id: string
          sort_order: number
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          project_id: string
          sort_order?: number
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          project_id?: string
          sort_order?: number
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          logo_url: string | null
          name: string
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          client_id: string
          created_at: string
          currency: string
          id: string
          idempotency_key: string | null
          invoice_id: string
          metadata: Json
          notes: string | null
          organization_id: string
          paid_at: string | null
          payment_method: string | null
          provider: string
          provider_event_id: string | null
          provider_reference: string | null
          recorded_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          client_id: string
          created_at?: string
          currency?: string
          id?: string
          idempotency_key?: string | null
          invoice_id: string
          metadata?: Json
          notes?: string | null
          organization_id: string
          paid_at?: string | null
          payment_method?: string | null
          provider?: string
          provider_event_id?: string | null
          provider_reference?: string | null
          recorded_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          client_id?: string
          created_at?: string
          currency?: string
          id?: string
          idempotency_key?: string | null
          invoice_id?: string
          metadata?: Json
          notes?: string | null
          organization_id?: string
          paid_at?: string | null
          payment_method?: string | null
          provider?: string
          provider_event_id?: string | null
          provider_reference?: string | null
          recorded_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_org_client_fkey"
            columns: ["invoice_id", "organization_id", "client_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id", "organization_id", "client_id"]
          },
          {
            foreignKeyName: "payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          auth_user_id: string
          avatar_url: string | null
          created_at: string
          full_name: string
          id: string
          phone: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          auth_user_id: string
          avatar_url?: string | null
          created_at?: string
          full_name: string
          id?: string
          phone?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          auth_user_id?: string
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_files: {
        Row: {
          category: string | null
          client_id: string
          created_at: string
          file_name: string
          file_size: number | null
          id: string
          mime_type: string | null
          organization_id: string
          project_id: string
          storage_path: string
          uploaded_by: string | null
          visibility: string
        }
        Insert: {
          category?: string | null
          client_id: string
          created_at?: string
          file_name: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          organization_id: string
          project_id: string
          storage_path: string
          uploaded_by?: string | null
          visibility?: string
        }
        Update: {
          category?: string | null
          client_id?: string
          created_at?: string
          file_name?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          organization_id?: string
          project_id?: string
          storage_path?: string
          uploaded_by?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_files_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_files_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_files_project_org_client_fkey"
            columns: ["project_id", "organization_id", "client_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id", "client_id"]
          },
          {
            foreignKeyName: "project_files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          created_at: string
          id: string
          project_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          client_id: string
          completed_at: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          organization_id: string
          priority: string
          progress_percent: number
          project_manager_id: string | null
          slug: string | null
          start_date: string | null
          status: string
          target_date: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          organization_id: string
          priority?: string
          progress_percent?: number
          project_manager_id?: string | null
          slug?: string | null
          start_date?: string | null
          status?: string
          target_date?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          priority?: string
          progress_percent?: number
          project_manager_id?: string | null
          slug?: string | null
          start_date?: string | null
          status?: string
          target_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_client_organization_fkey"
            columns: ["client_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_project_manager_id_fkey"
            columns: ["project_manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_access_tokens: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          proposal_id: string
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          proposal_id: string
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          proposal_id?: string
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_access_tokens_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_items: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          proposal_id: string
          quantity: number
          sort_order: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          proposal_id: string
          quantity?: number
          sort_order?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          proposal_id?: string
          quantity?: number
          sort_order?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposal_items_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_versions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          proposal_id: string
          snapshot: Json
          version_number: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          proposal_id: string
          snapshot: Json
          version_number: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          proposal_id?: string
          snapshot?: Json
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposal_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_versions_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposals: {
        Row: {
          accepted_at: string | null
          client_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          declined_at: string | null
          deliverables: Json
          discount: number
          id: string
          lead_id: string | null
          organization_id: string
          payment_terms_text: string | null
          proposal_number: string | null
          requested_changes_message: string | null
          scope: string | null
          sent_at: string | null
          status: string
          subtotal: number
          summary: string | null
          tax: number
          terms_text: string | null
          timeline_text: string | null
          title: string
          total: number
          updated_at: string
          valid_until: string | null
          viewed_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          declined_at?: string | null
          deliverables?: Json
          discount?: number
          id?: string
          lead_id?: string | null
          organization_id: string
          payment_terms_text?: string | null
          proposal_number?: string | null
          requested_changes_message?: string | null
          scope?: string | null
          sent_at?: string | null
          status?: string
          subtotal?: number
          summary?: string | null
          tax?: number
          terms_text?: string | null
          timeline_text?: string | null
          title: string
          total?: number
          updated_at?: string
          valid_until?: string | null
          viewed_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          declined_at?: string | null
          deliverables?: Json
          discount?: number
          id?: string
          lead_id?: string | null
          organization_id?: string
          payment_terms_text?: string | null
          proposal_number?: string | null
          requested_changes_message?: string | null
          scope?: string | null
          sent_at?: string | null
          status?: string
          subtotal?: number
          summary?: string | null
          tax?: number
          terms_text?: string | null
          timeline_text?: string | null
          title?: string
          total?: number
          updated_at?: string
          valid_until?: string | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      revision_activities: {
        Row: {
          activity_type: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          metadata: Json
          organization_id: string
          revision_id: string
          title: string
        }
        Insert: {
          activity_type: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          metadata?: Json
          organization_id: string
          revision_id: string
          title: string
        }
        Update: {
          activity_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          metadata?: Json
          organization_id?: string
          revision_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "revision_activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revision_activities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revision_activities_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      revisions: {
        Row: {
          assigned_to: string | null
          attachment_file_id: string | null
          client_id: string
          created_at: string
          description: string
          id: string
          organization_id: string
          page_name: string | null
          priority: string
          project_id: string
          resolved_at: string | null
          section_name: string | null
          status: string
          submitted_by: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          attachment_file_id?: string | null
          client_id: string
          created_at?: string
          description: string
          id?: string
          organization_id: string
          page_name?: string | null
          priority?: string
          project_id: string
          resolved_at?: string | null
          section_name?: string | null
          status?: string
          submitted_by?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          attachment_file_id?: string | null
          client_id?: string
          created_at?: string
          description?: string
          id?: string
          organization_id?: string
          page_name?: string | null
          priority?: string
          project_id?: string
          resolved_at?: string | null
          section_name?: string | null
          status?: string
          submitted_by?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "revisions_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revisions_attachment_file_id_fkey"
            columns: ["attachment_file_id"]
            isOneToOne: false
            referencedRelation: "project_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revisions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revisions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revisions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revisions_project_org_client_fkey"
            columns: ["project_id", "organization_id", "client_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id", "client_id"]
          },
          {
            foreignKeyName: "revisions_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          milestone_id: string | null
          priority: string
          project_id: string
          sort_order: number
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          milestone_id?: string | null
          priority?: string
          project_id: string
          sort_order?: number
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          milestone_id?: string | null
          priority?: string
          project_id?: string
          sort_order?: number
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_milestone_project_fkey"
            columns: ["milestone_id", "project_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_client_invitation: {
        Args: { p_token_hash: string }
        Returns: Json
      }
      accept_proposal_by_token: {
        Args: { p_token_hash: string }
        Returns: Json
      }
      approve_revision: {
        Args: { target_revision_id: string }
        Returns: {
          already_approved: boolean
          status: string
        }[]
      }
      convert_lead_to_client: {
        Args: { target_lead_id: string }
        Returns: {
          client_id: string
          created_new: boolean
        }[]
      }
      create_client_project_file: {
        Args: {
          p_category: string
          p_file_name: string
          p_file_size: number
          p_mime_type: string
          p_storage_path: string
          target_project_id: string
        }
        Returns: {
          created_at: string
          id: string
        }[]
      }
      create_client_revision: {
        Args: {
          p_attachment_file_id?: string
          p_description: string
          p_page_name: string
          p_priority: string
          p_section_name: string
          p_title: string
          target_project_id: string
        }
        Returns: {
          created_at: string
          id: string
        }[]
      }
      create_internal_project_file: {
        Args: {
          p_category: string
          p_file_name: string
          p_file_size: number
          p_mime_type: string
          p_storage_path: string
          p_visibility: string
          target_project_id: string
        }
        Returns: {
          created_at: string
          id: string
        }[]
      }
      create_or_resend_client_invitation: {
        Args: {
          p_email: string
          p_expires_at: string
          p_role: string
          p_token_hash: string
          target_client_id: string
        }
        Returns: {
          created_new: boolean
          invitation_id: string
        }[]
      }
      decline_proposal_by_token: {
        Args: { p_token_hash: string }
        Returns: Json
      }
      get_active_client_membership: {
        Args: never
        Returns: {
          business_name: string
          client_id: string
          client_role: string
          client_status: string
        }[]
      }
      get_client_file_for_download: {
        Args: { target_file_id: string }
        Returns: {
          file_name: string
          storage_path: string
        }[]
      }
      get_client_invitation_by_token: {
        Args: { p_token_hash: string }
        Returns: Json
      }
      get_client_invoice_detail: {
        Args: { target_invoice_id: string }
        Returns: Json
      }
      get_client_invoices: {
        Args: never
        Returns: {
          amount_paid: number
          balance_due: number
          created_at: string
          currency: string
          discount: number
          due_date: string
          id: string
          invoice_number: string
          issue_date: string
          paid_at: string
          sent_at: string
          status: string
          subtotal: number
          tax: number
          total: number
        }[]
      }
      get_client_project_detail: {
        Args: { target_project_id: string }
        Returns: Json
      }
      get_client_project_files: {
        Args: { target_project_id: string }
        Returns: {
          category: string
          created_at: string
          file_name: string
          file_size: number
          id: string
          mime_type: string
        }[]
      }
      get_client_project_organization_id: {
        Args: { target_project_id: string }
        Returns: string
      }
      get_client_projects: {
        Args: never
        Returns: {
          id: string
          name: string
          priority: string
          progress_percent: number
          start_date: string
          status: string
          target_date: string
          updated_at: string
        }[]
      }
      get_client_revision_activities: {
        Args: { target_revision_id: string }
        Returns: {
          activity_type: string
          created_at: string
          description: string
          title: string
        }[]
      }
      get_client_revisions: {
        Args: { target_project_id: string }
        Returns: {
          attachment_file_id: string
          created_at: string
          description: string
          id: string
          page_name: string
          priority: string
          resolved_at: string
          section_name: string
          status: string
          title: string
          updated_at: string
        }[]
      }
      reconcile_paymongo_webhook_event: {
        Args: {
          p_amount: number
          p_currency: string
          p_event_status: string
          p_provider_event_id: string
          p_provider_reference: string
        }
        Returns: {
          outcome: string
        }[]
      }
      record_manual_payment: {
        Args: {
          p_amount: number
          p_idempotency_key: string
          p_notes: string
          p_paid_date: string
          p_payment_method: string
          p_provider_reference: string
          target_invoice_id: string
        }
        Returns: {
          balance_due: number
          invoice_status: string
          payment_id: string
        }[]
      }
      refresh_overdue_invoices: { Args: never; Returns: undefined }
      reissue_proposal_access_token: {
        Args: {
          p_token_expires_at: string
          p_token_hash: string
          target_proposal_id: string
        }
        Returns: undefined
      }
      request_proposal_changes_by_token: {
        Args: { p_message: string; p_token_hash: string }
        Returns: Json
      }
      request_revision_changes: {
        Args: { p_comment: string; target_revision_id: string }
        Returns: {
          status: string
        }[]
      }
      revoke_client_invitation: {
        Args: { target_invitation_id: string }
        Returns: undefined
      }
      send_invoice: {
        Args: { target_invoice_id: string }
        Returns: {
          invoice_number: string
          issue_date: string
        }[]
      }
      send_proposal: {
        Args: {
          p_token_expires_at: string
          p_token_hash: string
          target_proposal_id: string
        }
        Returns: {
          proposal_number: string
          version_number: number
        }[]
      }
      start_paymongo_checkout: {
        Args: {
          p_amount: number
          p_checkout_url: string
          p_currency: string
          p_provider_reference: string
          target_invoice_id: string
        }
        Returns: {
          payment_id: string
        }[]
      }
      submit_project_inquiry: {
        Args: {
          inquiry_budget_max?: number
          inquiry_budget_min?: number
          inquiry_business_name: string
          inquiry_email: string
          inquiry_full_name: string
          inquiry_industry: string
          inquiry_phone: string
          inquiry_problem_summary: string
          inquiry_requested_features: Json
          inquiry_service_interest: string
          inquiry_target_timeline: string
        }
        Returns: boolean
      }
      transition_revision_status: {
        Args: { p_new_status: string; target_revision_id: string }
        Returns: {
          status: string
        }[]
      }
      view_proposal_by_token: { Args: { p_token_hash: string }; Returns: Json }
      void_invoice: {
        Args: { target_invoice_id: string }
        Returns: {
          status: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
