// Deterministic Phase 12 fixture set.
//
// Every date and amount below is FIXED so each report metric has one exactly
// calculable expected value. The report window is a closed month in the past
// (see WINDOW_FROM/WINDOW_TO), which keeps "outside the range" and "already
// overdue" stable no matter when the suite runs.
//
// Isolation: two dedicated organizations per run, named with a random run id.
// Nothing is ever selected or deleted by a broad predicate -- every cleanup
// statement is scoped to ids this factory created. Auth users are created per
// run and deleted per run; no permanent account is added.

import { testRunId } from "./test-env.mjs";

const TEST_PASSWORD_PREFIX = "Phase12Test!";

/** Report window, inclusive, in Asia/Manila calendar dates. */
export const WINDOW_FROM = "2026-03-01";
export const WINDOW_TO = "2026-03-31";

/** Builds an ISO timestamp at a fixed Manila (+08:00) wall-clock time. */
export function manila(date, time = "09:00") {
  return `${date}T${time}:00+08:00`;
}

function testPassword(runId) {
  return `${TEST_PASSWORD_PREFIX}${runId}Aa1`;
}

async function createAuthUserWithProfile(admin, { runId, label, fullName }) {
  const email = `phase12-${label}-${runId}@example.com`;
  const password = testPassword(runId);

  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authError || !created?.user) {
    throw new Error(`Failed to create auth user ${label}: ${authError?.message}`);
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .insert({ auth_user_id: created.user.id, full_name: fullName })
    .select("id")
    .single();

  if (profileError || !profile) {
    const { error: cleanupError } = await admin.auth.admin.deleteUser(created.user.id);
    if (cleanupError) {
      throw new AggregateError(
        [profileError, cleanupError].filter(Boolean),
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

async function insertMany(client, table, rows) {
  const { data, error } = await client.from(table).insert(rows).select("id");
  if (error) {
    throw new Error(`Failed to create ${table} fixtures: ${JSON.stringify(error)}`);
  }
  return data ?? [];
}

export async function createPhase12Fixtures(admin) {
  const runId = testRunId();
  const partial = { runId, users: {} };
  // Unique, high-entropy search tokens so a search assertion can never match
  // a real row or another run's fixtures.
  const token = `Zqx${runId}`;
  partial.token = token;
  partial.searchTerms = {
    lead: `ZqxLead${runId}`,
    client: `ZqxClient${runId}`,
    project: `ZqxProject${runId}`,
    proposal: `ZqxProposal${runId}`,
    ticket: `ZqxTicket${runId}`,
    crossTenant: `ZqxCross${runId}`,
    secretNote: `ZqxSecretNote${runId}`,
  };

  try {
    // ---- organizations -----------------------------------------------
    const orgA = await insertOne(admin, "organizations", {
      name: `Phase12 Org A ${runId}`,
      slug: `phase12-org-a-${runId}`,
    });
    partial.orgA = orgA;
    const orgB = await insertOne(admin, "organizations", {
      name: `Phase12 Org B ${runId}`,
      slug: `phase12-org-b-${runId}`,
    });
    partial.orgB = orgB;

    // ---- identities ---------------------------------------------------
    const userSpecs = [
      ["super-admin-a", "Org A Super Admin"],
      ["admin-a", "Org A Admin"],
      ["pm-a", "Org A Project Manager"],
      ["team-a", "Org A Team Member"],
      ["suspended-a", "Org A Suspended Admin"],
      ["no-membership", "User Without Membership"],
      ["portal-owner-a", "Org A Portal Owner"],
      ["admin-b", "Org B Admin"],
    ];
    const users = partial.users;
    for (const [label, fullName] of userSpecs) {
      users[label] = await createAuthUserWithProfile(admin, { runId, label, fullName });
    }

    const memberships = [
      [orgA.id, users["super-admin-a"], "super_admin", "active"],
      [orgA.id, users["admin-a"], "admin", "active"],
      [orgA.id, users["pm-a"], "project_manager", "active"],
      [orgA.id, users["team-a"], "team_member", "active"],
      [orgA.id, users["suspended-a"], "admin", "suspended"],
      [orgB.id, users["admin-b"], "admin", "active"],
    ].map(([organizationId, user, role, status]) => ({
      organization_id: organizationId,
      user_id: user.profileId,
      role,
      status,
    }));
    const { error: memberError } = await admin
      .from("organization_members")
      .insert(memberships);
    if (memberError) {
      throw new Error(`Failed to create memberships: ${memberError.message}`);
    }

    const adminAId = users["admin-a"].profileId;
    const pmAId = users["pm-a"].profileId;
    const teamAId = users["team-a"].profileId;

    // ---- leads (Org A) -------------------------------------------------
    // Created cohort = created_at inside the window. Eight rows, chosen so
    // every funnel bucket has a known count and `discovery` stays at zero to
    // prove zero-filling.
    const leadRows = [
      // label,           source,           status,        created,        converted,      assigned
      ["l1", "website", "won", manila(WINDOW_FROM, "00:00"), manila("2026-03-11", "00:00"), pmAId],
      ["l2", "website", "won", manila("2026-03-02"), null, adminAId],
      ["l3", "referral", "lost", manila("2026-03-03"), null, adminAId],
      ["l4", "referral", "qualified", manila("2026-03-04"), null, pmAId],
      ["l5", "facebook", "new", manila("2026-03-05"), null, null],
      ["l6", "messenger", "proposal", manila("2026-03-06"), null, null],
      ["l7", "email", "negotiation", manila(WINDOW_FROM, "00:00"), manila("2026-03-21", "00:00"), adminAId],
      ["l8", "networking", "contacted", manila("2026-03-08"), null, null],
      // Outside the window -- must never appear in the created cohort.
      ["l9", "website", "won", manila("2026-02-15"), null, adminAId],
      ["l10", "website", "won", manila("2026-05-01"), null, adminAId],
      // Created before the window but converted INSIDE it: counts toward
      // conversions_in_period only, never toward the created cohort.
      ["l11", "other", "won", manila("2026-01-10"), manila("2026-03-20"), adminAId],
    ];

    // leads_conversion_pair_check requires converted_at and
    // converted_client_id to be set together, so conversion is applied after
    // the clients exist (below), never at insert time.
    const leads = {};
    const conversions = {};
    for (const [label, source, status, createdAt, convertedAt, assignedTo] of leadRows) {
      const row = await insertOne(admin, "leads", {
        organization_id: orgA.id,
        full_name:
          label === "l1"
            ? `${partial.searchTerms.lead} Primary`
            : `Phase12 Lead ${label} ${runId}`,
        business_name: `Phase12 Business ${label}`,
        email: `phase12-lead-${label}-${runId}@example.com`,
        service_interest: "Website",
        source,
        status,
        // leads_lost_reason_check: a lost lead must carry a non-blank reason,
        // and a non-lost lead must carry none.
        lost_reason: status === "lost" ? "Phase12 fixture lost reason" : null,
        lead_score: 50,
        assigned_to: assignedTo,
        created_at: createdAt,
      });
      leads[label] = row;
      if (convertedAt) conversions[label] = convertedAt;
    }
    partial.leads = leads;
    partial.conversions = conversions;

    // ---- clients -------------------------------------------------------
    const clientA1 = await insertOne(
      admin,
      "clients",
      {
        organization_id: orgA.id,
        source_lead_id: leads.l1.id,
        business_name: `${partial.searchTerms.client} Converted`,
        contact_name: "Converted Contact",
        email: `phase12-client-a1-${runId}@example.com`,
      },
      "id, organization_id",
    );
    partial.clientA1 = clientA1;

    const clientA2 = await insertOne(
      admin,
      "clients",
      {
        organization_id: orgA.id,
        business_name: `Phase12 Delivery Client ${runId}`,
        contact_name: "Delivery Contact",
        email: `phase12-client-a2-${runId}@example.com`,
      },
      "id, organization_id",
    );
    partial.clientA2 = clientA2;

    // Each remaining converted lead gets its own client, so first-touch
    // attribution has a real clients.source_lead_id chain to follow.
    const clientA3 = await insertOne(
      admin,
      "clients",
      {
        organization_id: orgA.id,
        source_lead_id: leads.l7.id,
        business_name: `Phase12 Converted Email ${runId}`,
        contact_name: "Email Contact",
        email: `phase12-client-a3-${runId}@example.com`,
      },
      "id, organization_id",
    );
    partial.clientA3 = clientA3;

    const clientA4 = await insertOne(
      admin,
      "clients",
      {
        organization_id: orgA.id,
        source_lead_id: leads.l11.id,
        business_name: `Phase12 Converted Other ${runId}`,
        contact_name: "Other Contact",
        email: `phase12-client-a4-${runId}@example.com`,
      },
      "id, organization_id",
    );
    partial.clientA4 = clientA4;

    const clientB = await insertOne(
      admin,
      "clients",
      {
        organization_id: orgB.id,
        business_name: `${partial.searchTerms.crossTenant} OrgB Client`,
        contact_name: "Org B Contact",
        email: `phase12-client-b-${runId}@example.com`,
      },
      "id, organization_id",
    );
    partial.clientB = clientB;

    // Apply conversion now that the clients exist: converted_at and
    // converted_client_id must be written together (leads_conversion_pair_check).
    const conversionTargets = {
      l1: clientA1.id,
      l7: clientA3.id,
      l11: clientA4.id,
    };
    for (const [label, clientId] of Object.entries(conversionTargets)) {
      const { error: convertError } = await admin
        .from("leads")
        .update({ converted_at: conversions[label], converted_client_id: clientId })
        .eq("id", leads[label].id);
      if (convertError) {
        throw new Error(`Failed to convert lead ${label}: ${convertError.message}`);
      }
    }

    // ---- portal user ----------------------------------------------------
    const { error: portalError } = await admin.from("client_users").insert({
      client_id: clientA1.id,
      user_id: users["portal-owner-a"].profileId,
      role: "owner",
      status: "active",
    });
    if (portalError) throw new Error(`Failed to create portal user: ${portalError.message}`);

    // ---- projects -------------------------------------------------------
    // p8 exists specifically to prove the delivery report's NARROW scope:
    // pm-a is only a project_members contributor there, never
    // project_manager_id, so it must be excluded from their report.
    const projectRows = [
      ["p1", "completed", "2026-01-01", "2026-03-20", manila("2026-03-15", "10:00"), adminAId, 100],
      ["p2", "completed", "2026-01-01", "2026-03-10", manila("2026-03-25", "10:00"), adminAId, 100],
      ["p3", "completed", "2026-01-01", null, manila("2026-03-18", "10:00"), adminAId, 100],
      ["p4", "cancelled", "2026-01-01", "2026-03-01", null, adminAId, 10],
      ["p5", "development", "2026-01-01", "2026-03-15", null, adminAId, 80],
      ["p6", "planning", "2026-01-01", "2026-12-31", null, adminAId, 0],
      ["p7", "design", "2026-01-01", "2026-12-31", null, pmAId, 20],
      ["p8", "testing", "2026-01-01", "2026-12-31", null, adminAId, 30],
      ["p9", "development", "2026-01-01", "2026-12-31", null, adminAId, 40],
    ];

    const projects = {};
    for (const [label, status, startDate, targetDate, completedAt, managerId, progress] of projectRows) {
      projects[label] = await insertOne(admin, "projects", {
        organization_id: orgA.id,
        client_id: clientA2.id,
        name:
          label === "p7"
            ? `${partial.searchTerms.project} Managed`
            : label === "p8"
              ? `${partial.searchTerms.project} Contributor`
              : `Phase12 Project ${label} ${runId}`,
        slug: `phase12-project-${label}-${runId}`,
        status,
        start_date: startDate,
        target_date: targetDate,
        completed_at: completedAt,
        project_manager_id: managerId,
        progress_percent: progress,
      });
    }
    partial.projects = projects;

    // pm-a contributes to p8 but does not manage it; team-a is assigned p9.
    const { error: pmError } = await admin.from("project_members").insert([
      { project_id: projects.p8.id, user_id: pmAId, role: "developer" },
      { project_id: projects.p9.id, user_id: teamAId, role: "developer" },
    ]);
    if (pmError) throw new Error(`Failed to create project members: ${pmError.message}`);

    // ---- milestones and tasks (all on p5, to keep the maths single-source)
    await insertMany(admin, "milestones", [
      { project_id: projects.p5.id, title: "Phase12 Milestone done", status: "completed", due_date: "2026-02-01", completed_at: manila("2026-02-01") },
      { project_id: projects.p5.id, title: "Phase12 Milestone overdue", status: "pending", due_date: "2026-03-01" },
    ]);

    await insertMany(admin, "tasks", [
      { project_id: projects.p5.id, title: "Phase12 Task done", status: "done", completed_at: manila("2026-03-10") },
      { project_id: projects.p5.id, title: "Phase12 Task todo", status: "todo" },
      { project_id: projects.p5.id, title: "Phase12 Task blocked", status: "blocked" },
      { project_id: projects.p5.id, title: "Phase12 Task in progress", status: "in_progress" },
    ]);

    // ---- proposals -------------------------------------------------------
    const proposalRows = [
      // label, number, status, currency, total, sent, viewed, accepted, declined, createdBy
      ["pr1", null, "draft", "PHP", 5000, null, null, null, null, adminAId],
      ["pr2", "NXF-PROP-2026-0002", "sent", "PHP", 10000, manila("2026-03-05"), null, null, null, adminAId],
      ["pr3", "NXF-PROP-2026-0003", "viewed", "PHP", 20000, manila("2026-03-06"), manila("2026-03-07"), null, null, adminAId],
      ["pr4", "NXF-PROP-2026-0004", "accepted", "PHP", 30000, manila("2026-03-08"), null, manila("2026-03-18"), null, adminAId],
      ["pr5", "NXF-PROP-2026-0005", "declined", "PHP", 40000, manila("2026-03-09"), null, null, manila("2026-03-14"), adminAId],
      ["pr6", "NXF-PROP-2026-0006", "expired", "PHP", 50000, manila("2026-03-10"), null, null, null, adminAId],
      ["pr7", "NXF-PROP-2026-0007", "changes_requested", "PHP", 60000, manila("2026-03-11"), null, null, null, adminAId],
      // Outside the sent-window cohort.
      ["pr8", "NXF-PROP-2026-0008", "accepted", "PHP", 70000, manila("2026-02-20"), null, manila("2026-02-25"), null, adminAId],
      // Second currency -- must never be summed with PHP.
      ["pr9", "NXF-PROP-2026-0009", "accepted", "USD", 1000, manila("2026-03-12"), null, manila("2026-03-22"), null, pmAId],
    ];

    const proposals = {};
    for (const [label, number, status, currency, total, sentAt, viewedAt, acceptedAt, declinedAt, createdBy] of proposalRows) {
      proposals[label] = await insertOne(admin, "proposals", {
        organization_id: orgA.id,
        client_id: clientA2.id,
        proposal_number: number,
        title:
          label === "pr4"
            ? `${partial.searchTerms.proposal} Accepted`
            : `Phase12 Proposal ${label} ${runId}`,
        status,
        currency,
        subtotal: total,
        total,
        sent_at: sentAt,
        viewed_at: viewedAt,
        accepted_at: acceptedAt,
        declined_at: declinedAt,
        created_by: createdBy,
        requested_changes_message:
          status === "changes_requested" ? "Phase12 requested changes" : null,
      });
    }
    partial.proposals = proposals;

    // ---- invoices --------------------------------------------------------
    // Cohort = non-draft, non-void, issue_date inside the window.
    const invoiceRows = [
      // label, number, status, currency, total, issue, due, notes
      ["i1", null, "draft", "PHP", 5000, null, null, null],
      ["i2", "NXF-INV-2026-0002", "void", "PHP", 9000, "2026-03-05", "2026-04-05", null],
      ["i3", "NXF-INV-2026-0003", "sent", "PHP", 10000, "2026-03-10", "2026-03-20", partial.searchTerms.secretNote],
      ["i4", "NXF-INV-2026-0004", "sent", "PHP", 20000, "2026-03-11", "2026-12-31", null],
      ["i5", "NXF-INV-2026-0005", "sent", "PHP", 30000, "2026-03-12", "2026-12-31", null],
      ["i6", "NXF-INV-2026-0006", "sent", "PHP", 40000, "2026-03-13", "2026-12-31", null],
      // Issued BEFORE the window; its payment lands inside it.
      ["i7", "NXF-INV-2026-0007", "sent", "PHP", 50000, "2026-02-10", "2026-12-31", null],
      // Second currency.
      ["i8", "NXF-INV-2026-0008", "sent", "USD", 500, "2026-03-14", "2026-12-31", null],
    ];

    const invoices = {};
    for (const [label, number, status, currency, total, issueDate, dueDate, notes] of invoiceRows) {
      invoices[label] = await insertOne(admin, "invoices", {
        organization_id: orgA.id,
        client_id: clientA1.id,
        invoice_number: number,
        status,
        currency,
        subtotal: total,
        total,
        issue_date: issueDate,
        due_date: dueDate,
        notes,
        created_by: adminAId,
      });
    }
    partial.invoices = invoices;

    // ---- payments --------------------------------------------------------
    // amount_paid / status on invoices are trigger-maintained; never set here.
    const paymentRows = [
      // invoice, amount, currency, status, paid_at, provider
      ["i4", 5000, "PHP", "paid", manila("2026-03-15"), "manual"],
      ["i5", 30000, "PHP", "paid", manila("2026-03-16"), "paymongo"],
      // Cohort invoice, settled AFTER the window: cohort_collected only.
      ["i6", 40000, "PHP", "paid", manila("2026-05-10"), "manual"],
      // Non-cohort invoice, settled INSIDE the window: collected_in_period only.
      ["i7", 50000, "PHP", "paid", manila("2026-03-20"), "manual"],
      ["i8", 500, "USD", "paid", manila("2026-03-17"), "manual"],
      // Neither of these may ever reach a collected total.
      ["i3", 1000, "PHP", "refunded", null, "manual"],
      ["i3", 2000, "PHP", "failed", null, "manual"],
    ];

    const payments = [];
    for (const [invoiceLabel, amount, currency, status, paidAt, provider] of paymentRows) {
      payments.push(
        await insertOne(admin, "payments", {
          organization_id: orgA.id,
          client_id: clientA1.id,
          invoice_id: invoices[invoiceLabel].id,
          amount,
          currency,
          status,
          paid_at: paidAt,
          provider,
          payment_method: "bank_transfer",
          recorded_by: adminAId,
          created_at: paidAt ?? manila("2026-03-18"),
        }),
      );
    }
    partial.payments = payments;

    // ---- subscriptions ---------------------------------------------------
    await insertMany(admin, "subscriptions", [
      { organization_id: orgA.id, client_id: clientA1.id, plan_name: "Phase12 Monthly", status: "active", billing_cycle: "monthly", amount: 1000, currency: "PHP" },
      { organization_id: orgA.id, client_id: clientA1.id, plan_name: "Phase12 Quarterly", status: "active", billing_cycle: "quarterly", amount: 3000, currency: "PHP" },
      { organization_id: orgA.id, client_id: clientA1.id, plan_name: "Phase12 Yearly", status: "active", billing_cycle: "yearly", amount: 12000, currency: "PHP" },
      { organization_id: orgA.id, client_id: clientA1.id, plan_name: "Phase12 Custom", status: "active", billing_cycle: "custom", amount: 5000, currency: "PHP" },
      { organization_id: orgA.id, client_id: clientA1.id, plan_name: "Phase12 Cancelled", status: "cancelled", billing_cycle: "monthly", amount: 999, currency: "PHP", cancelled_at: manila("2026-02-01") },
    ]);

    // ---- support tickets --------------------------------------------------
    const ticketRows = [
      ["t1", "NXF-TKT-2026-0001", teamAId, null, `${partial.searchTerms.ticket} AssignedTeam`],
      ["t2", "NXF-TKT-2026-0002", adminAId, null, `${partial.searchTerms.ticket} AssignedAdmin`],
      ["t3", "NXF-TKT-2026-0003", adminAId, projects.p7.id, `${partial.searchTerms.ticket} OnManagedProject`],
      ["t4", "NXF-TKT-2026-0004", adminAId, projects.p6.id, `${partial.searchTerms.ticket} OnUnrelatedProject`],
    ];

    const tickets = {};
    for (const [label, number, assignedTo, projectId, title] of ticketRows) {
      tickets[label] = await insertOne(admin, "support_tickets", {
        organization_id: orgA.id,
        client_id: clientA2.id,
        project_id: projectId,
        ticket_number: number,
        title,
        description: "Phase12 fixture ticket",
        category: "general",
        priority: "medium",
        status: "in_progress",
        assigned_to: assignedTo,
        created_by: adminAId,
      });
    }
    partial.tickets = tickets;

    // ---- Organization B cross-tenant control -------------------------------
    partial.leadB = await insertOne(admin, "leads", {
      organization_id: orgB.id,
      full_name: `${partial.searchTerms.crossTenant} OrgB Lead`,
      business_name: "Org B Business",
      email: `phase12-lead-b-${runId}@example.com`,
      service_interest: "Website",
      source: "website",
      status: "won",
      lead_score: 90,
      created_at: manila("2026-03-05"),
      // Both halves together (leads_conversion_pair_check). clientB already
      // exists at this point, so no follow-up update is needed here.
      converted_at: manila("2026-03-10"),
      converted_client_id: clientB.id,
    });

    partial.projectB = await insertOne(admin, "projects", {
      organization_id: orgB.id,
      client_id: clientB.id,
      name: `${partial.searchTerms.crossTenant} OrgB Project`,
      slug: `phase12-project-b-${runId}`,
      status: "development",
      start_date: "2026-01-01",
      target_date: "2026-12-31",
    });

    return partial;
  } catch (error) {
    // Never leave a half-built fixture set behind.
    await cleanupPhase12Fixtures(admin, partial).catch(() => {});
    throw error;
  }
}

/**
 * Deletes every row this factory created, in reverse dependency order.
 * Scoped exclusively to the fixture organizations, clients, projects and auth
 * users -- never a broad predicate. Safe to run twice.
 */
export async function cleanupPhase12Fixtures(admin, fixtures) {
  if (!fixtures) return;

  const errors = [];
  const orgIds = [fixtures.orgA?.id, fixtures.orgB?.id].filter(Boolean);
  const clientIds = [fixtures.clientA1?.id, fixtures.clientA2?.id, fixtures.clientA3?.id, fixtures.clientA4?.id, fixtures.clientB?.id].filter(Boolean);
  const projectIds = Object.values(fixtures.projects ?? {})
    .map((p) => p?.id)
    .filter(Boolean)
    .concat([fixtures.projectB?.id].filter(Boolean));
  const invoiceIds = Object.values(fixtures.invoices ?? {}).map((i) => i?.id).filter(Boolean);
  const proposalIds = Object.values(fixtures.proposals ?? {}).map((p) => p?.id).filter(Boolean);
  const allUsers = Object.values(fixtures.users ?? {});
  const profileIds = allUsers.map((u) => u.profileId).filter(Boolean);

  async function attempt(label, operation) {
    try {
      const result = await operation();
      if (result?.error) throw result.error;
    } catch (error) {
      const detail =
        error instanceof Error
          ? error.message
          : typeof error === "object" && error !== null
            ? JSON.stringify(error)
            : String(error);
      errors.push(`${label}: ${detail}`);
    }
  }

  if (orgIds.length > 0) {
    await attempt("notification_deliveries", async () => {
      const { data } = await admin.from("notifications").select("id").in("organization_id", orgIds);
      const ids = (data ?? []).map((r) => r.id);
      return ids.length > 0
        ? admin.from("notification_deliveries").delete().in("notification_id", ids)
        : { error: null };
    });
    await attempt("notifications", () => admin.from("notifications").delete().in("organization_id", orgIds));
    await attempt("audit_logs", () => admin.from("audit_logs").delete().in("organization_id", orgIds));
    await attempt("ticket_activities", () => admin.from("ticket_activities").delete().in("organization_id", orgIds));
    await attempt("support_tickets", () => admin.from("support_tickets").delete().in("organization_id", orgIds));
    await attempt("subscription_usage", () => admin.from("subscription_usage").delete().in("organization_id", orgIds));
    await attempt("subscriptions", () => admin.from("subscriptions").delete().in("organization_id", orgIds));
    await attempt("payments", () => admin.from("payments").delete().in("organization_id", orgIds));
  }

  if (invoiceIds.length > 0) {
    await attempt("invoice_items", () => admin.from("invoice_items").delete().in("invoice_id", invoiceIds));
  }
  if (orgIds.length > 0) {
    await attempt("invoices", () => admin.from("invoices").delete().in("organization_id", orgIds));
  }

  if (proposalIds.length > 0) {
    await attempt("proposal_items", () => admin.from("proposal_items").delete().in("proposal_id", proposalIds));
    await attempt("proposal_versions", () => admin.from("proposal_versions").delete().in("proposal_id", proposalIds));
    await attempt("proposal_access_tokens", () => admin.from("proposal_access_tokens").delete().in("proposal_id", proposalIds));
  }
  if (orgIds.length > 0) {
    await attempt("proposals", () => admin.from("proposals").delete().in("organization_id", orgIds));
  }

  if (projectIds.length > 0) {
    await attempt("tasks", () => admin.from("tasks").delete().in("project_id", projectIds));
    await attempt("milestones", () => admin.from("milestones").delete().in("project_id", projectIds));
    await attempt("project_members", () => admin.from("project_members").delete().in("project_id", projectIds));
  }
  if (orgIds.length > 0) {
    await attempt("projects", () => admin.from("projects").delete().in("organization_id", orgIds));
    await attempt("lead_activities", () => admin.from("lead_activities").delete().in("organization_id", orgIds));
  }

  // Break the leads <-> clients cycle before deleting either side. Both
  // conversion columns must be cleared in the SAME update: clearing only
  // converted_client_id violates leads_conversion_pair_check.
  if (orgIds.length > 0) {
    await attempt("unlink lead conversions", () =>
      admin
        .from("leads")
        .update({ converted_client_id: null, converted_at: null })
        .in("organization_id", orgIds),
    );
  }
  if (clientIds.length > 0) {
    await attempt("unlink clients.source_lead_id", () =>
      admin.from("clients").update({ source_lead_id: null }).in("id", clientIds),
    );
  }
  if (orgIds.length > 0) {
    await attempt("leads", () => admin.from("leads").delete().in("organization_id", orgIds));
  }
  if (clientIds.length > 0) {
    await attempt("client_users", () => admin.from("client_users").delete().in("client_id", clientIds));
    await attempt("client_invitations", () => admin.from("client_invitations").delete().in("client_id", clientIds));
    await attempt("clients", () => admin.from("clients").delete().in("id", clientIds));
  }
  if (orgIds.length > 0) {
    await attempt("organization_members", () => admin.from("organization_members").delete().in("organization_id", orgIds));
  }

  if (profileIds.length > 0) {
    await attempt("notification_preferences", () =>
      admin.from("notification_preferences").delete().in("profile_id", profileIds),
    );
    await attempt("profiles", () => admin.from("profiles").delete().in("id", profileIds));
  }
  for (const user of allUsers) {
    await attempt(`auth user ${user.label}`, async () => {
      const { error } = await admin.auth.admin.deleteUser(user.authUserId);
      // Cleanup must be rerunnable: an already-deleted user is the desired
      // end state, not a failure. Any OTHER error still surfaces.
      if (error && !/not found/i.test(error.message)) {
        throw new Error(error.message);
      }
      return { error: null };
    });
  }

  if (orgIds.length > 0) {
    await attempt("organizations", () => admin.from("organizations").delete().in("id", orgIds));
  }

  if (errors.length > 0) {
    throw new Error(`Phase 12 fixture cleanup failed:\n${errors.join("\n")}`);
  }
}

/**
 * Counts fixture rows still present for the given organizations. Used to prove
 * a successful run leaves nothing behind.
 */
export async function countPhase12FixtureRows(admin, fixtures) {
  const orgIds = [fixtures?.orgA?.id, fixtures?.orgB?.id].filter(Boolean);
  if (orgIds.length === 0) return {};

  const tables = [
    "leads", "clients", "projects", "proposals", "invoices", "payments",
    "subscriptions", "support_tickets", "audit_logs", "notifications",
    "organization_members",
  ];

  const counts = {};
  for (const table of tables) {
    const { count } = await admin
      .from(table)
      .select("id", { count: "exact", head: true })
      .in("organization_id", orgIds);
    counts[table] = count ?? 0;
  }

  const { count: orgCount } = await admin
    .from("organizations")
    .select("id", { count: "exact", head: true })
    .in("id", orgIds);
  counts.organizations = orgCount ?? 0;

  return counts;
}
