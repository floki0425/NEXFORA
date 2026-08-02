import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  SUPPORT_INTERNAL_TRANSITIONS,
} from "../../../src/features/support/constants.ts";
import {
  canAssignSupportTicket,
  canCreateInternalSupportTicket,
  canTransitionSupportTicket,
} from "../../../src/features/support/permissions.ts";
import {
  internalSupportTicketCreateSchema,
  supportTicketTransitionSchema,
} from "../../../src/features/support/schemas.ts";
import {
  canManageSubscriptions,
  canRecordSubscriptionUsage,
} from "../../../src/features/subscriptions/permissions.ts";
import {
  subscriptionCreateSchema,
  subscriptionUsageSchema,
} from "../../../src/features/subscriptions/schemas.ts";
import {
  dateInputToTimestamp,
  formatHours,
  formatSubscriptionMoney,
  roundHours,
} from "../../../src/features/subscriptions/format.ts";

const UUID = "11111111-1111-4111-8111-111111111111";
const portalSupportSchemas = readFileSync(
  new URL("../../../src/features/portal/support/schemas.ts", import.meta.url),
  "utf8",
);
const subscriptionActions = readFileSync(
  new URL("../../../src/features/subscriptions/actions.ts", import.meta.url),
  "utf8",
);

function member(role, profileId = UUID) {
  return { role, profileId };
}

test("support ticket schemas accept owned business input and reject blank required fields", () => {
  const valid = {
    clientId: UUID,
    projectId: "",
    title: "Production issue",
    description: "The website returns an error.",
    category: "Website",
    priority: "urgent",
  };
  assert.equal(internalSupportTicketCreateSchema.safeParse(valid).success, true);
  assert.equal(
    internalSupportTicketCreateSchema.safeParse({ ...valid, title: " " })
      .success,
    false,
  );
  assert.equal(
    internalSupportTicketCreateSchema.safeParse({
      ...valid,
      priority: "critical",
    }).success,
    false,
  );
});

test("portal ticket input never accepts tenant, actor, number, assignment, or status fields as part of its schema", () => {
  for (const serverOwned of [
    "organizationId",
    "clientId",
    "ticketNumber",
    "createdBy",
    "assignedTo",
    "status",
  ]) {
    assert.doesNotMatch(
      portalSupportSchemas,
      new RegExp(`\\b${serverOwned}\\s*:`),
    );
  }
});

test("resolution and reopen validation require meaningful notes", () => {
  assert.equal(
    supportTicketTransitionSchema.safeParse({
      status: "resolved",
      resolutionNote: " ",
    }).success,
    false,
  );
  assert.equal(
    supportTicketTransitionSchema.safeParse({
      status: "resolved",
      resolutionNote: "Cache rules corrected.",
    }).success,
    true,
  );
  assert.match(
    portalSupportSchemas,
    /portalSupportReopenSchema[\s\S]*?comment:[\s\S]*?\.trim\(\)[\s\S]*?\.min\(1,/,
  );
});

test("application transition map matches the corrected database workflow", () => {
  assert.deepEqual(SUPPORT_INTERNAL_TRANSITIONS, {
    open: ["assigned"],
    assigned: ["in_progress"],
    in_progress: ["waiting_for_client", "resolved"],
    waiting_for_client: ["in_progress", "resolved"],
    resolved: [],
    closed: [],
  });
});

test("only admins create internal tickets; PMs may assign; team members transition only self-assigned tickets", () => {
  assert.equal(canCreateInternalSupportTicket(member("super_admin")), true);
  assert.equal(canCreateInternalSupportTicket(member("admin")), true);
  assert.equal(canCreateInternalSupportTicket(member("project_manager")), false);
  assert.equal(canCreateInternalSupportTicket(member("team_member")), false);

  assert.equal(
    canAssignSupportTicket(member("project_manager"), {
      assignedTo: null,
      hasProjectAccess: true,
    }),
    true,
  );
  assert.equal(
    canAssignSupportTicket(member("team_member"), {
      assignedTo: UUID,
      hasProjectAccess: true,
    }),
    false,
  );
  assert.equal(
    canTransitionSupportTicket(member("team_member"), {
      assignedTo: UUID,
      hasProjectAccess: false,
    }),
    true,
  );
  assert.equal(
    canTransitionSupportTicket(member("team_member"), {
      assignedTo: "22222222-2222-4222-8222-222222222222",
      hasProjectAccess: false,
    }),
    false,
  );
});

test("subscription schemas reject invalid cycles, negative money/hours, and zero usage", () => {
  const valid = {
    clientId: UUID,
    projectId: "",
    planName: "Monthly care",
    status: "active",
    billingCycle: "monthly",
    amount: "5000.00",
    currency: "PHP",
    includedHours: "10",
    startedAt: "2026-08-01",
    renewalAt: "2026-09-01",
    notes: "",
  };
  assert.equal(subscriptionCreateSchema.safeParse(valid).success, true);
  assert.equal(
    subscriptionCreateSchema.safeParse({ ...valid, projectId: "tampered" })
      .success,
    false,
  );
  assert.equal(
    subscriptionCreateSchema.safeParse({ ...valid, status: "cancelled" })
      .success,
    false,
  );
  assert.equal(
    subscriptionCreateSchema.safeParse({ ...valid, billingCycle: "weekly" })
      .success,
    false,
  );
  assert.equal(
    subscriptionCreateSchema.safeParse({ ...valid, amount: "-1" }).success,
    false,
  );
  assert.equal(
    subscriptionCreateSchema.safeParse({ ...valid, includedHours: "-0.5" })
      .success,
    false,
  );
  assert.equal(
    subscriptionUsageSchema.safeParse({
      description: "Support",
      hoursUsed: "0",
      usageDate: "2026-08-01",
    }).success,
    false,
  );
  assert.equal(
    subscriptionUsageSchema.safeParse({
      description: "Support",
      hoursUsed: "1",
      usageDate: "2026-02-31",
    }).success,
    false,
  );
});

test("subscription creation omits the update-only cancellation timestamp", () => {
  const createAction = subscriptionActions.slice(
    subscriptionActions.indexOf("export async function createSubscriptionAction"),
    subscriptionActions.indexOf("export async function updateSubscriptionAction"),
  );
  assert.doesNotMatch(createAction, /cancelled_at/);
});

test("subscription role helpers preserve manager and append-only usage boundaries", () => {
  assert.equal(canManageSubscriptions("super_admin"), true);
  assert.equal(canManageSubscriptions("admin"), true);
  assert.equal(canManageSubscriptions("project_manager"), false);
  assert.equal(canManageSubscriptions("team_member"), false);
  assert.equal(canRecordSubscriptionUsage("project_manager"), true);
  assert.equal(canRecordSubscriptionUsage("team_member"), false);
});

test("subscription formatting preserves decimal money, hours, and Manila date input", () => {
  assert.match(formatSubscriptionMoney(1500.5, "PHP"), /1,500\.50/);
  assert.equal(formatHours(-0.75), "-0.75");
  assert.equal(roundHours(0.3 - (0.1 + 0.2)), 0);
  assert.equal(
    dateInputToTimestamp("2026-08-01"),
    "2026-07-31T16:00:00.000Z",
  );
});
