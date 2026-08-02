import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

export const BASE_MIGRATION_PATH = new URL(
  "../../../supabase/migrations/20260805000000_phase_10_support_maintenance.sql",
  import.meta.url,
);

export const FOLLOW_UP_MIGRATION_PATH = new URL(
  "../../../supabase/migrations/20260805010000_fix_phase_10_authorization_integrity.sql",
  import.meta.url,
);

export async function readBaseMigration() {
  return readFile(BASE_MIGRATION_PATH, "utf8");
}

export async function readFollowUpMigration() {
  return readFile(FOLLOW_UP_MIGRATION_PATH, "utf8");
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
