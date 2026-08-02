import { testRunId } from "../../phase8/helpers/test-env.mjs";

const TEST_PASSWORD_PREFIX = "Phase10Test!";

function testPassword(runId) {
  return `${TEST_PASSWORD_PREFIX}${runId}Aa1`;
}

async function createAuthUserWithProfile(
  admin,
  { runId, label, fullName },
) {
  const email = `phase10-${label}-${runId}@example.com`;
  const password = testPassword(runId);
  const { data: created, error: authError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (authError || !created?.user) {
    throw new Error(`Failed to create ${label}: ${authError?.message}`);
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .insert({ auth_user_id: created.user.id, full_name: fullName })
    .select("id")
    .single();

  if (profileError || !profile) {
    const { error: authCleanupError } = await admin.auth.admin.deleteUser(
      created.user.id,
    );
    if (authCleanupError) {
      throw new AggregateError(
        [profileError, authCleanupError].filter(Boolean),
        `Failed to create profile and roll back auth user for ${label}.`,
      );
    }
    throw new Error(
      `Failed to create profile for ${label}: ${profileError?.message}`,
    );
  }

  return {
    label,
    email,
    password,
    authUserId: created.user.id,
    profileId: profile.id,
  };
}

async function insertOne(client, table, values, columns = "id") {
  const { data, error } = await client
    .from(table)
    .insert(values)
    .select(columns)
    .single();
  if (error || !data) {
    throw new Error(`Failed to create ${table} fixture: ${error?.message}`);
  }
  return data;
}

export async function createPhase10Fixtures(admin) {
  const runId = testRunId();
  const partial = { runId, users: {} };

  try {
  const orgA = await insertOne(admin, "organizations", {
    name: `Phase10 Org A ${runId}`,
    slug: `phase10-org-a-${runId}`,
  });
  partial.orgA = orgA;
  const orgB = await insertOne(admin, "organizations", {
    name: `Phase10 Org B ${runId}`,
    slug: `phase10-org-b-${runId}`,
  });
  partial.orgB = orgB;

  const userSpecs = [
    ["internal-admin", "Internal Admin"],
    ["project-manager", "Project Manager"],
    ["assigned-team", "Assigned Team Member"],
    ["other-team", "Other Team Member"],
    ["other-org-admin", "Other Organization Admin"],
    ["client-owner", "Client Owner"],
    ["client-manager", "Client Manager"],
    ["client-viewer", "Client Viewer"],
    ["client-suspended", "Suspended Client User"],
    ["other-client-owner", "Other Client Owner"],
    ["other-org-owner", "Other Organization Owner"],
  ];
  const users = partial.users;
  for (const [label, fullName] of userSpecs) {
    users[label] = await createAuthUserWithProfile(admin, {
      runId,
      label,
      fullName,
    });
  }

  const organizationMembers = [
    [orgA.id, users["internal-admin"], "admin"],
    [orgA.id, users["project-manager"], "project_manager"],
    [orgA.id, users["assigned-team"], "team_member"],
    [orgA.id, users["other-team"], "team_member"],
    [orgB.id, users["other-org-admin"], "admin"],
  ].map(([organizationId, user, role]) => ({
    organization_id: organizationId,
    user_id: user.profileId,
    role,
    status: "active",
  }));
  const { error: memberError } = await admin
    .from("organization_members")
    .insert(organizationMembers);
  if (memberError) {
    throw new Error(`Failed to create internal memberships: ${memberError.message}`);
  }

  const clientA = await insertOne(
    admin,
    "clients",
    {
      organization_id: orgA.id,
      business_name: `Phase10 Client A ${runId}`,
      contact_name: "Client A Contact",
      email: `phase10-client-a-${runId}@example.com`,
    },
    "id, organization_id",
  );
  partial.clientA = clientA;
  const clientB = await insertOne(
    admin,
    "clients",
    {
      organization_id: orgA.id,
      business_name: `Phase10 Client B ${runId}`,
      contact_name: "Client B Contact",
      email: `phase10-client-b-${runId}@example.com`,
    },
    "id, organization_id",
  );
  partial.clientB = clientB;
  const clientOtherOrg = await insertOne(
    admin,
    "clients",
    {
      organization_id: orgB.id,
      business_name: `Phase10 Other Org Client ${runId}`,
      contact_name: "Other Org Contact",
      email: `phase10-other-org-client-${runId}@example.com`,
    },
    "id, organization_id",
  );
  partial.clientOtherOrg = clientOtherOrg;

  const clientUsers = [
    [clientA.id, users["client-owner"], "owner", "active"],
    [clientA.id, users["client-manager"], "manager", "active"],
    [clientA.id, users["client-viewer"], "viewer", "active"],
    [clientA.id, users["client-suspended"], "owner", "suspended"],
    [clientB.id, users["other-client-owner"], "owner", "active"],
    [clientOtherOrg.id, users["other-org-owner"], "owner", "active"],
  ].map(([clientId, user, role, status]) => ({
    client_id: clientId,
    user_id: user.profileId,
    role,
    status,
  }));
  const { error: clientUserError } = await admin
    .from("client_users")
    .insert(clientUsers);
  if (clientUserError) {
    throw new Error(`Failed to create client memberships: ${clientUserError.message}`);
  }

  const projectA = await insertOne(
    admin,
    "projects",
    {
      organization_id: orgA.id,
      client_id: clientA.id,
      project_manager_id: users["project-manager"].profileId,
      name: `Phase10 Project A ${runId}`,
    },
    "id, organization_id, client_id",
  );
  partial.projectA = projectA;
  const projectB = await insertOne(
    admin,
    "projects",
    {
      organization_id: orgA.id,
      client_id: clientB.id,
      name: `Phase10 Project B ${runId}`,
    },
    "id, organization_id, client_id",
  );
  partial.projectB = projectB;
  const projectOtherOrg = await insertOne(
    admin,
    "projects",
    {
      organization_id: orgB.id,
      client_id: clientOtherOrg.id,
      name: `Phase10 Other Org Project ${runId}`,
    },
    "id, organization_id, client_id",
  );
  partial.projectOtherOrg = projectOtherOrg;

  return {
    runId,
    orgA,
    orgB,
    users,
    clientA,
    clientB,
    clientOtherOrg,
    projectA,
    projectB,
    projectOtherOrg,
  };
  } catch (setupError) {
    try {
      await cleanupPhase10Fixtures(admin, partial);
    } catch (cleanupError) {
      throw new AggregateError(
        [setupError, cleanupError],
        "Phase 10 fixture setup failed and partial cleanup also failed.",
      );
    }
    throw setupError;
  }
}

export async function createPortalTicket(client, fixtures, overrides = {}) {
  const { data, error } = await client.rpc("create_client_support_ticket", {
    p_title: `Support request ${fixtures.runId}`,
    p_description: "The client needs help with a production issue.",
    p_priority: "medium",
    p_category: "technical_support",
    target_project_id: fixtures.projectA.id,
    ...overrides,
  });
  if (error || !data?.[0]) {
    throw new Error(`Failed to create portal ticket: ${error?.message}`);
  }
  return data[0];
}

export async function createInternalTicket(client, fixtures, overrides = {}) {
  const { data, error } = await client.rpc("create_internal_support_ticket", {
    target_client_id: fixtures.clientA.id,
    p_title: `Internal support request ${fixtures.runId}`,
    p_description: "An administrator recorded this client support request.",
    p_priority: "medium",
    p_category: "technical_support",
    target_project_id: fixtures.projectA.id,
    ...overrides,
  });
  if (error || !data?.[0]) {
    throw new Error(`Failed to create internal ticket: ${error?.message}`);
  }
  return data[0];
}

export async function createSubscription(client, fixtures, overrides = {}) {
  const { data, error } = await client
    .from("subscriptions")
    .insert({
      organization_id: fixtures.orgA.id,
      client_id: fixtures.clientA.id,
      project_id: fixtures.projectA.id,
      plan_name: `Care plan ${fixtures.runId}`,
      status: "active",
      billing_cycle: "monthly",
      amount: 5000,
      currency: "PHP",
      included_hours: 10,
      started_at: "2026-08-01T00:00:00.000Z",
      renewal_at: "2026-09-01T00:00:00.000Z",
      notes: "Internal subscription note",
      created_by: fixtures.users["internal-admin"].profileId,
      ...overrides,
    })
    .select("id, organization_id, client_id")
    .single();
  if (error || !data) {
    throw new Error(`Failed to create subscription: ${error?.message}`);
  }
  return data;
}

export async function cleanupPhase10Fixtures(admin, fixtures) {
  if (!fixtures) return;
  const errors = [];
  const orgIds = [fixtures.orgA?.id, fixtures.orgB?.id].filter(Boolean);
  const clientIds = [
    fixtures.clientA?.id,
    fixtures.clientB?.id,
    fixtures.clientOtherOrg?.id,
  ].filter(Boolean);
  const projectIds = [
    fixtures.projectA?.id,
    fixtures.projectB?.id,
    fixtures.projectOtherOrg?.id,
  ].filter(Boolean);

  async function attempt(label, operation) {
    try {
      const result = await operation();
      if (result?.error) throw result.error;
    } catch (error) {
      errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (orgIds.length > 0) {
    await attempt("delete subscription usage", () =>
      admin.from("subscription_usage").delete().in("organization_id", orgIds),
    );
    await attempt("delete subscriptions", () =>
      admin.from("subscriptions").delete().in("organization_id", orgIds),
    );
    await attempt("delete ticket activities", () =>
      admin.from("ticket_activities").delete().in("organization_id", orgIds),
    );
    await attempt("delete support tickets", () =>
      admin.from("support_tickets").delete().in("organization_id", orgIds),
    );
    await attempt("delete organization members", () =>
      admin.from("organization_members").delete().in("organization_id", orgIds),
    );
  }
  if (projectIds.length > 0) {
    await attempt("delete project members", () =>
      admin.from("project_members").delete().in("project_id", projectIds),
    );
    await attempt("delete projects", () =>
      admin.from("projects").delete().in("id", projectIds),
    );
  }
  if (clientIds.length > 0) {
    await attempt("delete client users", () =>
      admin.from("client_users").delete().in("client_id", clientIds),
    );
    await attempt("delete clients", () =>
      admin.from("clients").delete().in("id", clientIds),
    );
  }

  const allUsers = Object.values(fixtures.users ?? {});
  if (allUsers.length > 0) {
    await attempt("delete profiles", () =>
      admin
        .from("profiles")
        .delete()
        .in(
          "id",
          allUsers.map((user) => user.profileId),
        ),
    );
    for (const user of allUsers) {
      await attempt(`delete auth user ${user.label}`, async () => {
      const { error } = await admin.auth.admin.deleteUser(user.authUserId);
      if (error) throw new Error(`${user.label}: ${error.message}`);
      });
    }
  }
  if (orgIds.length > 0) {
    await attempt("delete organizations", () =>
      admin.from("organizations").delete().in("id", orgIds),
    );
  }

  if (errors.length > 0) {
    throw new Error(`Phase 10 fixture cleanup failed:\n${errors.join("\n")}`);
  }
}
