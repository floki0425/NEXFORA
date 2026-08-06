import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

export const MIGRATION_PATH = new URL(
  "../../../supabase/migrations/20260806000000_phase_11_notifications_audit.sql",
  import.meta.url,
);

/**
 * Normalizes line endings to LF.
 *
 * The migrations are committed with LF, but this repository has
 * `core.autocrlf=true` and no `.gitattributes`, so a Windows checkout writes
 * them to disk as CRLF. Many assertions below match multi-line markers and
 * `\n`-bearing regexes, which silently stop matching against CRLF text — the
 * suite then fails on Windows while passing on Linux/macOS and in CI.
 *
 * Normalizing at read time fixes that at the single point where migration
 * text enters the tests, without touching the migration files themselves and
 * without imposing a repository-wide `.gitattributes` change.
 */
export function normalizeSql(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/**
 * Reads any migration file for assertion purposes. Every test must read
 * through this (or readMigration) rather than calling readFile directly, so
 * normalization cannot be bypassed.
 */
export async function readMigrationFile(pathOrUrl) {
  return normalizeSql(await readFile(pathOrUrl, "utf8"));
}

export async function readMigration() {
  return readMigrationFile(MIGRATION_PATH);
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
