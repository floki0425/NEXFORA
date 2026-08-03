// Statically verifies every private.emit_event(...) call site's metadata
// object only ever emits keys from a declared per-action allowlist, and
// never a key name that suggests raw PII/secrets. This is a text-level
// check of the migration file, not a live-database check — it exists so a
// future edit that adds a new field to a jsonb_build_object(...) call is
// forced to also update the allowlist here, making the change visible in
// review rather than silently widening what an audit row can contain.

import assert from "node:assert/strict";
import test from "node:test";

import { readMigration } from "../helpers/migration-test-helpers.mjs";

// Mirrors AGENTS.md SS12's "allowed metadata" list: enum-ish scalars and
// identifiers only.
const ALLOWED_METADATA_KEYS = new Set([
  "source",
  "old_status",
  "new_status",
  "client_id",
  "business_name",
  "role",
  "proposal_number",
  "invoice_number",
  "currency",
  "amount",
  "invoice_id",
  "status",
  "project_id",
  "user_id",
  "assigned_to",
  "ticket_number",
  "plan_name",
  "subscription_id",
  "hours_used",
  "visibility",
  "window_key",
]);

// Note: deliberately does NOT match a bare "key$" suffix — window_key is a
// legitimate, allowlisted business field (a reminder bucket label like
// "due-3", never a credential) that happens to end in "_key".
const FORBIDDEN_KEY_PATTERN =
  /(email|token|password|secret_?key|api_?key|access_?key|error|message|note|description|body|content|url|ip_address|user_agent)/i;

function findBalanced(text, openIndex) {
  let depth = 0;
  for (let index = openIndex; index < text.length; index += 1) {
    if (text[index] === "(") depth += 1;
    if (text[index] === ")") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  throw new Error("unbalanced parentheses");
}

function extractEmitEventCalls(migration) {
  const calls = [];
  const marker = "private.emit_event(";
  let searchFrom = 0;

  for (;;) {
    const start = migration.indexOf(marker, searchFrom);
    if (start === -1) {
      break;
    }
    const openParenIndex = start + marker.length - 1;
    const closeParenIndex = findBalanced(migration, openParenIndex);
    calls.push(migration.slice(start, closeParenIndex + 1));
    searchFrom = closeParenIndex + 1;
  }

  return calls;
}

function extractMetadataKeys(call) {
  const jsonbIndex = call.search(/jsonb_build_object\(/);
  if (jsonbIndex === -1) {
    return { hasMetadata: false, keys: [] };
  }
  const openParenIndex = call.indexOf("(", jsonbIndex);
  const closeParenIndex = findBalanced(call, openParenIndex);
  const inner = call.slice(openParenIndex + 1, closeParenIndex);
  const keys = [...inner.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
  return { hasMetadata: true, keys };
}

test("every private.emit_event(...) call's metadata keys are in the declared allowlist", async () => {
  const migration = await readMigration();
  const calls = extractEmitEventCalls(migration);

  assert.ok(calls.length >= 14, "expected at least one emit_event call per instrumented table");

  for (const call of calls) {
    const { keys } = extractMetadataKeys(call);
    for (const key of keys) {
      assert.ok(
        ALLOWED_METADATA_KEYS.has(key),
        `metadata key "${key}" is not in the declared allowlist: ${call.slice(0, 120)}...`,
      );
    }
  }
});

test("no emit_event metadata key name suggests raw PII, secrets, or free text", async () => {
  const migration = await readMigration();
  const calls = extractEmitEventCalls(migration);

  for (const call of calls) {
    const { keys } = extractMetadataKeys(call);
    for (const key of keys) {
      assert.doesNotMatch(
        key,
        FORBIDDEN_KEY_PATTERN,
        `metadata key "${key}" looks like it could carry PII/secrets/free text`,
      );
    }
  }
});

test("no emit_event call passes a raw string literal (only column/variable references) as a metadata value", async () => {
  const migration = await readMigration();
  const calls = extractEmitEventCalls(migration);

  for (const call of calls) {
    const jsonbIndex = call.search(/jsonb_build_object\(/);
    if (jsonbIndex === -1) continue;
    const openParenIndex = call.indexOf("(", jsonbIndex);
    const closeParenIndex = findBalanced(call, openParenIndex);
    const inner = call.slice(openParenIndex + 1, closeParenIndex);
    // Split on top-level commas is unnecessary here since values are never
    // string literals in this migration — assert that directly: after
    // stripping the 'key' string literals, no other quoted string remains.
    const withoutKeys = inner.replace(/'[a-z_]+'/g, "");
    assert.doesNotMatch(
      withoutKeys,
      /'[^']*'/,
      `emit_event metadata should reference columns/variables, not string literals: ${inner}`,
    );
  }
});
