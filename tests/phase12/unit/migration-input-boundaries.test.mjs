import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  REPORT_FUNCTIONS,
  compactSql,
  extractFunctionDefinition,
  readReportingMigration,
  readSearchMigration,
} from "../helpers/migration-test-helpers.mjs";

// These assertions exist because the route-level Zod schemas and the
// TypeScript range helpers are CONVENIENCES, not protection. A caller with a
// session can invoke any of these RPCs directly through PostgREST, bypassing
// every line of application code. Each bound below must therefore hold in
// SQL on its own.

const SEARCH_FN = "public.search_workspace";

describe("reporting RPC server-side date boundaries", () => {
  test("every report RPC routes its window through the validating helper", async () => {
    const migration = await readReportingMigration();

    for (const fn of REPORT_FUNCTIONS) {
      const definition = compactSql(extractFunctionDefinition(migration, fn));

      assert.ok(
        definition.includes("private.resolve_report_window(p_from, p_to)"),
        `${fn} must validate its window server-side`,
      );
    }
  });

  test("a null start or end date is rejected, not silently defaulted", async () => {
    const migration = await readReportingMigration();
    const helper = compactSql(
      extractFunctionDefinition(migration, "private.resolve_report_window"),
    );

    assert.ok(
      helper.includes("if p_from is null or p_to is null then"),
      "null bounds must be rejected explicitly",
    );
    assert.match(
      helper,
      /p_from is null or p_to is null then raise exception using errcode = 'P0001'/,
      "a null bound must raise P0001, not fall through",
    );

    // Silently substituting a default would hand a broken caller a
    // plausible-looking report instead of telling it that it sent nothing.
    assert.ok(
      !helper.includes("coalesce(p_to"),
      "p_to must not be defaulted away",
    );
    assert.ok(
      !helper.includes("coalesce(p_from"),
      "p_from must not be defaulted away",
    );
  });

  test("a reversed range is rejected with a user-safe P0001", async () => {
    const migration = await readReportingMigration();
    const helper = compactSql(
      extractFunctionDefinition(migration, "private.resolve_report_window"),
    );

    assert.match(
      helper,
      /if p_to < p_from then raise exception using errcode = 'P0001'/,
      "a reversed range must raise",
    );
    assert.ok(
      helper.includes("The report end date must not be before the start date."),
      "the message must be user-safe and free of SQL detail",
    );
  });

  test("a range longer than 366 days is rejected with a user-safe P0001", async () => {
    const migration = await readReportingMigration();
    const helper = compactSql(
      extractFunctionDefinition(migration, "private.resolve_report_window"),
    );

    assert.match(
      helper,
      /if p_to - p_from > 365 then raise exception using errcode = 'P0001'/,
      "365 days of difference is 366 inclusive; anything more must raise",
    );
    assert.ok(
      helper.includes("The report date range must not exceed 366 days."),
      "the message must be user-safe",
    );
  });

  test("the 366-day rule is expressed once, in SQL, and matches the TS constant", async () => {
    const migration = await readReportingMigration();
    const { MAX_REPORT_RANGE_DAYS } = await import(
      "../../../src/lib/reporting/date-range.ts"
    );

    assert.equal(MAX_REPORT_RANGE_DAYS, 366);
    assert.ok(
      compactSql(migration).includes("p_to - p_from > 365"),
      "SQL bound and TS constant must not drift",
    );
  });

  test("no report RPC leaks SQL detail in an error message", async () => {
    const migration = await readReportingMigration();
    const messages = [...migration.matchAll(/message = '([^']+)'/g)].map(
      (match) => match[1],
    );

    assert.ok(messages.length > 0, "expected user-facing messages");

    for (const message of messages) {
      for (const leak of ["select ", "public.", "private.", "pg_", "$function$"]) {
        assert.ok(
          !message.toLowerCase().includes(leak),
          `message leaks internal detail: "${message}"`,
        );
      }
    }
  });
});

