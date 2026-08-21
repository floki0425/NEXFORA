import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { describe, test } from "node:test";

import {
  normalizeSql,
  stripSqlComments,
} from "../helpers/migration-test-helpers.mjs";

// Regression guard for the OS-L1 NULLIF defect.
//
// 20260817000000_os_l1_website_inquiry_ingestion.sql wrote five calls as
// `pg_catalog.nullif(...)`. NULLIF, COALESCE, GREATEST, LEAST and friends are
// SQL *grammar* -- the parser rewrites them into CASE expressions -- so they
// have no pg_catalog entry and cannot be schema-qualified.
//
// PL/pgSQL resolves expressions lazily, so that migration APPLIED CLEANLY and
// only failed on the first real call, with 42883 "function
// pg_catalog.nullif(text, unknown) does not exist". Applying a migration
// successfully therefore proves nothing here; only a static check like this
// one catches it before a website inquiry is silently dropped.
//
// Fixed forward by 20260821000000_fix_os_l1_nullif.sql.
//
// Every check below runs against COMMENT-STRIPPED sql. Both this suite and the
// fix migration name the bad call in prose to explain it; matching raw text
// would flag those explanations as defects.

const MIGRATIONS_DIR = new URL("../../../supabase/migrations/", import.meta.url);

const INGESTION_HEAD =
  "create or replace function public.ingest_website_project_inquiry(";

// Grammar constructs Postgres parses into expression nodes. Schema-qualifying
// any of these is always a runtime error, never a style choice.
const SQL_SYNTAX_NOT_FUNCTIONS = [
  "nullif",
  "coalesce",
  "greatest",
  "least",
  "case",
  "cast",
  "extract",
  "overlay",
  "position",
  "substring",
  "trim",
  "collate",
];

// The original OS-L1 migration is already applied to real databases. Editing an
// applied migration is the one repair this project does not do, so its five bad
// calls stay on disk and are corrected forward instead. It is grandfathered
// here BY NAME so that every other file -- including any future migration --
// still fails this check.
const GRANDFATHERED = new Set([
  "20260817000000_os_l1_website_inquiry_ingestion.sql",
]);

async function readAllMigrations() {
  const names = (await readdir(MIGRATIONS_DIR))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  return Promise.all(
    names.map(async (name) => ({
      name,
      sql: stripSqlComments(
        normalizeSql(await readFile(new URL(name, MIGRATIONS_DIR), "utf8")),
      ),
    })),
  );
}

function findAuthoritativeIngestion(migrations) {
  // The LAST definition in apply order is what a fresh replay ends up with.
  const definers = migrations.filter(({ sql }) => sql.includes(INGESTION_HEAD));
  assert.ok(definers.length >= 1, "expected at least one ingestion definition");
  return definers[definers.length - 1];
}

describe("SQL grammar is never schema-qualified", () => {
  test("no migration schema-qualifies a syntax construct", async () => {
    const migrations = await readAllMigrations();
    assert.ok(migrations.length > 0, "expected migrations on disk");

    const offenders = [];
    for (const { name, sql } of migrations) {
      if (GRANDFATHERED.has(name)) continue;
      for (const keyword of SQL_SYNTAX_NOT_FUNCTIONS) {
        const pattern = new RegExp(
          "pg_catalog[.]" + keyword + "[^a-z0-9_]",
          "gi",
        );
        const hits = sql.match(pattern);
        if (hits) {
          offenders.push(`${name}: pg_catalog.${keyword}( x${hits.length}`);
        }
      }
    }

    assert.deepEqual(
      offenders,
      [],
      `schema-qualified SQL grammar fails at runtime with 42883: ${offenders.join(" | ")}`,
    );
  });

  test("the grandfathered file is the only one still carrying the defect", async () => {
    const migrations = await readAllMigrations();

    // If someone fixes the historical file in place, or deletes it, this test
    // fails and the exemption above must be revisited rather than left to rot.
    for (const name of GRANDFATHERED) {
      const migration = migrations.find((entry) => entry.name === name);
      assert.ok(migration, `grandfathered migration ${name} is missing`);
      assert.ok(
        /pg_catalog\.nullif\s*\(/i.test(migration.sql),
        `${name} no longer contains the defect -- drop it from GRANDFATHERED`,
      );
    }
  });

  test("the authoritative ingestion definition uses bare nullif", async () => {
    const migrations = await readAllMigrations();
    const authoritative = findAuthoritativeIngestion(migrations);

    assert.ok(
      !/pg_catalog\.nullif\s*\(/i.test(authoritative.sql),
      `${authoritative.name} must call nullif() unqualified`,
    );
    assert.ok(
      /\bnullif\s*\(/i.test(authoritative.sql),
      `${authoritative.name} should still normalize empty strings with nullif()`,
    );
  });

  test("btrim stays schema-qualified, because it IS a catalog function", async () => {
    const migrations = await readAllMigrations();
    const authoritative = findAuthoritativeIngestion(migrations);

    // Under `set search_path = ''` an unqualified btrim would not resolve, so
    // this qualification is load-bearing and must not be "tidied up" alongside
    // the nullif fix.
    assert.ok(
      /pg_catalog\.btrim\s*\(/.test(authoritative.sql),
      "btrim must remain pg_catalog-qualified under an empty search_path",
    );
  });

  test("the forward fix preserves the function contract verbatim", async () => {
    const migrations = await readAllMigrations();
    const authoritative = findAuthoritativeIngestion(migrations);
    const { sql } = authoritative;

    for (const required of [
      "p_idempotency_key uuid",
      "p_submitted_at timestamptz",
      "returns jsonb",
      "security definer",
      "set search_path = ''",
      "pg_advisory_xact_lock",
      "when unique_violation then",
      "'status', 'duplicate'",
      "'status', 'created'",
      "to service_role",
    ]) {
      assert.ok(
        sql.includes(required),
        `${authoritative.name} must preserve: ${required}`,
      );
    }

    assert.ok(
      !/grant execute on function public\.ingest_website_project_inquiry\([^)]*\)\s*to\s+(anon|authenticated)/i.test(sql),
      "the ingestion function must stay service_role-only",
    );
  });
});
