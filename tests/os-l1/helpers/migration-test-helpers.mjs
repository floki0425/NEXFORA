import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// OS-L1 ships one migration. The unit tier asserts its security properties by
// parsing the SQL text from disk, so it runs with no database and gates the
// remote apply. Mirrors tests/phase12/helpers/migration-test-helpers.mjs.

export const INGESTION_MIGRATION_PATH = new URL(
  "../../../supabase/migrations/20260817000000_os_l1_website_inquiry_ingestion.sql",
  import.meta.url,
);

export const INGESTION_FN = "public.ingest_website_project_inquiry";

/**
 * Normalizes line endings to LF. This repository has `core.autocrlf=true`
 * and no `.gitattributes`, so a Windows checkout writes the committed LF
 * migrations to disk as CRLF and any multi-line marker silently stops
 * matching. See the same note in the Phase 12A helpers.
 */
export function normalizeSql(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export async function readIngestionMigration() {
  return normalizeSql(await readFile(INGESTION_MIGRATION_PATH, "utf8"));
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
 * than prose. This migration documents its own security properties in
 * comments, so a naive substring check would happily match the sentence
 * explaining why something must not appear. Quote-aware.
 */
export function stripSqlComments(text) {
  return text
    .split("\n")
    .map((line) => {
      let inString = false;

      for (let index = 0; index < line.length; index += 1) {
        const char = line[index];

        if (char === "'") {
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

export function extractFunctionDefinition(text, qualifiedName) {
  const marker = `create or replace function ${qualifiedName}(`;
  return sliceSql(text, marker, "$function$;");
}

/**
 * Returns the grant/revoke block that follows a function definition, i.e. the
 * text between the definition's closing `$function$;` and end of file or the
 * next `create`.
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
