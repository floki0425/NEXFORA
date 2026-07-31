// Revision status-transition unit tests, closing gaps beyond
// tests/revisions/revisions.test.mjs: explicit invalid-transition cases and
// the two client-only edges (ready_for_review -> approved/rejected), all
// verified statically against the migration's SQL text since no live
// database is available in this environment (see
// docs/PHASE_8_AUTOMATED_TESTING.md for the equivalent live integration
// coverage).

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { revisionStatusTransitionSchema } from "../../../src/features/revisions/schemas.ts";

const MIGRATION_PATH = new URL(
  "../../../supabase/migrations/20260803000000_phase_8_files_revisions.sql",
  import.meta.url,
);

async function readMigration() {
  return readFile(MIGRATION_PATH, "utf8");
}

function slice(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  assert.ok(start > -1, `expected to find marker "${startMarker}"`);
  const end = endMarker ? text.indexOf(endMarker, start) : text.length;
  return text.slice(start, end === -1 ? text.length : end);
}

const VALID_TRANSITIONS = [
  ["submitted", "reviewing"],
  ["reviewing", "in_progress"],
  ["in_progress", "ready_for_review"],
  ["rejected", "in_progress"],
  ["approved", "closed"],
];

const INVALID_INTERNAL_TRANSITIONS = [
  ["submitted", "approved"],
  ["submitted", "closed"],
  ["closed", "in_progress"],
  ["approved", "reviewing"],
  ["ready_for_review", "approved"],
  ["ready_for_review", "rejected"],
];

test("transition_revision_status's allowed-edge expression contains every documented valid transition", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "create or replace function public.transition_revision_status",
    "create or replace function public.approve_revision",
  );

  for (const [from, to] of VALID_TRANSITIONS) {
    // Most edges are written on one line, but the SQL wraps
    // in_progress -> ready_for_review across two lines for width, so
    // whitespace (including a newline) is tolerated between the clauses.
    const pattern = new RegExp(
      `target_revision\\.status = '${from}'\\s+and p_new_status = '${to}'`,
    );
    assert.match(
      section,
      pattern,
      `expected the allowed-transition check to include ${from} -> ${to}`,
    );
  }
});

test("transition_revision_status's allowed-edge expression contains none of the documented invalid transitions", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "create or replace function public.transition_revision_status",
    "create or replace function public.approve_revision",
  );

  for (const [from, to] of INVALID_INTERNAL_TRANSITIONS) {
    const pattern = new RegExp(
      `target_revision\\.status = '${from}'\\s+and p_new_status = '${to}'`,
    );
    assert.doesNotMatch(
      section,
      pattern,
      `expected the allowed-transition check to exclude ${from} -> ${to}`,
    );
  }
});

test("the internal status-transition schema itself rejects every documented invalid target status", () => {
  // p_new_status is additionally constrained to the four internal-facing
  // values at the application layer (see revisionStatusTransitionSchema) —
  // 'submitted', 'approved', 'rejected', and 'closed' can never even be
  // requested through transitionRevisionStatusAction, regardless of the
  // current status.
  for (const status of ["submitted", "approved", "rejected"]) {
    assert.equal(
      revisionStatusTransitionSchema.safeParse({ status }).success,
      false,
      `expected "${status}" to be rejected as a directly-requestable status`,
    );
  }
});

test("ready_for_review -> approved is reachable only through approve_revision, never transition_revision_status", async () => {
  const migration = await readMigration();
  const transitionSection = slice(
    migration,
    "create or replace function public.transition_revision_status",
    "create or replace function public.approve_revision",
  );
  const approveSection = slice(
    migration,
    "create or replace function public.approve_revision",
    "create or replace function public.request_revision_changes",
  );

  assert.doesNotMatch(transitionSection, /p_new_status = 'approved'/);
  assert.match(approveSection, /target_revision\.status <> 'ready_for_review'/);
  assert.match(approveSection, /set status = 'approved'/);
});

test("ready_for_review -> rejected is reachable only through request_revision_changes, never transition_revision_status", async () => {
  const migration = await readMigration();
  const transitionSection = slice(
    migration,
    "create or replace function public.transition_revision_status",
    "create or replace function public.approve_revision",
  );
  const requestChangesSection = slice(
    migration,
    "create or replace function public.request_revision_changes",
    "-- Row Level Security",
  );

  assert.doesNotMatch(transitionSection, /p_new_status = 'rejected'/);
  assert.match(
    requestChangesSection,
    /target_revision\.status <> 'ready_for_review'/,
  );
  assert.match(requestChangesSection, /set status = 'rejected'/);
});
