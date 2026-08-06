import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Phase 12A ships two migration files. The unit tier asserts their security
// properties by parsing the SQL text from disk, so it runs with no database
// and gates every remote apply.

export const REPORTING_MIGRATION_PATH = new URL(
  "../../../supabase/migrations/20260807000000_phase_12a_reporting.sql",
  import.meta.url,
);

export const SEARCH_MIGRATION_PATH = new URL(
  "../../../supabase/migrations/20260807010000_phase_12a_global_search.sql",
  import.meta.url,
);

/**
 * Normalizes line endings to LF.
 *
 * The migrations are committed with LF, but this repository has
 * `core.autocrlf=true` and no `.gitattributes`, so a Windows checkout writes
 * them to disk as CRLF. Any assertion using a multi-line marker or a
 * `\n`-bearing regex silently stops matching against CRLF text — which is
 * exactly how the Phase 11 unit suite came to fail on Windows while passing
 * elsewhere. Normalizing at read time makes these assertions
 * line-ending-independent by construction rather than by remembering to
 * avoid multi-line markers.
 */
export function normalizeSql(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export async function readMigrationFile(pathOrUrl) {
  return normalizeSql(await readFile(pathOrUrl, "utf8"));
}

export async function readReportingMigration() {
  return readMigrationFile(REPORTING_MIGRATION_PATH);
}

export async function readSearchMigration() {
  return readMigrationFile(SEARCH_MIGRATION_PATH);
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

/**
 * Removes `--` line comments so an assertion examines EXECUTABLE SQL rather
 * than prose. These migrations document their own security properties in
 * comments, so a naive substring check would happily match the sentence
 * explaining why something must not appear.
 *
 * Quote-aware: a `--` inside a string literal is left alone.
 */
export function stripSqlComments(text) {
  return text
    .split("\n")
    .map((line) => {
      let inString = false;

      for (let index = 0; index < line.length; index += 1) {
        const char = line[index];

        if (char === "'") {
          // '' inside a string literal is an escaped quote, not a terminator.
          if (inString && line[index + 1] === "'") {
            index += 1;
            continue;
          }
          inString = !inString;
          continue;
        }

        if (!inString && char === "-" && line[index + 1] === "-") {
          return line.slice(0, index);
        }
      }

      return line;
    })
    .join("\n");
}

export function occurrences(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

/**
 * Returns the full text of one function definition, from its `create or
 * replace function` line through the closing `$function$;`. Used to assert
 * properties per function rather than per file, so a property present on one
 * function cannot mask its absence on another.
 */
export function extractFunctionDefinition(text, qualifiedName) {
  const marker = `create or replace function ${qualifiedName}(`;
  return sliceSql(text, marker, "$function$;");
}

/**
 * Returns the grant/revoke block that follows a function definition, i.e. the
 * text between the definition's closing `$function$;` and the next `create`
 * or the end of file.
 */
export function extractGrantBlock(text, qualifiedName) {
  const marker = `create or replace function ${qualifiedName}(`;
  const start = text.indexOf(marker);
  assert.ok(start > -1, `expected to find function "${qualifiedName}"`);

  const bodyEnd = text.indexOf("$function$;", start);
  assert.ok(bodyEnd > -1, `expected a closing $function$; for "${qualifiedName}"`);

  const afterBody = bodyEnd + "$function$;".length;
  const nextCreate = text.indexOf("create ", afterBody);

  return text.slice(afterBody, nextCreate === -1 ? text.length : nextCreate);
}

export const REPORT_FUNCTIONS = [
  "public.get_lead_conversion_report",
  "public.get_lead_source_report",
  "public.get_proposal_win_rate_report",
  "public.get_revenue_report",
  "public.get_project_delivery_report",
];

/**
 * Identifiers that must never appear in the search migration. Every one is a
 * secret, a credential, an opaque provider handle, or an internal-only note
 * column. Searching or returning any of them would leak through the palette.
 */
export const FORBIDDEN_SEARCH_IDENTIFIERS = [
  "token_hash",
  "storage_path",
  "provider_reference",
  "provider_event_id",
  "idempotency_key",
  "auth.users",
  "encrypted_password",
];
