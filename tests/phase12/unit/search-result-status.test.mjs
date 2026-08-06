import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { resolveSearchActionResult } from "../../../src/features/search/result.ts";

function row(overrides = {}) {
  return {
    entity_type: "lead",
    entity_id: "11111111-1111-4111-8111-111111111111",
    title: "Acme Corp",
    subtitle: null,
    status: "new",
    updated_at: "2026-08-04T02:00:00.000Z",
    ...overrides,
  };
}

describe("search result status discrimination", () => {
  test("matches resolve to ok with mapped results", () => {
    const result = resolveSearchActionResult([row()], null);

    assert.equal(result.status, "ok");
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].href, "/admin/leads/11111111-1111-4111-8111-111111111111");
  });

  test("a successful query with no matches resolves to empty, never to error", () => {
    assert.deepEqual(resolveSearchActionResult([], null), { status: "empty" });
  });

  test("rows that all fail validation resolve to empty rather than a phantom ok", () => {
    const result = resolveSearchActionResult([row({ entity_type: "revision" })], null);
    assert.deepEqual(result, { status: "empty" });
  });

  test("a P0001 authorization failure resolves to denied, not empty", () => {
    // Collapsing a denial into an empty result would tell the user "no
    // matches" when the real answer is "you may not search this workspace".
    assert.deepEqual(resolveSearchActionResult(null, { code: "P0001" }), {
      status: "denied",
    });
  });

  test("any other database failure resolves to error, not empty", () => {
    assert.deepEqual(resolveSearchActionResult(null, { code: "57014" }), {
      status: "error",
    });
    assert.deepEqual(resolveSearchActionResult(null, { code: "42501" }), {
      status: "error",
    });
    assert.deepEqual(resolveSearchActionResult(null, { code: undefined }), {
      status: "error",
    });
    assert.deepEqual(resolveSearchActionResult(undefined, undefined), {
      status: "error",
    });
  });

  test("an error always wins over any rows that came back with it", () => {
    const result = resolveSearchActionResult([row()], { code: "P0001" });
    assert.equal(result.status, "denied");
  });

  test("the result never carries a database message, code, or detail", () => {
    const leaky = {
      code: "P0001",
      message: 'relation "public.leads" does not exist',
      details: "SELECT * FROM public.leads WHERE organization_id = $1",
      hint: "check your search_path",
    };

    for (const outcome of [
      resolveSearchActionResult(null, leaky),
      resolveSearchActionResult(null, { ...leaky, code: "42P01" }),
    ]) {
      const serialized = JSON.stringify(outcome);

      assert.deepEqual(Object.keys(outcome), ["status"]);
      assert.ok(!serialized.includes("does not exist"));
      assert.ok(!serialized.includes("SELECT"));
      assert.ok(!serialized.includes("search_path"));
      assert.ok(!serialized.includes("public.leads"));
    }
  });

  test("only the four agreed states are ever produced", () => {
    const observed = new Set(
      [
        resolveSearchActionResult([row()], null),
        resolveSearchActionResult([], null),
        resolveSearchActionResult(null, { code: "P0001" }),
        resolveSearchActionResult(null, { code: "08006" }),
      ].map((result) => result.status),
    );

    assert.deepEqual([...observed].sort(), ["denied", "empty", "error", "ok"]);
  });
});
