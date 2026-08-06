import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  SEARCH_MAX_QUERY_LENGTH,
  SEARCH_MIN_QUERY_LENGTH,
  escapeLikePattern,
  isSearchableQuery,
  normalizeSearchQuery,
  safeSearchValue,
} from "../../../src/lib/search/sanitize.ts";

describe("search input sanitization", () => {
  test("escapeLikePattern ESCAPES wildcards rather than stripping them", () => {
    // A user searching for a literal % must find it, not match every row.
    assert.equal(escapeLikePattern("100%"), "100\\%");
    assert.equal(escapeLikePattern("a_b"), "a\\_b");
    assert.equal(escapeLikePattern("%_%"), "\\%\\_\\%");
  });

  test("escapeLikePattern escapes backslash first so escapes are not double-escaped", () => {
    assert.equal(escapeLikePattern("\\"), "\\\\");
    assert.equal(escapeLikePattern("\\%"), "\\\\\\%");

    // If % were escaped before \, the backslash pass would corrupt it into
    // \\% -- a literal backslash followed by a wildcard.
    const escaped = escapeLikePattern("50%\\off");
    assert.equal(escaped, "50\\%\\\\off");
  });

  test("escapeLikePattern leaves ordinary text and unicode untouched", () => {
    assert.equal(escapeLikePattern("NXF-INV-2026-0007"), "NXF-INV-2026-0007");
    assert.equal(escapeLikePattern("Ángel Ñoño"), "Ángel Ñoño");
    assert.equal(escapeLikePattern("日本語"), "日本語");
    assert.equal(escapeLikePattern(""), "");
  });

  test("safeSearchValue STRIPS metacharacters for the PostgREST filter grammar", () => {
    // The .or() filter string is comma/paren-delimited and has no escape
    // syntax, so these characters must be removed, not escaped.
    assert.equal(safeSearchValue("a,b"), "a b");
    assert.equal(safeSearchValue("a(b)c"), "a b c");
    assert.equal(safeSearchValue("100%"), "100");
    assert.equal(safeSearchValue("a_b"), "a b");
    assert.equal(safeSearchValue("  spaced   out  "), "spaced out");
  });

  test("the two sanitizers are not interchangeable", () => {
    const input = "100%";

    assert.notEqual(safeSearchValue(input), escapeLikePattern(input));
    assert.ok(!safeSearchValue(input).includes("%"), "filter path strips");
    assert.ok(escapeLikePattern(input).includes("%"), "RPC path preserves and escapes");
  });

  test("normalizeSearchQuery trims and truncates instead of rejecting", () => {
    assert.equal(normalizeSearchQuery("  acme  "), "acme");

    const long = "x".repeat(500);
    assert.equal(normalizeSearchQuery(long).length, SEARCH_MAX_QUERY_LENGTH);

    const exact = "y".repeat(SEARCH_MAX_QUERY_LENGTH);
    assert.equal(normalizeSearchQuery(exact), exact);
  });

  test("isSearchableQuery enforces the minimum length after trimming", () => {
    assert.equal(SEARCH_MIN_QUERY_LENGTH, 2);

    assert.equal(isSearchableQuery(""), false);
    assert.equal(isSearchableQuery("   "), false);
    assert.equal(isSearchableQuery("a"), false);
    assert.equal(isSearchableQuery(" a "), false);
    assert.equal(isSearchableQuery("ab"), true);
    assert.equal(isSearchableQuery("  ab  "), true);
    assert.equal(isSearchableQuery("x".repeat(500)), true);
  });
});
