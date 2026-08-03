import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

export const MIGRATION_PATH = new URL(
  "../../../supabase/migrations/20260806000000_phase_11_notifications_audit.sql",
  import.meta.url,
);

export async function readMigration() {
  return readFile(MIGRATION_PATH, "utf8");
}

export function sliceSql(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  assert.ok(start > -1, `expected to find marker "${startMarker}"`);
  const end = endMarker ? text.indexOf(endMarker, start) : text.length;
  return text.slice(start, end === -1 ? text.length : end);
}

export function compactSql(text) {
  return text.replace(/\s+/g, " ").trim();
}

export function occurrences(text, pattern) {
  return [...text.matchAll(pattern)].length;
}
