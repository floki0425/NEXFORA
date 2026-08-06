import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  readReportingMigration,
  readSearchMigration,
  stripSqlComments,
} from "../helpers/migration-test-helpers.mjs";

const REPORTING_INDEXES = [
  "leads_organization_converted_idx",
  "leads_organization_source_created_idx",
  "proposals_organization_sent_idx",
  "proposals_organization_accepted_idx",
  "invoices_organization_issue_date_idx",
  "payments_organization_paid_at_idx",
  "payments_invoice_paid_idx",
  "projects_organization_completed_idx",
  "projects_organization_target_open_idx",
  "projects_organization_manager_client_idx",
  "milestones_project_due_open_idx",
  "tasks_project_completed_idx",
];

const TRIGRAM_INDEXES = [
  ["leads_full_name_trgm_idx", "public.leads", "full_name"],
  ["leads_business_name_trgm_idx", "public.leads", "business_name"],
  ["leads_email_trgm_idx", "public.leads", "email"],
  ["clients_business_name_trgm_idx", "public.clients", "business_name"],
  ["clients_contact_name_trgm_idx", "public.clients", "contact_name"],
  ["clients_email_trgm_idx", "public.clients", "email"],
  ["projects_name_trgm_idx", "public.projects", "name"],
  ["proposals_title_trgm_idx", "public.proposals", "title"],
  ["proposals_number_trgm_idx", "public.proposals", "proposal_number"],
  ["invoices_number_trgm_idx", "public.invoices", "invoice_number"],
  ["support_tickets_number_trgm_idx", "public.support_tickets", "ticket_number"],
  ["support_tickets_title_trgm_idx", "public.support_tickets", "title"],
];

describe("Phase 12A indexes", () => {
  test("all twelve reporting indexes exist and are idempotent", async () => {
    const migration = await readReportingMigration();

    for (const name of REPORTING_INDEXES) {
      assert.ok(
        migration.includes(`create index if not exists ${name}`),
        `missing idempotent reporting index ${name}`,
      );
    }

    assert.equal(
      [...migration.matchAll(/create index/g)].length,
      REPORTING_INDEXES.length,
      "reporting migration should create exactly the expected indexes",
    );
  });

  test("every reporting index uses `if not exists`", async () => {
    const migration = await readReportingMigration();
    const total = [...migration.matchAll(/create index/g)].length;
    const idempotent = [...migration.matchAll(/create index if not exists/g)].length;

    assert.equal(total, idempotent, "every index must be idempotent");
  });

  test("the search migration enables pg_trgm in the extensions schema", async () => {
    const migration = await readSearchMigration();

    assert.ok(
      migration.includes(
        "create extension if not exists pg_trgm with schema extensions",
      ),
      "pg_trgm must be installed idempotently into the extensions schema",
    );
    assert.ok(
      migration.includes("to_regnamespace('extensions') is null"),
      "preflight must verify the extensions schema exists",
    );
  });

  test("all twelve trigram indexes exist, are idempotent, and target the right column", async () => {
    const migration = await readSearchMigration();

    for (const [name, table, column] of TRIGRAM_INDEXES) {
      assert.ok(
        migration.includes(`create index if not exists ${name}`),
        `missing idempotent trigram index ${name}`,
      );
      assert.ok(
        migration.includes(
          `on ${table} using gin (${column} extensions.gin_trgm_ops)`,
        ),
        `${name} must be a GIN trigram index on ${table}.${column}`,
      );
    }

    assert.equal(
      [...migration.matchAll(/create index/g)].length,
      TRIGRAM_INDEXES.length,
      "search migration should create exactly the expected indexes",
    );
  });

  test("every gin_trgm_ops reference is schema-qualified", async () => {
    // Executable SQL only -- the file's own comments discuss the unqualified
    // form in order to warn against it.
    const migration = stripSqlComments(await readSearchMigration());

    const total = [...migration.matchAll(/gin_trgm_ops/g)].length;
    const qualified = [...migration.matchAll(/extensions\.gin_trgm_ops/g)].length;

    // Every function here runs with search_path = '', so an unqualified
    // gin_trgm_ops fails at index-creation time.
    assert.equal(
      total,
      qualified,
      "an unqualified gin_trgm_ops will fail under search_path = ''",
    );
  });
});
