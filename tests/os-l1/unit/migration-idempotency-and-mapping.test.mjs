import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  INGESTION_FN,
  compactSql,
  extractFunctionDefinition,
  readIngestionMigration,
  stripSqlComments,
} from "../helpers/migration-test-helpers.mjs";

async function functionBody() {
  const sql = stripSqlComments(await readIngestionMigration());
  return compactSql(extractFunctionDefinition(sql, INGESTION_FN));
}

describe("OS-L1 ingestion idempotency", () => {
  test("the external identity is unique in the schema, not only in code", async () => {
    const sql = stripSqlComments(await readIngestionMigration());
    const compact = compactSql(sql);

    // A code-only check would let a concurrent retry through. The constraint
    // is what actually makes "one website inquiry -> one OS lead" true.
    assert.ok(
      compact.includes(
        "constraint website_inquiry_imports_idempotency_key_unique unique (idempotency_key)",
      ),
      "idempotency_key must carry a unique constraint",
    );
    assert.ok(
      compact.includes(
        "constraint website_inquiry_imports_lead_id_unique unique (lead_id)",
      ),
      "lead_id must be unique so one lead cannot map to two inquiries",
    );
  });

  test("concurrent deliveries of the same inquiry are serialized", async () => {
    const body = await functionBody();

    assert.ok(
      body.includes("pg_catalog.pg_advisory_xact_lock"),
      "an advisory lock must serialize same-key deliveries",
    );
    assert.ok(
      body.includes("hashtextextended(p_idempotency_key::text, 0)"),
      "the lock must be taken on the idempotency key, not on something coarser",
    );
  });

  test("a replay returns the original lead instead of raising or duplicating", async () => {
    const body = await functionBody();

    assert.ok(
      body.includes("'status', 'duplicate'"),
      "a replay must report duplicate",
    );
    assert.ok(
      body.includes("when unique_violation then"),
      "a lost race must still resolve to the existing lead",
    );

    // The handler must re-read the ledger rather than assume; `raise` remains
    // reachable so a unique violation from any OTHER cause is not swallowed.
    const handler = body.slice(body.indexOf("when unique_violation then"));
    assert.ok(handler.includes("where import.idempotency_key = p_idempotency_key"));
    assert.ok(handler.includes("raise;"));
  });

  test("the advisory lock is taken before the existence check", async () => {
    const body = await functionBody();
    const lockIndex = body.indexOf("pg_advisory_xact_lock");
    const checkIndex = body.indexOf(
      "select import.lead_id into v_existing_lead_id",
    );

    assert.ok(lockIndex > -1 && checkIndex > -1);
    assert.ok(
      lockIndex < checkIndex,
      "locking after the check would leave the race it exists to close",
    );
  });
});

describe("OS-L1 canonical value mapping", () => {
  test("every website service value maps to a lead service_interest", async () => {
    const body = await functionBody();

    for (const value of [
      "website_development",
      "ecommerce_development",
      "booking_systems",
      "ordering_systems",
      "web_applications",
      "mobile_applications",
      "custom_business_systems",
      "not_sure_yet",
    ]) {
      assert.ok(
        body.includes(`when '${value}' then`),
        `service value "${value}" must be mapped`,
      );
    }
  });

  test("an unknown canonical value is rejected rather than silently stored", async () => {
    const body = await functionBody();

    for (const message of [
      "Unknown website inquiry service value.",
      "Unknown website inquiry timeline value.",
      "Unknown website inquiry budget value.",
      "Unknown website inquiry contact method.",
    ]) {
      assert.ok(body.includes(message), `expected a guard for: ${message}`);
    }
  });

  test("budget bands map to numeric bounds, never to floating point money", async () => {
    const body = await functionBody();

    assert.ok(body.includes("v_budget_min numeric(12, 2)"));
    assert.ok(body.includes("v_budget_max numeric(12, 2)"));
    assert.ok(body.includes("when '250000_plus' then v_budget_min := 250000; v_budget_max := null;"));
    assert.ok(body.includes("when 'not_sure_yet' then v_budget_min := null; v_budget_max := null;"));
  });

  test("the canonical values are stored unrewritten alongside the mapped lead", async () => {
    const body = await functionBody();
    const ledgerInsert = body.slice(
      body.indexOf("insert into public.website_inquiry_imports"),
    );

    // STEP 12 of the OS-L1 brief: preserve canonical values, transform for
    // presentation only. The mapped labels go on the lead; the raw website
    // enums go here.
    assert.ok(ledgerInsert.includes("p_service_needed"));
    assert.ok(ledgerInsert.includes("v_estimated_budget"));
    assert.ok(ledgerInsert.includes("v_target_timeline"));
    assert.ok(ledgerInsert.includes("p_preferred_contact_method"));
  });

  test("the ingested lead enters the existing pipeline at 'new'", async () => {
    const body = await functionBody();
    const leadInsert = body.slice(
      body.indexOf("insert into public.leads"),
      body.indexOf("insert into public.website_inquiry_imports"),
    );

    assert.ok(leadInsert.includes("'website'"), "source must be website");
    assert.ok(
      leadInsert.includes("'Start a Project form'"),
      "source_detail must distinguish the website funnel from the OS's own form",
    );
    assert.ok(leadInsert.includes("'new'"), "status must default to new");
  });

  test("the submission timestamp is bounded rather than trusted", async () => {
    const body = await functionBody();

    assert.ok(body.includes("p_submitted_at > v_now + interval '5 minutes'"));
    assert.ok(body.includes("p_submitted_at < v_now - interval '30 days'"));
    assert.ok(body.includes("Website inquiry submission timestamp is out of range."));
  });

  test("the email is normalized to satisfy the leads CHECK constraint", async () => {
    const body = await functionBody();

    assert.ok(
      body.includes("pg_catalog.lower(pg_catalog.btrim(p_email))"),
      "leads_email_format requires a lowercased, trimmed address",
    );
  });
});
