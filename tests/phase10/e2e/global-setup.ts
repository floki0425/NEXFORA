import { writeFile } from "node:fs/promises";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

import phase8GlobalSetup from "../../phase8/e2e/global-setup";
import { readPhase8FixtureIds } from "../../phase8/e2e/fixture-ids";
import { getPhase10E2EConfig } from "../helpers/test-env.mjs";

const FIXTURE_IDS_PATH = path.join(
  process.cwd(),
  "tests/phase10/e2e/.e2e-fixture-ids.json",
);

export default async function globalSetup() {
  const config = getPhase10E2EConfig();
  if (!config) return;

  // Reuse the existing fixed identities without adding another active
  // organization/client membership to either profile.
  await phase8GlobalSetup();
  const fixtures = readPhase8FixtureIds();
  const admin = createClient(config.url, config.secretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  // This organization is reserved for automated E2E fixtures. Reset only
  // Phase 10 rows so two consecutive runs always start from the same state.
  const { error: usageDeleteError } = await admin
    .from("subscription_usage")
    .delete()
    .eq("organization_id", fixtures.organizationId);
  if (usageDeleteError) {
    throw new Error(`Failed to reset Phase 10 usage: ${usageDeleteError.message}`);
  }
  const { error: subscriptionDeleteError } = await admin
    .from("subscriptions")
    .delete()
    .eq("organization_id", fixtures.organizationId);
  if (subscriptionDeleteError) {
    throw new Error(
      `Failed to reset Phase 10 subscriptions: ${subscriptionDeleteError.message}`,
    );
  }
  const { error: activityDeleteError } = await admin
    .from("ticket_activities")
    .delete()
    .eq("organization_id", fixtures.organizationId);
  if (activityDeleteError) {
    throw new Error(
      `Failed to reset Phase 10 activities: ${activityDeleteError.message}`,
    );
  }
  const { error: ticketDeleteError } = await admin
    .from("support_tickets")
    .delete()
    .eq("organization_id", fixtures.organizationId);
  if (ticketDeleteError) {
    throw new Error(`Failed to reset Phase 10 tickets: ${ticketDeleteError.message}`);
  }

  // Cross-client sentinels must never appear while signed in as Client A.
  // Service-role setup is acceptable for fixtures; product behavior itself
  // is always exercised through real signed-in browser sessions.
  const year = new Date().getUTCFullYear();
  const uniqueSuffix = String(Date.now()).slice(-8);
  const { data: crossClientTicket, error: ticketError } = await admin
    .from("support_tickets")
    .insert({
      organization_id: fixtures.organizationId,
      client_id: fixtures.clientBId,
      project_id: fixtures.projectBId,
      ticket_number: `NXF-TKT-${year}-${uniqueSuffix}`,
      title: "Client B private support ticket",
      description: "Cross-client E2E sentinel.",
      priority: "low",
      status: "open",
    })
    .select("id")
    .single();
  if (ticketError || !crossClientTicket) {
    throw new Error(
      `Failed to create cross-client ticket sentinel: ${ticketError?.message}`,
    );
  }

  const { data: crossClientSubscription, error: subscriptionError } =
    await admin
      .from("subscriptions")
      .insert({
        organization_id: fixtures.organizationId,
        client_id: fixtures.clientBId,
        project_id: fixtures.projectBId,
        plan_name: "Client B private care plan",
        status: "active",
        billing_cycle: "monthly",
        amount: 1000,
        currency: "PHP",
        included_hours: 2,
      })
      .select("id")
      .single();
  if (subscriptionError || !crossClientSubscription) {
    throw new Error(
      `Failed to create cross-client subscription sentinel: ${subscriptionError?.message}`,
    );
  }

  await writeFile(
    FIXTURE_IDS_PATH,
    JSON.stringify(
      {
        ...fixtures,
        crossClientTicketId: crossClientTicket.id,
        crossClientSubscriptionId: crossClientSubscription.id,
      },
      null,
      2,
    ),
    "utf8",
  );
}
