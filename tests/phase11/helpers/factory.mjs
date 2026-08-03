import { testRunId } from "../../phase8/helpers/test-env.mjs";

const TEST_PASSWORD_PREFIX = "Phase11Test!";

function testPassword(runId) {
  return `${TEST_PASSWORD_PREFIX}${runId}Aa1`;
}

async function createAuthUserWithProfile(admin, { runId, label, fullName }) {
  const email = `phase11-${label}-${runId}@example.com`;
  const password = testPassword(runId);
  const { data: created, error: authError } = await admin.auth.admin.createUser({
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
    const { error: authCleanupError } = await admin.auth.admin.deleteUser(created.user.id);
    if (authCleanupError) {
      throw new AggregateError(
        [profileError, authCleanupError].filter(Boolean),
        `Failed to create profile and roll back auth user for ${label}.`,
      );
    }
    throw new Error(`Failed to create profile for ${label}: ${profileError?.message}`);
  }

  return { label, email, password, authUserId: created.user.id, profileId: profile.id };
}

async function insertOne(client, table, values, columns = "id") {
  const { data, error } = await client.from(table).insert(values).select(columns).single();
  if (error || !data) {
    throw new Error(`Failed to create ${table} fixture: ${JSON.stringify(error)}`);
  }
  return data;
}

export async function createPhase11Fixtures(admin) {
  const runId = testRunId();
  const partial = { runId, users: {} };

  try {
    const orgA = await insertOne(admin, "organizations", {
      name: `Phase11 Org A ${runId}`,
      slug: `phase11-org-a-${runId}`,
    });
    partial.orgA = orgA;
    const orgB = await insertOne(admin, "organizations", {
      name: `Phase11 Org B ${runId}`,
      slug: `phase11-org-b-${runId}`,
    });
    partial.orgB = orgB;

    const userSpecs = [
      ["admin-a", "Org A Admin"],
      ["assigned-team-a", "Org A Assigned Team Member"],
      ["other-team-a", "Org A Other Team Member"],
      ["suspended-admin-a", "Org A Suspended Admin"],
      ["admin-b", "Org B Admin"],
      ["client-owner-a", "Org A Client Owner"],
    ];
    const users = partial.users;
    for (const [label, fullName] of userSpecs) {
      users[label] = await createAuthUserWithProfile(admin, { runId, label, fullName });
    }

    const organizationMembers = [
      [orgA.id, users["admin-a"], "admin", "active"],
      [orgA.id, users["assigned-team-a"], "team_member", "active"],
      [orgA.id, users["other-team-a"], "team_member", "active"],
      [orgA.id, users["suspended-admin-a"], "admin", "suspended"],
      [orgB.id, users["admin-b"], "admin", "active"],
    ].map(([organizationId, user, role, status]) => ({
      organization_id: organizationId,
      user_id: user.profileId,
      role,
      status,
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
        business_name: `Phase11 Client A ${runId}`,
        contact_name: "Client A Contact",
        email: `phase11-client-a-${runId}@example.com`,
      },
      "id, organization_id",
    );
    partial.clientA = clientA;

    const { error: clientUserError } = await admin.from("client_users").insert({
      client_id: clientA.id,
      user_id: users["client-owner-a"].profileId,
      role: "owner",
      status: "active",
    });
    if (clientUserError) {
      throw new Error(`Failed to create client membership: ${clientUserError.message}`);
    }

    return { runId, orgA, orgB, users, clientA };
  } catch (setupError) {
    try {
      await cleanupPhase11Fixtures(admin, partial);
    } catch (cleanupError) {
      throw new AggregateError(
        [setupError, cleanupError],
        "Phase 11 fixture setup failed and partial cleanup also failed.",
      );
    }
    throw setupError;
  }
}

export async function cleanupPhase11Fixtures(admin, fixtures) {
  if (!fixtures) return;
  const errors = [];
  const orgIds = [fixtures.orgA?.id, fixtures.orgB?.id].filter(Boolean);
  const clientIds = [fixtures.clientA?.id].filter(Boolean);

  async function attempt(label, operation) {
    try {
      const result = await operation();
      if (result?.error) throw result.error;
    } catch (error) {
      errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (orgIds.length > 0) {
    await attempt("delete notification_deliveries", async () => {
      const { data: notifs } = await admin
        .from("notifications")
        .select("id")
        .in("organization_id", orgIds);
      const ids = (notifs ?? []).map((row) => row.id);
      if (ids.length > 0) {
        return admin.from("notification_deliveries").delete().in("notification_id", ids);
      }
      return { error: null };
    });
    await attempt("delete notifications", () =>
      admin.from("notifications").delete().in("organization_id", orgIds),
    );
    await attempt("delete audit_logs", () =>
      admin.from("audit_logs").delete().in("organization_id", orgIds),
    );
    await attempt("delete leads", () => admin.from("leads").delete().in("organization_id", orgIds));
  }
  if (clientIds.length > 0) {
    await attempt("delete client users", () =>
      admin.from("client_users").delete().in("client_id", clientIds),
    );
    await attempt("delete clients", () => admin.from("clients").delete().in("id", clientIds));
  }
  if (orgIds.length > 0) {
    await attempt("delete organization members", () =>
      admin.from("organization_members").delete().in("organization_id", orgIds),
    );
  }

  const allUsers = Object.values(fixtures.users ?? {});
  if (allUsers.length > 0) {
    await attempt("delete notification_preferences", () =>
      admin
        .from("notification_preferences")
        .delete()
        .in(
          "profile_id",
          allUsers.map((user) => user.profileId),
        ),
    );
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
    throw new Error(`Phase 11 fixture cleanup failed:\n${errors.join("\n")}`);
  }
}
