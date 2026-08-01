// Phase 9 test-data factory and cleanup, for integration tests only.
//
// Uses the service-role TEST admin client to set up fixtures directly
// (organizations, profiles, memberships, clients, projects) — this is test
// *setup*, not the behavior under test. Every actual Phase 9 assertion in
// tests/phase9/integration/ authenticates as one of the returned test users
// and exercises the real RLS/RPC path, never the admin client.
//
// Mirrors tests/phase8/helpers/factory.mjs's exact shape (two organizations,
// each with one internal admin and one client-owner user, plus one project)
// trimmed to what invoices/payments actually need — no project manager,
// team member, or file/revision fixtures.

import { testRunId } from "../../phase8/helpers/test-env.mjs";

const TEST_PASSWORD_PREFIX = "Phase9Test!";

function testPassword(runId) {
  return `${TEST_PASSWORD_PREFIX}${runId}Aa1`;
}

async function createAuthUserWithProfile(admin, { runId, label, fullName }) {
  const email = `phase9-${label}-${runId}@example.com`;
  const password = testPassword(runId);

  const { data: createdUser, error: createError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (createError || !createdUser?.user) {
    throw new Error(
      `Failed to create test auth user "${label}": ${createError?.message}`,
    );
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .insert({ auth_user_id: createdUser.user.id, full_name: fullName })
    .select("id, auth_user_id")
    .single();

  if (profileError || !profile) {
    throw new Error(
      `Failed to create profile for test user "${label}": ${profileError?.message}`,
    );
  }

  return {
    label,
    email,
    password,
    authUserId: createdUser.user.id,
    profileId: profile.id,
  };
}

/**
 * Builds the Phase 9 fixture set: two organizations, each with one internal
 * admin, one client (with an owner and a viewer portal user), and one
 * project linked to that client. Organization/client B exists purely for
 * cross-tenant isolation assertions.
 */
export async function createPhase9Fixtures(admin) {
  const runId = testRunId();

  const { data: orgA, error: orgAError } = await admin
    .from("organizations")
    .insert({ name: `Phase9 Org A ${runId}`, slug: `phase9-org-a-${runId}` })
    .select("id")
    .single();
  if (orgAError || !orgA) {
    throw new Error(`Failed to create Organization A: ${orgAError?.message}`);
  }

  const { data: orgB, error: orgBError } = await admin
    .from("organizations")
    .insert({ name: `Phase9 Org B ${runId}`, slug: `phase9-org-b-${runId}` })
    .select("id")
    .single();
  if (orgBError || !orgB) {
    throw new Error(`Failed to create Organization B: ${orgBError?.message}`);
  }

  const [internalAdmin, projectManager, clientAOwner, clientAViewer, clientBOwner] =
    await Promise.all([
      createAuthUserWithProfile(admin, { runId, label: "internal-admin", fullName: "Internal Admin" }),
      createAuthUserWithProfile(admin, { runId, label: "project-manager", fullName: "Project Manager" }),
      createAuthUserWithProfile(admin, { runId, label: "client-a-owner", fullName: "Client A Owner" }),
      createAuthUserWithProfile(admin, { runId, label: "client-a-viewer", fullName: "Client A Viewer" }),
      createAuthUserWithProfile(admin, { runId, label: "client-b-owner", fullName: "Client B Owner" }),
    ]);

  const { error: membersError } = await admin.from("organization_members").insert([
    { organization_id: orgA.id, user_id: internalAdmin.profileId, role: "admin", status: "active" },
    { organization_id: orgA.id, user_id: projectManager.profileId, role: "project_manager", status: "active" },
  ]);
  if (membersError) {
    throw new Error(`Failed to create organization_members: ${membersError.message}`);
  }

  const { data: clientA, error: clientAError } = await admin
    .from("clients")
    .insert({
      organization_id: orgA.id,
      business_name: `Phase9 Client A ${runId}`,
      contact_name: "Client A Contact",
      email: `phase9-client-a-${runId}@example.com`,
    })
    .select("id, organization_id")
    .single();
  if (clientAError || !clientA) {
    throw new Error(`Failed to create Client A: ${clientAError?.message}`);
  }

  const { data: clientB, error: clientBError } = await admin
    .from("clients")
    .insert({
      organization_id: orgB.id,
      business_name: `Phase9 Client B ${runId}`,
      contact_name: "Client B Contact",
      email: `phase9-client-b-${runId}@example.com`,
    })
    .select("id, organization_id")
    .single();
  if (clientBError || !clientB) {
    throw new Error(`Failed to create Client B: ${clientBError?.message}`);
  }

  const { error: clientUsersError } = await admin.from("client_users").insert([
    { client_id: clientA.id, user_id: clientAOwner.profileId, role: "owner", status: "active" },
    { client_id: clientA.id, user_id: clientAViewer.profileId, role: "viewer", status: "active" },
    { client_id: clientB.id, user_id: clientBOwner.profileId, role: "owner", status: "active" },
  ]);
  if (clientUsersError) {
    throw new Error(`Failed to create client_users: ${clientUsersError.message}`);
  }

  const { data: projectA, error: projectAError } = await admin
    .from("projects")
    .insert({
      organization_id: orgA.id,
      client_id: clientA.id,
      name: `Phase9 Project A ${runId}`,
    })
    .select("id, organization_id, client_id")
    .single();
  if (projectAError || !projectA) {
    throw new Error(`Failed to create Project A: ${projectAError?.message}`);
  }

  return {
    runId,
    orgA,
    orgB,
    internalAdmin,
    projectManager,
    clientAOwner,
    clientAViewer,
    clientBOwner,
    clientA,
    clientB,
    projectA,
  };
}

/**
 * Creates a draft invoice for Client A / Organization A as the given
 * authenticated client (normally the internal admin). Throws with the real
 * Postgres error message on failure instead of silently returning
 * undefined/null — every integration test's before() hook relies on this
 * failing loudly (e.g. "relation does not exist" before the Phase 9
 * migration has been applied) rather than crashing later with an opaque
 * "Cannot read properties of null".
 */
export async function createDraftInvoice(client, fixtures, overrides = {}) {
  const { data, error } = await client
    .from("invoices")
    .insert({
      organization_id: fixtures.orgA.id,
      client_id: fixtures.clientA.id,
      due_date: "2026-12-31",
      discount: 0,
      tax: 0,
      created_by: fixtures.internalAdmin.profileId,
      ...overrides,
    })
    .select("id, status, invoice_number")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create draft invoice: ${error?.message}`);
  }

  return data;
}

/**
 * Creates a draft invoice with one line item and sends it, returning the
 * new invoice's id. The most common fixture shape needed across the
 * payment/PayMongo/overdue integration suites.
 */
export async function createSentInvoice(client, fixtures, totalAmount, overrides = {}) {
  const invoice = await createDraftInvoice(client, fixtures, overrides);

  const { error: itemError } = await client.from("invoice_items").insert({
    invoice_id: invoice.id,
    description: "Line item",
    quantity: 1,
    unit_price: totalAmount,
  });
  if (itemError) {
    throw new Error(`Failed to create invoice item: ${itemError.message}`);
  }

  const { error: sendError } = await client.rpc("send_invoice", {
    target_invoice_id: invoice.id,
  });
  if (sendError) {
    throw new Error(`Failed to send invoice: ${sendError.message}`);
  }

  return invoice.id;
}

/**
 * Removes exactly what createPhase9Fixtures() created, plus any
 * invoices/payments the test itself created for these organizations (found
 * by organization_id rather than tracked one-by-one, since most Phase 9
 * tests create several invoices each). Deletion is explicit and ordered so
 * a partial failure never cascades into deleting unrelated data.
 */
export async function cleanupPhase9Fixtures(admin, fixtures) {
  const errors = [];

  async function attempt(label, fn) {
    try {
      await fn();
    } catch (error) {
      errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const orgIds = [fixtures.orgA.id, fixtures.orgB.id];

  const { data: invoiceRows } = await admin
    .from("invoices")
    .select("id")
    .in("organization_id", orgIds);
  const invoiceIds = (invoiceRows ?? []).map((row) => row.id);

  if (invoiceIds.length > 0) {
    await attempt("delete payments", () =>
      admin.from("payments").delete().in("invoice_id", invoiceIds),
    );
    await attempt("delete invoice_items", () =>
      admin.from("invoice_items").delete().in("invoice_id", invoiceIds),
    );
    await attempt("delete invoices", () =>
      admin.from("invoices").delete().in("id", invoiceIds),
    );
  }

  await attempt("delete projects", () =>
    admin.from("projects").delete().eq("id", fixtures.projectA.id),
  );

  await attempt("delete client_users", () =>
    admin
      .from("client_users")
      .delete()
      .in("client_id", [fixtures.clientA.id, fixtures.clientB.id]),
  );

  await attempt("delete clients", () =>
    admin.from("clients").delete().in("id", [fixtures.clientA.id, fixtures.clientB.id]),
  );

  await attempt("delete organization_members", () =>
    admin.from("organization_members").delete().in("organization_id", orgIds),
  );

  const allUsers = [
    fixtures.internalAdmin,
    fixtures.projectManager,
    fixtures.clientAOwner,
    fixtures.clientAViewer,
    fixtures.clientBOwner,
  ];

  await attempt("delete profiles", () =>
    admin
      .from("profiles")
      .delete()
      .in("id", allUsers.map((user) => user.profileId)),
  );

  await attempt("delete auth users", async () => {
    for (const user of allUsers) {
      const { error } = await admin.auth.admin.deleteUser(user.authUserId);
      if (error) {
        throw new Error(`${user.label}: ${error.message}`);
      }
    }
  });

  await attempt("delete organizations", () =>
    admin.from("organizations").delete().in("id", orgIds),
  );

  if (errors.length > 0) {
    console.error("Phase 9 fixture cleanup had non-fatal errors:", errors);
  }
}