describe("search_workspace server-side input boundaries", () => {
  test("the minimum query length is enforced in SQL and returns no rows rather than erroring", async () => {
    const migration = await readSearchMigration();
    const definition = compactSql(extractFunctionDefinition(migration, SEARCH_FN));

    assert.match(
      definition,
      /if char_length\(normalized_query\) < 2 then return; end if;/,
      "a sub-minimum query is below threshold, not invalid -- it must return empty",
    );
  });

  test("the maximum query length is enforced by truncation, before matching", async () => {
    const migration = await readSearchMigration();
    const definition = compactSql(extractFunctionDefinition(migration, SEARCH_FN));

    assert.match(
      definition,
      /if char_length\(normalized_query\) > 120 then normalized_query := left\(normalized_query, 120\); end if;/,
      "over-long input must be truncated, not rejected",
    );

    // Truncation must precede pattern construction, or the bound is cosmetic.
    const truncateAt = definition.indexOf("left(normalized_query, 120)");
    const patternAt = definition.indexOf("like_pattern :=");
    assert.ok(truncateAt > -1 && patternAt > -1 && truncateAt < patternAt);
  });

  test("the SQL and TypeScript query-length bounds agree", async () => {
    const migration = await readSearchMigration();
    const { SEARCH_MIN_QUERY_LENGTH, SEARCH_MAX_QUERY_LENGTH } = await import(
      "../../../src/lib/search/sanitize.ts"
    );

    assert.equal(SEARCH_MIN_QUERY_LENGTH, 2);
    assert.equal(SEARCH_MAX_QUERY_LENGTH, 120);
    assert.ok(migration.includes("char_length(normalized_query) < 2"));
    assert.ok(migration.includes("char_length(normalized_query) > 120"));
  });

  test("the per-entity limit clamp is present in exactly the expected form", async () => {
    const migration = await readSearchMigration();
    const definition = compactSql(extractFunctionDefinition(migration, SEARCH_FN));

    assert.ok(
      definition.includes(
        "entity_limit := least(greatest(coalesce(p_limit, 5), 1), 5);",
      ),
      "the clamp must handle null, floor at 1, and ceil at 5",
    );
  });

  test("no p_limit value can bypass the per-entity bound", () => {
    // Semantics of `least(greatest(coalesce(p_limit, 5), 1), 5)`, asserted in
    // the pinned form above. coalesce resolves null first, so least/greatest
    // never see a null.
    const clamp = (pLimit) => Math.min(Math.max(pLimit ?? 5, 1), 5);

    assert.equal(clamp(null), 5, "null falls back to the default");
    assert.equal(clamp(undefined), 5, "an omitted argument uses the default");
    assert.equal(clamp(-999), 1, "a large negative floors at 1");
    assert.equal(clamp(-1), 1, "a negative floors at 1");
    assert.equal(clamp(0), 1, "zero floors at 1");
    assert.equal(clamp(1), 1);
    assert.equal(clamp(3), 3);
    assert.equal(clamp(5), 5);
    assert.equal(clamp(6), 5, "above the ceiling clamps down");
    assert.equal(clamp(1_000_000), 5, "an excessive value clamps down");

    for (const candidate of [null, undefined, -1e9, -1, 0, 1, 4, 5, 6, 1e9]) {
      const clamped = clamp(candidate);
      assert.ok(clamped >= 1 && clamped <= 5, `clamp(${candidate}) escaped 1..5`);
    }
  });

  test("the per-entity limit is applied inside each branch, not only on the outer query", async () => {
    const migration = await readSearchMigration();
    const definition = extractFunctionDefinition(migration, SEARCH_FN);

    // One `limit entity_limit` per searchable entity. Applying it only on the
    // outer select would let one noisy entity crowd out the other five.
    const perBranch = [...definition.matchAll(/limit entity_limit/g)].length;
    assert.equal(perBranch, 6, "each of the six UNION branches must be bounded");
  });

  test("the hard total cap is applied on the outer query and cannot be exceeded", async () => {
    const migration = await readSearchMigration();
    const definition = compactSql(extractFunctionDefinition(migration, SEARCH_FN));
    const { SEARCH_TOTAL_CAP, SEARCH_LIMIT_PER_ENTITY, SEARCH_ENTITY_TYPES } =
      await import("../../../src/features/search/constants.ts");

    assert.ok(definition.includes("limit 30;"), "outer cap must be present");
    assert.equal(SEARCH_TOTAL_CAP, 30);

    // 6 entities x 5 rows == the cap exactly, so the cap can never truncate
    // one entity's results unfairly while another still has room.
    assert.equal(
      SEARCH_ENTITY_TYPES.length * SEARCH_LIMIT_PER_ENTITY,
      SEARCH_TOTAL_CAP,
    );
  });

  test("LIKE wildcards are escaped and every match honours the escape clause", async () => {
    const migration = await readSearchMigration();
    const definition = extractFunctionDefinition(migration, SEARCH_FN);

    assert.ok(definition.includes("replace(normalized_query, '\\', '\\\\')"));
    assert.ok(definition.includes("'%', '\\%'"));
    assert.ok(definition.includes("'_', '\\_'"));

    const matches = [...definition.matchAll(/ilike like_pattern/g)].length;
    const escaped = [...definition.matchAll(/ilike like_pattern escape '\\'/g)].length;

    assert.ok(matches > 0);
    assert.equal(matches, escaped, "an unescaped ILIKE defeats the escaping");
  });

  test("escaping happens before the pattern is wrapped in wildcards", async () => {
    const migration = await readSearchMigration();
    const definition = compactSql(extractFunctionDefinition(migration, SEARCH_FN));

    // The surrounding %...% must be the only unescaped wildcards present.
    assert.match(
      definition,
      /like_pattern := '%' \|\| replace\( replace\(replace\(normalized_query, '\\', '\\\\'\), '%', '\\%'\), '_', '\\_' \) \|\| '%';/,
      "user input must be fully escaped before the wildcards are added",
    );
  });

  test("anon is stopped by the EXECUTE grant, not by the membership guard", async () => {
    const migration = await readSearchMigration();

    // search_workspace is granted to authenticated only, so PostgreSQL
    // rejects an anon caller with 42501 before the body runs. Documentation
    // and tests must not claim anon receives the P0001 guard message.
    assert.ok(
      migration.includes(
        "revoke all on function public.search_workspace(uuid, text, integer)\n  from public, anon, authenticated;",
      ),
      "broad execute must be revoked",
    );
    assert.ok(
      !/grant execute[^;]*search_workspace[^;]*to[^;]*anon/.test(migration),
      "search_workspace must never be granted to anon",
    );
    assert.match(
      migration,
      /Layer 0 -- EXECUTE privilege/,
      "the privilege layer must be documented as the anon boundary",
    );
    assert.ok(
      !/and anon all stop here/.test(migration),
      "the header must not claim anon reaches the Layer 1 guard",
    );
  });
});
