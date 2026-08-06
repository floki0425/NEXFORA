import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { INTERNAL_ROLES } from "../../../src/lib/auth/types.ts";
import {
  REPORT_IDS,
  REPORT_ROUTES,
} from "../../../src/features/reports/constants.ts";
import {
  canViewAnyReport,
  canViewReport,
  visibleReportsForRole,
} from "../../../src/features/reports/permissions.ts";
import { SEARCH_ENTITY_TYPES } from "../../../src/features/search/constants.ts";
import {
  canSearchEntity,
  canUseGlobalSearch,
  searchableEntitiesForRole,
} from "../../../src/features/search/permissions.ts";

// The locked report matrix. project_manager sees Project Delivery only, and
// only rows for projects they own (the RPC enforces the row scope).
const EXPECTED_REPORT_ACCESS = {
  super_admin: [
    "lead_conversion",
    "lead_source",
    "proposal_win_rate",
    "revenue",
    "project_delivery",
  ],
  admin: [
    "lead_conversion",
    "lead_source",
    "proposal_win_rate",
    "revenue",
    "project_delivery",
  ],
  project_manager: ["project_delivery"],
  team_member: [],
};

// The locked per-entity search matrix.
const EXPECTED_SEARCH_ACCESS = {
  super_admin: ["lead", "client", "project", "proposal", "invoice", "support_ticket"],
  admin: ["lead", "client", "project", "proposal", "invoice", "support_ticket"],
  project_manager: ["client", "project", "support_ticket"],
  team_member: ["project", "support_ticket"],
};

describe("report permission truth table", () => {
  test("every internal role is covered by the matrix", () => {
    assert.deepEqual([...INTERNAL_ROLES].sort(), Object.keys(EXPECTED_REPORT_ACCESS).sort());
  });

  for (const role of INTERNAL_ROLES) {
    test(`${role} sees exactly its permitted reports`, () => {
      const expected = EXPECTED_REPORT_ACCESS[role];

      for (const reportId of REPORT_IDS) {
        assert.equal(
          canViewReport(role, reportId),
          expected.includes(reportId),
          `${role} -> ${reportId}`,
        );
      }

      assert.deepEqual([...visibleReportsForRole(role)].sort(), [...expected].sort());
    });
  }

  test("revenue is restricted to super_admin and admin", () => {
    assert.equal(canViewReport("super_admin", "revenue"), true);
    assert.equal(canViewReport("admin", "revenue"), true);
    assert.equal(canViewReport("project_manager", "revenue"), false);
    assert.equal(canViewReport("team_member", "revenue"), false);
  });

  test("project delivery is the only report a project_manager may open", () => {
    assert.deepEqual(visibleReportsForRole("project_manager"), ["project_delivery"]);
  });

  test("team_member has no reporting access at all", () => {
    assert.equal(canViewAnyReport("team_member"), false);
    assert.deepEqual(visibleReportsForRole("team_member"), []);
  });

  test("every report id has a route", () => {
    for (const reportId of REPORT_IDS) {
      assert.match(REPORT_ROUTES[reportId], /^\/admin\/reports\/[a-z-]+$/);
    }
  });
});

describe("global search permission truth table", () => {
  test("every internal role may open search", () => {
    for (const role of INTERNAL_ROLES) {
      assert.equal(canUseGlobalSearch(role), true, `${role} may open search`);
    }
  });

  for (const role of INTERNAL_ROLES) {
    test(`${role} can only ever match its permitted entities`, () => {
      const expected = EXPECTED_SEARCH_ACCESS[role];

      for (const entityType of SEARCH_ENTITY_TYPES) {
        assert.equal(
          canSearchEntity(role, entityType),
          expected.includes(entityType),
          `${role} -> ${entityType}`,
        );
      }

      assert.deepEqual([...searchableEntitiesForRole(role)].sort(), [...expected].sort());
    });
  }

  test("leads, proposals and invoices are admin-only in search", () => {
    for (const entityType of ["lead", "proposal", "invoice"]) {
      assert.equal(canSearchEntity("super_admin", entityType), true);
      assert.equal(canSearchEntity("admin", entityType), true);
      assert.equal(canSearchEntity("project_manager", entityType), false);
      assert.equal(canSearchEntity("team_member", entityType), false);
    }
  });

  test("a team_member gets no client results but can still match projects and tickets", () => {
    assert.equal(canSearchEntity("team_member", "client"), false);
    assert.equal(canSearchEntity("team_member", "project"), true);
    assert.equal(canSearchEntity("team_member", "support_ticket"), true);
  });
});
