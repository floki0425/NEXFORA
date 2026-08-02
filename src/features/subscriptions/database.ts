import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export type SubscriptionRow = {
  id: string;
  organization_id: string;
  client_id: string;
  project_id: string | null;
  plan_name: string;
  status: string;
  billing_cycle: string;
  amount: number;
  currency: string;
  included_hours: number | null;
  notes: string | null;
  started_at: string | null;
  renewal_at: string | null;
  cancelled_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SubscriptionInsert = {
  id?: string;
  organization_id: string;
  client_id: string;
  project_id?: string | null;
  plan_name: string;
  status?: string;
  billing_cycle: string;
  amount?: number;
  currency?: string;
  included_hours?: number | null;
  notes?: string | null;
  started_at?: string | null;
  renewal_at?: string | null;
  cancelled_at?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type SubscriptionUpdate = {
  plan_name?: string;
  status?: string;
  billing_cycle?: string;
  amount?: number;
  currency?: string;
  included_hours?: number | null;
  notes?: string | null;
  started_at?: string | null;
  renewal_at?: string | null;
  cancelled_at?: string | null;
};

export type SubscriptionUsageRow = {
  id: string;
  organization_id: string;
  subscription_id: string;
  description: string;
  hours_used: number;
  usage_date: string;
  recorded_by: string | null;
  created_at: string;
};

export type SubscriptionUsageInsert = {
  id?: string;
  organization_id: string;
  subscription_id: string;
  description: string;
  hours_used: number;
  usage_date: string;
  recorded_by?: string | null;
  created_at?: string;
};

interface SubscriptionTable {
  Row: SubscriptionRow;
  Insert: SubscriptionInsert;
  Update: SubscriptionUpdate;
  Relationships: [];
}

interface SubscriptionUsageTable {
  Row: SubscriptionUsageRow;
  Insert: SubscriptionUsageInsert;
  Update: Record<string, never>;
  Relationships: [];
}

export type ClientSubscriptionRpcRow = {
  id: string;
  plan_name: string;
  status: string;
  billing_cycle: string;
  amount: number;
  currency: string;
  included_hours: number | null;
  used_hours: number;
  remaining_hours: number | null;
  project_id: string | null;
  started_at: string | null;
  renewal_at: string | null;
  cancelled_at: string | null;
  created_at: string;
};

export type ClientSubscriptionUsageRpcRow = {
  id: string;
  description: string;
  hours_used: number;
  usage_date: string;
  created_at: string;
};

type Phase10Database = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables" | "Functions"> & {
    Tables: Omit<
      Database["public"]["Tables"],
      "subscriptions" | "subscription_usage"
    > & {
      subscriptions: SubscriptionTable;
      subscription_usage: SubscriptionUsageTable;
    };
    Functions: Omit<
      Database["public"]["Functions"],
      | "get_client_subscription"
      | "get_client_subscriptions"
      | "get_client_subscription_usage"
    > & {
      get_client_subscription: {
        Args: { target_subscription_id: string };
        Returns: ClientSubscriptionRpcRow[];
      };
      get_client_subscriptions: {
        Args: never;
        Returns: ClientSubscriptionRpcRow[];
      };
      get_client_subscription_usage: {
        Args: { target_subscription_id: string };
        Returns: ClientSubscriptionUsageRpcRow[];
      };
    };
  };
};

/**
 * Temporary narrow bridge for the already-applied Phase 10 schema. It can be
 * removed once the repository-wide generated Database type includes these
 * two tables and RPCs. Runtime behavior remains the normal authenticated
 * server client; this does not bypass RLS or authorization.
 */
export async function createSubscriptionClient(): Promise<
  SupabaseClient<Phase10Database>
> {
  return (await createClient()) as unknown as SupabaseClient<Phase10Database>;
}
