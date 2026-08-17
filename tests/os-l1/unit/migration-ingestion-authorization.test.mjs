import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  INGESTION_FN,
  compactSql,
  extractFunctionDefinition,
  extractGrantBlock,
  readIngestionMigration,
  stripSqlComments,
} from "../helpers/migration-test-helpers.mjs";

const LEDGER_TABLE = "public.website_inquiry_imports";

async function executableSql() {
  return stripSqlComments(await readIngestionMigration());
}

describe("OS-L1 ingestion migration authorization", () => {
  test("the ingestion function is reachable by service_role only", async () => {
    const sql = await executableSql();
    const grants = compactSql(extractGrantBlock(sql, INGESTION_FN));

    // This is the boundary the whole integration rests on. Unlike
    // public.submit_project_inquiry (the OS's own on-site form, which anon
    // must be able to call), this entry point writes leads on behalf of an
    // external system and must never be callable from a browser session.
    assert.ok(
      /revoke all on function public\.ingest_website_project_inquiry\([^)]*\) from public, anon, authenticated/.test(
        grants,
      ),
      "ingestion function must revoke public, anon and authenticated",
    );
    assert.ok(
      /grant execute on function public\.ingest_website_project_inquiry\([^)]*\) to service_role/.test(
        grants,
      ),
      "ingestion function must grant execute to service_role",
    );
    assert.ok(
      !/grant execute on function public\.ingest_website_project_inquiry\([^)]*\) to (anon|authenticated)/.test(
        grants,
      ),
      "ingestion function must never grant execute to anon or authenticated",
    );
  });

  test("the ingestion function pins an empty search_path as a definer", async () => {
    const sql = await executableSql();
    const definition = compactSql(extractFunctionDefinition(sql, INGESTION_FN));

    // SECURITY DEFINER is required — the ledger grants nothing to
    // service_role, so the function's owner is the only writer — which makes
    // the pinned search_path mandatory rather than stylistic.
    assert.ok(definition.includes("security definer"));
    assert.ok(definition.includes("set search_path = ''"));
  });

  test("the ledger is readable only by internal members and writable by nobody", async () => {
    const sql = await executableSql();
    const compact = compactSql(sql);

    assert.ok(
      compact.includes(
        "alter table public.website_inquiry_imports enable row level security",
      ),
      "the ledger must have RLS enabled",
    );
    assert.ok(
      /revoke all privileges on table public\.website_inquiry_imports from public, anon, authenticated/.test(
        compact,
      ),
      "the ledger must revoke the default privileges",
    );
    assert.ok(
      compact.includes(
        "grant select on table public.website_inquiry_imports to authenticated",
      ),
      "internal members read the ledger through an ordinary session",
    );

    for (const privilege of ["insert", "update", "delete"]) {
      assert.ok(
        !new RegExp(
          `grant ${privilege}[^;]*on table public\\.website_inquiry_imports`,
        ).test(compact),
        `the ledger must never grant ${privilege} to a session role`,
      );
    }

    // Least privilege: even the service role reaches this table only through
    // the definer function, so a compromised secret key cannot rewrite the
    // sync ledger directly.
    assert.ok(
      !new RegExp(
        `grant [a-z ,()_]*on table public\\.website_inquiry_imports to service_role`,
      ).test(compact),
      "the ledger must not be granted to service_role",
    );
  });

  test("the only RLS policy on the ledger is an internal-member SELECT", async () => {
    const sql = await executableSql();
    const compact = compactSql(sql);
    const policies = [
      ...compact.matchAll(
        /create policy ([a-z_]+) on public\.website_inquiry_imports for ([a-z]+) to ([a-z]+)/g,
      ),
    ];

    assert.equal(policies.length, 1, "expected exactly one policy");
    assert.equal(policies[0][2], "select");
    assert.equal(policies[0][3], "authenticated");
    assert.ok(
      compact.includes(
        "private.is_internal_member( website_inquiry_imports.organization_id )",
      ),
      "the policy must scope by internal membership of the owning organization",
    );
    assert.ok(
      !/using \(\s*true\s*\)/.test(compact),
      "no broad using(true) policy may exist",
    );
  });

  test("RLS is not forced, so the definer function can still write", async () => {
    const sql = await executableSql();

    // force row level security would apply the policies to the table owner
    // too, which is the role the SECURITY DEFINER function runs as — the
    // insert would then be silently filtered out. Matches how public.leads
    // and public.lead_activities are configured.
    assert.ok(
      !/force row level security/.test(sql),
      "the ledger must not force RLS",
    );
  });

  test("the migration is additive and drops nothing", async () => {
    const sql = await executableSql();

    for (const forbidden of [
      "drop table",
      "drop column",
      "drop policy",
      "disable row level security",
      "alter table public.leads",
    ]) {
      assert.ok(
        !sql.toLowerCase().includes(forbidden),
        `migration must not contain "${forbidden}"`,
      );
    }
  });

  test("the ledger is preflighted against the tables it depends on", async () => {
    const sql = await executableSql();
    const compact = compactSql(sql);

    assert.ok(compact.includes("to_regclass('public.organizations') is null"));
    assert.ok(compact.includes("to_regclass('public.leads') is null"));
    assert.ok(compact.includes("to_regclass('public.lead_activities') is null"));
  });

  test("the ledger stores no applicant PII", async () => {
    const sql = await executableSql();
    const createTable = sql.slice(
      sql.indexOf(`create table ${LEDGER_TABLE}`),
      sql.indexOf("create index website_inquiry_imports"),
    );

    // Column NAMES only. Matching anywhere in the block would trip over the
    // CHECK literal 'email' in preferred_contact_method, which is a value the
    // ledger stores, not a copy of the applicant's address.
    const columns = [
      ...createTable.matchAll(
        /^ {2}([a-z_]+) (uuid|text|timestamptz|numeric|integer|boolean|jsonb)\b/gm,
      ),
    ].map((match) => match[1]);

    assert.ok(columns.length >= 10, "expected to parse the ledger's columns");

    // The lead row is the single home for the applicant's identity. A column
    // added here would silently create a second copy governed by a different
    // policy set.
    for (const forbidden of [
      "full_name",
      "email",
      "phone",
      "business_organization",
      "business_name",
      "project_description",
      "problem_summary",
      "consent_version",
      "consented_at",
    ]) {
      assert.ok(
        !columns.includes(forbidden),
        `the ledger must not store "${forbidden}"`,
      );
    }
  });
});
