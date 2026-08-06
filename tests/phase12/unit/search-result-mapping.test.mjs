import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { describe, test } from "node:test";

import {
  SEARCH_ENTITY_LABELS,
  SEARCH_ENTITY_ROUTES,
  SEARCH_ENTITY_TYPES,
  SEARCH_LIMIT_PER_ENTITY,
  SEARCH_TOTAL_CAP,
  isSearchEntityType,
  searchResultHref,
} from "../../../src/features/search/constants.ts";
import {
  groupSearchResults,
  mapSearchRow,
  mapSearchRows,
} from "../../../src/features/search/result.ts";
import { readSearchMigration } from "../helpers/migration-test-helpers.mjs";

const ADMIN_ROUTES_DIR = new URL("../../../src/app/admin/", import.meta.url);

function row(overrides = {}) {
  return {
    entity_type: "lead",
    entity_id: "11111111-1111-4111-8111-111111111111",
    title: "Acme Corp",
    subtitle: "Acme Holdings",
    status: "new",
    updated_at: "2026-08-04T02:00:00.000Z",
    ...overrides,
  };
}

describe("search entity to route mapping", () => {
  test("the six entity types match the RPC's UNION branches exactly", async () => {
    const migration = await readSearchMigration();

    for (const entityType of SEARCH_ENTITY_TYPES) {
      assert.ok(
        migration.includes(`'${entityType}'::text`),
        `RPC must emit a '${entityType}' branch`,
      );
    }

    const emitted = [...migration.matchAll(/'([a-z_]+)'::text as entity_type|'([a-z_]+)'::text,/g)]
      .map((match) => match[1] ?? match[2])
      .filter(Boolean);

    assert.deepEqual(
      [...new Set(emitted)].sort(),
      [...SEARCH_ENTITY_TYPES].sort(),
      "TS entity list and SQL branches must not drift",
    );
  });

  test("every entity type has a label and a route", () => {
    for (const entityType of SEARCH_ENTITY_TYPES) {
      assert.ok(SEARCH_ENTITY_LABELS[entityType], `${entityType} needs a label`);
      assert.equal(typeof SEARCH_ENTITY_ROUTES[entityType], "function");
    }

    assert.equal(Object.keys(SEARCH_ENTITY_ROUTES).length, SEARCH_ENTITY_TYPES.length);
    assert.equal(Object.keys(SEARCH_ENTITY_LABELS).length, SEARCH_ENTITY_TYPES.length);
  });

  test("each route resolves to an admin segment that actually exists on disk", async () => {
    const entries = await readdir(ADMIN_ROUTES_DIR, { withFileTypes: true });
    const segments = new Set(
      entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name),
    );

    for (const entityType of SEARCH_ENTITY_TYPES) {
      const href = searchResultHref(entityType, "abc");
      const match = href.match(/^\/admin\/([a-z-]+)\/abc$/);

      assert.ok(match, `${entityType} href must be /admin/<segment>/<id>, got ${href}`);
      assert.ok(
        segments.has(match[1]),
        `${entityType} points at /admin/${match[1]} which does not exist`,
      );
    }
  });

  test("support tickets route to /admin/support, not /admin/support_tickets", () => {
    assert.equal(
      searchResultHref("support_ticket", "abc"),
      "/admin/support/abc",
    );
  });

  test("isSearchEntityType narrows only known values", () => {
    assert.equal(isSearchEntityType("lead"), true);
    assert.equal(isSearchEntityType("support_ticket"), true);
    assert.equal(isSearchEntityType("revision"), false);
    assert.equal(isSearchEntityType(""), false);
    assert.equal(isSearchEntityType(null), false);
    assert.equal(isSearchEntityType(7), false);
  });
});

describe("search row mapping", () => {
  test("a well-formed row maps to a result with an href", () => {
    const mapped = mapSearchRow(row());

    assert.equal(mapped.entityType, "lead");
    assert.equal(mapped.title, "Acme Corp");
    assert.equal(mapped.subtitle, "Acme Holdings");
    assert.equal(mapped.href, "/admin/leads/11111111-1111-4111-8111-111111111111");
  });

  test("rows with an unknown entity type or missing identity are dropped, not guessed", () => {
    assert.equal(mapSearchRow(row({ entity_type: "revision" })), null);
    assert.equal(mapSearchRow(row({ entity_type: null })), null);
    assert.equal(mapSearchRow(row({ entity_id: null })), null);
    assert.equal(mapSearchRow(row({ updated_at: null })), null);
  });

  test("blank titles and subtitles degrade rather than render empty", () => {
    assert.equal(mapSearchRow(row({ title: "   " })).title, "Untitled");
    assert.equal(mapSearchRow(row({ title: null })).title, "Untitled");
    assert.equal(mapSearchRow(row({ subtitle: "  " })).subtitle, null);
    assert.equal(mapSearchRow(row({ subtitle: null })).subtitle, null);
  });

  test("mapSearchRows filters invalid rows and enforces the total cap", () => {
    const rows = [
      row(),
      row({ entity_type: "revision" }),
      row({ entity_id: null }),
    ];

    assert.equal(mapSearchRows(rows).length, 1);

    const flood = Array.from({ length: 100 }, (_unused, index) =>
      row({ entity_id: `1111111${index}-1111-4111-8111-111111111111` }),
    );
    assert.equal(mapSearchRows(flood).length, SEARCH_TOTAL_CAP);
  });

  test("grouping follows the canonical entity order and omits empty groups", () => {
    const results = mapSearchRows([
      row({ entity_type: "support_ticket", entity_id: "aaaaaaaa-1111-4111-8111-111111111111" }),
      row({ entity_type: "lead" }),
      row({ entity_type: "project", entity_id: "bbbbbbbb-1111-4111-8111-111111111111" }),
    ]);

    const groups = groupSearchResults(results);

    assert.deepEqual(
      groups.map((group) => group.entityType),
      ["lead", "project", "support_ticket"],
    );
    assert.ok(groups.every((group) => group.results.length > 0));
    assert.deepEqual(groupSearchResults([]), []);
  });

  test("the per-entity limit and total cap agree with the RPC", async () => {
    const migration = await readSearchMigration();

    assert.equal(SEARCH_LIMIT_PER_ENTITY, 5);
    assert.equal(SEARCH_TOTAL_CAP, 30);
    assert.ok(migration.includes("least(greatest(coalesce(p_limit, 5), 1), 5)"));
    assert.ok(migration.includes("limit 30"));
    assert.equal(
      SEARCH_ENTITY_TYPES.length * SEARCH_LIMIT_PER_ENTITY,
      SEARCH_TOTAL_CAP,
      "the cap must not be able to truncate one entity's results unfairly",
    );
  });
});
