import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import {
  cleanupPhase10Fixtures,
  createInternalTicket,
  createPhase10Fixtures,
  createPortalTicket,
} from "../helpers/factory.mjs";
import {
  createTestAdminClient,
  createTestAnonClient,
  signInTestUser,
} from "../../phase8/helpers/supabase-clients.mjs";
import {
  getPhase8IntegrationSkipReason,
  hasPhase8IntegrationEnv,
} from "../../phase8/helpers/test-env.mjs";

describe("Phase 10 support workflow and authorization", () => {
  if (!hasPhase8IntegrationEnv()) {
    test("Phase 10 support integration tests", (t) => {
      t.skip(getPhase8IntegrationSkipReason());
    });
    return;
  }

  let admin;
  let fixtures;
  const clients = {};

  before(async () => {
    admin = createTestAdminClient();
    fixtures = await createPhase10Fixtures(admin);
    for (const [name, user] of Object.entries(fixtures.users)) {
      clients[name] = await signInTestUser(user.email, user.password);
    }
    clients.anon = createTestAnonClient();
  });

  after(async () => {
    await cleanupPhase10Fixtures(admin, fixtures);
  });

  test("owner and manager can create tickets with server-owned identity fields", async () => {
    const ownerTicket = await createPortalTicket(clients["client-owner"], fixtures, {
      p_title: "Owner-created ticket",
    });
    const managerTicket = await createPortalTicket(
      clients["client-manager"],
      fixtures,
      { p_title: "Manager-created ticket" },
    );

    assert.match(ownerTicket.ticket_number, /^NXF-TKT-\d{4}-\d{4,}$/);
    assert.match(managerTicket.ticket_number, /^NXF-TKT-\d{4}-\d{4,}$/);
    const { data: stored } = await admin
      .from("support_tickets")
      .select("id, organization_id, client_id, created_by, status")
      .in("id", [ownerTicket.id, managerTicket.id]);
    assert.equal(stored.length, 2);
    for (const row of stored) {
      assert.equal(row.organization_id, fixtures.orgA.id);
      assert.equal(row.client_id, fixtures.clientA.id);
      assert.equal(row.status, "open");
      assert.ok(row.created_by);
    }
  });

  test("viewer, suspended member, and anonymous caller cannot submit a ticket", async () => {
    for (const client of [
      clients["client-viewer"],
      clients["client-suspended"],
      clients.anon,
    ]) {
      const { error } = await client.rpc("create_client_support_ticket", {
        p_title: "Unauthorized ticket",
        p_description: "This request must not be accepted.",
        p_priority: "medium",
        p_category: "other",
        target_project_id: fixtures.projectA.id,
      });
      assert.ok(error);
    }
  });

  test("a client cannot attach another client's project", async () => {
    const { error } = await clients["client-owner"].rpc(
      "create_client_support_ticket",
      {
        p_title: "Cross-client project attempt",
        p_description: "The project does not belong to this client.",
        p_priority: "low",
        p_category: "other",
        target_project_id: fixtures.projectB.id,
      },
    );
    assert.ok(error);
  });

  test("official numbers stay unique under concurrent creation", async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        clients["client-owner"].rpc("create_client_support_ticket", {
          p_title: `Concurrent ticket ${index}`,
          p_description: "Concurrency-safe numbering check.",
          p_priority: "medium",
          p_category: "technical_support",
          target_project_id: fixtures.projectA.id,
        }),
      ),
    );
    for (const result of results) assert.equal(result.error, null);
    const numbers = results.map((result) => result.data[0].ticket_number);
    assert.equal(new Set(numbers).size, numbers.length);
  });

  test("invalid transition skips are rejected and the documented sequence succeeds", async () => {
    const ticket = await createPortalTicket(clients["client-owner"], fixtures, {
      p_title: "Workflow sequence ticket",
    });

    const { error: skipError } = await clients["internal-admin"].rpc(
      "transition_ticket_status",
      { target_ticket_id: ticket.id, p_new_status: "in_progress" },
    );
    assert.ok(skipError);

    const { error: assignmentError } = await clients["internal-admin"]
      .from("support_tickets")
      .update({ assigned_to: fixtures.users["assigned-team"].profileId })
      .eq("id", ticket.id);
    assert.equal(assignmentError, null);

    for (const status of ["assigned", "in_progress", "waiting_for_client"]) {
      const { error } = await clients["internal-admin"].rpc(
        "transition_ticket_status",
        { target_ticket_id: ticket.id, p_new_status: status },
      );
      assert.equal(error, null, error?.message);
    }
    const { error: resolveError } = await clients["internal-admin"].rpc(
      "transition_ticket_status",
      {
        target_ticket_id: ticket.id,
        p_new_status: "resolved",
        p_resolution_note: "The production configuration was corrected.",
      },
    );
    assert.equal(resolveError, null, resolveError?.message);
  });

  test("assignment permissions and the assigned-state invariant are enforced", async () => {
    const ticket = await createPortalTicket(clients["client-owner"], fixtures, {
      p_title: "Assignment permission ticket",
    });
    const { data: teamAssignRows, error: teamAssignError } = await clients[
      "assigned-team"
    ]
      .from("support_tickets")
      .update({ assigned_to: fixtures.users["assigned-team"].profileId })
      .eq("id", ticket.id)
      .select("id, assigned_to");
    assert.equal(teamAssignError, null);
    assert.deepEqual(teamAssignRows, []);

    const { data: unchangedTicket, error: unchangedError } = await clients[
      "internal-admin"
    ]
      .from("support_tickets")
      .select("assigned_to")
      .eq("id", ticket.id)
      .single();
    assert.equal(unchangedError, null);
    assert.equal(unchangedTicket.assigned_to, null);

    await clients["internal-admin"]
      .from("support_tickets")
      .update({ assigned_to: fixtures.users["assigned-team"].profileId })
      .eq("id", ticket.id);
    const { error: assignedError } = await clients["internal-admin"].rpc(
      "transition_ticket_status",
      { target_ticket_id: ticket.id, p_new_status: "assigned" },
    );
    assert.equal(assignedError, null);

    const { error: clearError } = await clients["internal-admin"]
      .from("support_tickets")
      .update({ assigned_to: null })
      .eq("id", ticket.id);
    assert.ok(clearError);
  });

  test("team members can see and act only on tickets assigned to them", async () => {
    const ticket = await createPortalTicket(clients["client-owner"], fixtures, {
      p_title: "Assigned team member ticket",
    });
    await clients["internal-admin"]
      .from("support_tickets")
      .update({ assigned_to: fixtures.users["assigned-team"].profileId })
      .eq("id", ticket.id);
    await clients["internal-admin"].rpc("transition_ticket_status", {
      target_ticket_id: ticket.id,
      p_new_status: "assigned",
    });

    const { data: assignedView } = await clients["assigned-team"]
      .from("support_tickets")
      .select("id")
      .eq("id", ticket.id);
    assert.deepEqual(assignedView?.map((row) => row.id), [ticket.id]);

    const { data: otherView } = await clients["other-team"]
      .from("support_tickets")
      .select("id")
      .eq("id", ticket.id);
    assert.equal(otherView?.length, 0);

    const { error: assignedTransitionError } = await clients[
      "assigned-team"
    ].rpc("transition_ticket_status", {
      target_ticket_id: ticket.id,
      p_new_status: "in_progress",
    });
    assert.equal(assignedTransitionError, null);

    const { error: otherTransitionError } = await clients["other-team"].rpc(
      "transition_ticket_status",
      { target_ticket_id: ticket.id, p_new_status: "waiting_for_client" },
    );
    assert.ok(otherTransitionError);
  });

  test("project managers are limited to manageable projects or self-assigned tickets", async () => {
    const managed = await createPortalTicket(clients["client-owner"], fixtures, {
      p_title: "Managed-project ticket",
      target_project_id: fixtures.projectA.id,
    });
    const unmanaged = await createInternalTicket(
      clients["internal-admin"],
      fixtures,
      {
        target_client_id: fixtures.clientB.id,
        target_project_id: fixtures.projectB.id,
        p_title: "Unmanaged-project ticket",
      },
    );
    const projectless = await createInternalTicket(
      clients["internal-admin"],
      fixtures,
      {
        target_project_id: null,
        p_title: "Projectless ticket",
      },
    );

    const { data: managerView, error: managerViewError } = await clients[
      "project-manager"
    ]
      .from("support_tickets")
      .select("id")
      .in("id", [managed.id, unmanaged.id, projectless.id]);
    assert.equal(managerViewError, null);
    assert.deepEqual(managerView.map((row) => row.id), [managed.id]);

    const { data: managedAssignment, error: managedAssignmentError } =
      await clients["project-manager"]
        .from("support_tickets")
        .update({ assigned_to: fixtures.users["project-manager"].profileId })
        .eq("id", managed.id)
        .select("id");
    assert.equal(managedAssignmentError, null);
    assert.deepEqual(managedAssignment.map((row) => row.id), [managed.id]);
    const managedTransition = await clients["project-manager"].rpc(
      "transition_ticket_status",
      { target_ticket_id: managed.id, p_new_status: "assigned" },
    );
    assert.equal(managedTransition.error, null);

    const { data: unmanagedAssignment, error: unmanagedAssignmentError } =
      await clients["project-manager"]
        .from("support_tickets")
        .update({ assigned_to: fixtures.users["project-manager"].profileId })
        .eq("id", unmanaged.id)
        .select("id");
    assert.equal(unmanagedAssignmentError, null);
    assert.deepEqual(unmanagedAssignment, []);

    const adminSelfAssignment = await clients["internal-admin"]
      .from("support_tickets")
      .update({ assigned_to: fixtures.users["project-manager"].profileId })
      .eq("id", projectless.id);
    assert.equal(adminSelfAssignment.error, null);
    const { data: selfAssignedView, error: selfAssignedViewError } = await clients[
      "project-manager"
    ]
      .from("support_tickets")
      .select("id")
      .eq("id", projectless.id);
    assert.equal(selfAssignedViewError, null);
    assert.deepEqual(selfAssignedView.map((row) => row.id), [projectless.id]);
  });

  test("portal users cannot assign tickets or invoke internal transitions", async () => {
    const ticket = await createPortalTicket(clients["client-owner"], fixtures, {
      p_title: "Portal write-boundary ticket",
    });
    const { data: assignmentRows, error: assignmentError } = await clients[
      "client-owner"
    ]
      .from("support_tickets")
      .update({ assigned_to: fixtures.users["internal-admin"].profileId })
      .eq("id", ticket.id)
      .select("id");
    assert.equal(assignmentError, null);
    assert.deepEqual(assignmentRows, []);

    const transition = await clients["client-owner"].rpc(
      "transition_ticket_status",
      { target_ticket_id: ticket.id, p_new_status: "assigned" },
    );
    assert.ok(transition.error);

    const { data: stored, error: storedError } = await admin
      .from("support_tickets")
      .select("status, assigned_to")
      .eq("id", ticket.id)
      .single();
    assert.equal(storedError, null);
    assert.deepEqual(stored, { status: "open", assigned_to: null });
  });

  test("resolving requires a non-empty resolution note", async () => {
    const ticket = await createPortalTicket(clients["client-owner"], fixtures, {
      p_title: "Resolution-note ticket",
    });
    await clients["internal-admin"]
      .from("support_tickets")
      .update({ assigned_to: fixtures.users["internal-admin"].profileId })
      .eq("id", ticket.id);
    await clients["internal-admin"].rpc("transition_ticket_status", {
      target_ticket_id: ticket.id,
      p_new_status: "assigned",
    });
    await clients["internal-admin"].rpc("transition_ticket_status", {
      target_ticket_id: ticket.id,
      p_new_status: "in_progress",
    });
    const { error } = await clients["internal-admin"].rpc(
      "transition_ticket_status",
      {
        target_ticket_id: ticket.id,
        p_new_status: "resolved",
        p_resolution_note: "   ",
      },
    );
    assert.ok(error);
  });

  test("client close is idempotent and preserves one close activity", async () => {
    const ticket = await createPortalTicket(clients["client-owner"], fixtures, {
      p_title: "Idempotent close ticket",
    });
    await clients["internal-admin"]
      .from("support_tickets")
      .update({ assigned_to: fixtures.users["internal-admin"].profileId })
      .eq("id", ticket.id);
    for (const status of ["assigned", "in_progress"]) {
      await clients["internal-admin"].rpc("transition_ticket_status", {
        target_ticket_id: ticket.id,
        p_new_status: status,
      });
    }
    await clients["internal-admin"].rpc("transition_ticket_status", {
      target_ticket_id: ticket.id,
      p_new_status: "resolved",
      p_resolution_note: "Issue fixed.",
    });

    const first = await clients["client-owner"].rpc("close_ticket_by_client", {
      target_ticket_id: ticket.id,
    });
    const second = await clients["client-owner"].rpc("close_ticket_by_client", {
      target_ticket_id: ticket.id,
    });
    assert.equal(first.error, null);
    assert.equal(first.data[0].already_closed, false);
    assert.equal(second.error, null);
    assert.equal(second.data[0].already_closed, true);

    const { count } = await admin
      .from("ticket_activities")
      .select("id", { count: "exact", head: true })
      .eq("ticket_id", ticket.id)
      .eq("activity_type", "closed");
    assert.equal(count, 1);
  });

  test("client can reopen a resolved ticket with a comment, but not an empty one", async () => {
    const ticket = await createPortalTicket(clients["client-owner"], fixtures, {
      p_title: "Client reopen ticket",
    });
    await clients["internal-admin"]
      .from("support_tickets")
      .update({ assigned_to: fixtures.users["internal-admin"].profileId })
      .eq("id", ticket.id);
    for (const status of ["assigned", "in_progress"]) {
      await clients["internal-admin"].rpc("transition_ticket_status", {
        target_ticket_id: ticket.id,
        p_new_status: status,
      });
    }
    await clients["internal-admin"].rpc("transition_ticket_status", {
      target_ticket_id: ticket.id,
      p_new_status: "resolved",
      p_resolution_note: "Initial fix applied.",
    });

    const empty = await clients["client-owner"].rpc(
      "reopen_ticket_by_client",
      { target_ticket_id: ticket.id, p_comment: "   " },
    );
    assert.ok(empty.error);

    const reopened = await clients["client-owner"].rpc(
      "reopen_ticket_by_client",
      {
        target_ticket_id: ticket.id,
        p_comment: "The issue still happens on mobile.",
      },
    );
    assert.equal(reopened.error, null);
    assert.equal(reopened.data[0].status, "in_progress");
    const { data: row } = await admin
      .from("support_tickets")
      .select("status, resolution_note, resolved_at")
      .eq("id", ticket.id)
      .single();
    assert.equal(row.status, "in_progress");
    assert.equal(row.resolution_note, "Initial fix applied.");
    assert.equal(row.resolved_at, null);
  });

  test("cross-client ticket reads are denied while activity history is preserved for the owner", async () => {
    const ticket = await createPortalTicket(clients["client-owner"], fixtures, {
      p_title: "Cross-client isolation ticket",
    });
    const { data: otherList, error: otherError } = await clients[
      "other-client-owner"
    ].rpc("get_client_support_tickets");
    assert.equal(otherError, null);
    assert.ok(!(otherList ?? []).some((row) => row.id === ticket.id));

    const { data: ownerDetail, error: ownerDetailError } = await clients[
      "client-owner"
    ].rpc("get_client_support_ticket", { target_ticket_id: ticket.id });
    assert.equal(ownerDetailError, null);
    assert.equal(ownerDetail?.[0]?.id, ticket.id);

    const { data: otherDetail, error: otherDetailError } = await clients[
      "other-client-owner"
    ].rpc("get_client_support_ticket", { target_ticket_id: ticket.id });
    assert.equal(otherDetailError, null);
    assert.deepEqual(otherDetail, []);

    const { data: otherActivity } = await clients["other-client-owner"].rpc(
      "get_client_ticket_activities",
      { target_ticket_id: ticket.id },
    );
    assert.deepEqual(otherActivity, []);

    const { data: ownerActivity, error: ownerError } = await clients[
      "client-owner"
    ].rpc("get_client_ticket_activities", { target_ticket_id: ticket.id });
    assert.equal(ownerError, null);
    assert.ok(ownerActivity.some((activity) => activity.activity_type === "created"));
    assert.equal("created_by" in ownerActivity[0], false);
    assert.equal("metadata" in ownerActivity[0], false);
  });

  test("cross-organization support records are isolated from internal and portal users", async () => {
    const otherOrganizationTicket = await createInternalTicket(
      clients["other-org-admin"],
      fixtures,
      {
        target_client_id: fixtures.clientOtherOrg.id,
        target_project_id: fixtures.projectOtherOrg.id,
        p_title: "Other-organization support ticket",
      },
    );

    const { data: orgAInternalView, error: orgAInternalError } = await clients[
      "internal-admin"
    ]
      .from("support_tickets")
      .select("id")
      .eq("id", otherOrganizationTicket.id);
    assert.equal(orgAInternalError, null);
    assert.deepEqual(orgAInternalView, []);

    const { data: orgAPortalView, error: orgAPortalError } = await clients[
      "client-owner"
    ].rpc("get_client_support_tickets");
    assert.equal(orgAPortalError, null);
    assert.ok(
      !orgAPortalView.some((ticket) => ticket.id === otherOrganizationTicket.id),
    );

    const { data: owningPortalView, error: owningPortalError } = await clients[
      "other-org-owner"
    ].rpc("get_client_support_tickets");
    assert.equal(owningPortalError, null);
    assert.ok(
      owningPortalView.some(
        (ticket) => ticket.id === otherOrganizationTicket.id,
      ),
    );
  });
});
