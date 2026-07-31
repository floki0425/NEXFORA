import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canAssignRevision,
  canTransitionRevisionStatus,
} from "../../src/features/revisions/permissions.ts";
import {
  REVISION_NEXT_INTERNAL_TRANSITION,
  REVISION_PRIORITIES,
  REVISION_STATUSES,
} from "../../src/features/revisions/constants.ts";
import {
  revisionAssignSchema,
  revisionStatusTransitionSchema,
} from "../../src/features/revisions/schemas.ts";
import { submitRevisionSchema } from "../../src/features/portal/revisions/schemas.ts";

const MIGRATION_PATH = new URL(
  "../../supabase/migrations/20260803000000_phase_8_files_revisions.sql",
  import.meta.url,
);

const ATTACHMENT_DEFAULT_FIX_MIGRATION_PATH = new URL(
  "../../supabase/migrations/20260803010000_fix_phase_8_attachment_default.sql",
  import.meta.url,
);

async function readMigration() {
  return readFile(MIGRATION_PATH, "utf8");
}

async function readAttachmentDefaultFixMigration() {
  return readFile(ATTACHMENT_DEFAULT_FIX_MIGRATION_PATH, "utf8");
}

async function readSrcFile(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

function slice(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  assert.ok(start > -1, `expected to find marker "${startMarker}"`);
  const end = endMarker ? text.indexOf(endMarker, start) : text.length;
  return text.slice(start, end === -1 ? text.length : end);
}

// -- Vocabulary --------------------------------------------------------

test("revision priorities and statuses match the documented vocabulary", () => {
  assert.deepEqual(REVISION_PRIORITIES, ["low", "medium", "high", "urgent"]);
  assert.deepEqual(REVISION_STATUSES, [
    "submitted",
    "reviewing",
    "in_progress",
    "ready_for_review",
    "approved",
    "rejected",
    "closed",
  ]);
});

test("the internal-transition map only ever allows the documented forward/reopen edges", () => {
  assert.deepEqual(REVISION_NEXT_INTERNAL_TRANSITION.submitted, {
    status: "reviewing",
    label: "Start reviewing",
  });
  assert.deepEqual(REVISION_NEXT_INTERNAL_TRANSITION.reviewing, {
    status: "in_progress",
    label: "Start work",
  });
  assert.deepEqual(REVISION_NEXT_INTERNAL_TRANSITION.in_progress, {
    status: "ready_for_review",
    label: "Mark ready for review",
  });
  assert.deepEqual(REVISION_NEXT_INTERNAL_TRANSITION.rejected, {
    status: "in_progress",
    label: "Resume work",
  });
  assert.deepEqual(REVISION_NEXT_INTERNAL_TRANSITION.approved, {
    status: "closed",
    label: "Close revision",
  });
  // Client-only transitions have no internal button at all.
  assert.equal(REVISION_NEXT_INTERNAL_TRANSITION.ready_for_review, null);
  assert.equal(REVISION_NEXT_INTERNAL_TRANSITION.closed, null);
});

// -- Schemas --------------------------------------------------------------

test("the internal status-transition schema rejects client-only and unknown statuses", () => {
  assert.equal(
    revisionStatusTransitionSchema.safeParse({ status: "reviewing" }).success,
    true,
  );
  assert.equal(
    revisionStatusTransitionSchema.safeParse({ status: "approved" }).success,
    false,
  );
  assert.equal(
    revisionStatusTransitionSchema.safeParse({ status: "rejected" }).success,
    false,
  );
  assert.equal(
    revisionStatusTransitionSchema.safeParse({ status: "submitted" }).success,
    false,
  );
  assert.equal(
    revisionStatusTransitionSchema.safeParse({ status: "not-a-status" })
      .success,
    false,
  );
});

test("the assignment schema accepts a blank (unassign) value or a valid uuid", () => {
  assert.equal(revisionAssignSchema.safeParse({ assigneeId: "" }).success, true);
  assert.equal(
    revisionAssignSchema.safeParse({
      assigneeId: "11111111-1111-4111-8111-111111111111",
    }).success,
    true,
  );
  assert.equal(
    revisionAssignSchema.safeParse({ assigneeId: "not-a-uuid" }).success,
    false,
  );
});

test("the client submission schema requires a title, description, and valid priority", () => {
  const base = {
    pageName: "Home",
    sectionName: "Hero",
    title: "Fix hero spacing",
    description: "The hero has too much padding on mobile.",
    priority: "medium",
    attachmentFileId: "",
  };

  assert.equal(submitRevisionSchema.safeParse(base).success, true);
  assert.equal(
    submitRevisionSchema.safeParse({ ...base, title: "" }).success,
    false,
  );
  assert.equal(
    submitRevisionSchema.safeParse({ ...base, description: "" }).success,
    false,
  );
  assert.equal(
    submitRevisionSchema.safeParse({ ...base, priority: "critical" })
      .success,
    false,
  );
});

// -- Role permissions (mirror the migration's SQL checks exactly) -----------

test("super_admin and admin may always assign and transition revisions", () => {
  const context = { projectManagerId: null, isProjectMember: false };
  assert.equal(
    canAssignRevision({ role: "super_admin", profileId: "x" }, context),
    true,
  );
  assert.equal(
    canTransitionRevisionStatus(
      { role: "admin", profileId: "x" },
      context,
      null,
    ),
    true,
  );
});

test("project_manager may assign/transition only for an accessible project", () => {
  const member = { role: "project_manager", profileId: "pm-1" };
  assert.equal(
    canAssignRevision(member, {
      projectManagerId: "pm-1",
      isProjectMember: false,
    }),
    true,
  );
  assert.equal(
    canAssignRevision(member, {
      projectManagerId: "someone-else",
      isProjectMember: false,
    }),
    false,
  );
});

test("team_member may transition status only for a revision assigned to them, and may never assign", () => {
  const member = { role: "team_member", profileId: "tm-1" };
  const context = { projectManagerId: null, isProjectMember: true };

  assert.equal(canAssignRevision(member, context), false);
  assert.equal(
    canTransitionRevisionStatus(member, context, "tm-1"),
    true,
  );
  assert.equal(
    canTransitionRevisionStatus(member, context, "someone-else"),
    false,
  );
});

// -- Migration: schema shape ------------------------------------------------

test("revisions matches the documented field list plus the justified attachment_file_id addition", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "create table public.revisions",
    "create index revisions_organization_updated_idx",
  );

  for (const column of [
    "organization_id",
    "client_id",
    "project_id",
    "submitted_by",
    "page_name",
    "section_name",
    "title",
    "description",
    "priority",
    "status",
    "assigned_to",
    "resolved_at",
    "created_at",
    "updated_at",
  ]) {
    assert.ok(
      section.includes(column),
      `expected revisions to include documented column "${column}"`,
    );
  }

  assert.match(section, /attachment_file_id uuid/);
  assert.match(
    section,
    /constraint revisions_attachment_file_id_fkey\s*\n\s*foreign key \(attachment_file_id\)\s*\n\s*references public\.project_files \(id\)\s*\n\s*on delete restrict/,
  );
  assert.match(
    section,
    /check \(\s*\n\s*status in \(\s*\n\s*'submitted',\s*\n\s*'reviewing',\s*\n\s*'in_progress',\s*\n\s*'ready_for_review',\s*\n\s*'approved',\s*\n\s*'rejected',\s*\n\s*'closed'/,
  );
});

test("revision_activities is documented as an additional, justified table and mirrors lead_activities' shape", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "create table public.revision_activities",
    "create index revision_activities_revision_created_idx",
  );

  for (const column of [
    "organization_id",
    "revision_id",
    "activity_type",
    "title",
    "description",
    "metadata",
    "created_by",
    "created_at",
  ]) {
    assert.ok(section.includes(column));
  }

  assert.match(
    section,
    /check \(\s*\n\s*activity_type in \(\s*\n\s*'submitted',\s*\n\s*'status_changed',\s*\n\s*'assigned',\s*\n\s*'approved',\s*\n\s*'rejected'/,
  );

  const justification = slice(
    migration,
    "public.revision_activities",
    "create table public.revision_activities",
  );
  assert.match(justification, /required for[\s\S]*traceability/);
});

test("revisions has no INSERT/DELETE grant to authenticated, and only assigned_to is directly updatable", async () => {
  const migration = await readMigration();

  assert.doesNotMatch(migration, /grant insert[^;]*on[^;]*public\.revisions\b/i);
  assert.doesNotMatch(migration, /grant delete[^;]*on[^;]*public\.revisions\b/i);
  assert.match(
    migration,
    /grant update \(assigned_to\) on public\.revisions to authenticated;/,
  );
});

test("revision_activities has no INSERT/UPDATE/DELETE grant to authenticated — append-only in practice", async () => {
  const migration = await readMigration();

  assert.doesNotMatch(migration, /grant insert[^;]*on[^;]*revision_activities/i);
  assert.doesNotMatch(migration, /grant update[^;]*on[^;]*revision_activities/i);
  assert.doesNotMatch(migration, /grant delete[^;]*on[^;]*revision_activities/i);
});

test("anonymous access to revisions and revision_activities is fully denied", async () => {
  const migration = await readMigration();

  assert.doesNotMatch(migration, /to anon[^;]*\brevisions\b/i);
  assert.doesNotMatch(migration, /to anon[^;]*revision_activities/i);
});

test("the revisions_update_assignment policy excludes team_member and validates the assignee is an active org member", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "create policy revisions_update_assignment",
    "revoke all privileges on table public.revisions",
  );

  assert.doesNotMatch(section, /team_member/);
  assert.match(section, /array\['super_admin', 'admin'\]/);
  assert.match(section, /array\['project_manager'\]/);
  assert.match(
    section,
    /assignee_membership\.status = 'active'/,
  );
});

// -- create_client_revision --------------------------------------------------

test("create_client_revision server-resolves organization_id/client_id/submitted_by and validates the attachment belongs to the same project and client", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "create or replace function public.create_client_revision",
    "create or replace function public.get_client_revisions",
  );

  assert.doesNotMatch(section, /p_organization_id/);
  assert.doesNotMatch(section, /p_client_id/);
  assert.doesNotMatch(section, /p_submitted_by/);
  assert.match(section, /resolved_role not in \('owner', 'manager'\)/);
  assert.match(
    section,
    /file\.project_id = target_project_id\s*\n\s*and file\.client_id = resolved_client_id\s*\n\s*and file\.visibility = 'client'/,
  );
  assert.match(section, /'submitted'/);
});

// -- transition_revision_status ----------------------------------------------

test("transition_revision_status only allows the five documented forward/reopen edges", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "create or replace function public.transition_revision_status",
    "create or replace function public.approve_revision",
  );

  assert.match(
    section,
    /p_new_status not in \(\s*\n\s*'reviewing', 'in_progress', 'ready_for_review', 'closed'/,
  );
  assert.match(
    section,
    /target_revision\.status = 'submitted' and p_new_status = 'reviewing'/,
  );
  assert.match(
    section,
    /target_revision\.status = 'rejected' and p_new_status = 'in_progress'/,
  );
  assert.match(
    section,
    /target_revision\.status = 'approved' and p_new_status = 'closed'/,
  );
  // ready_for_review -> approved/rejected must never appear as an allowed
  // edge here — those are client-only.
  assert.doesNotMatch(
    section,
    /target_revision\.status = 'ready_for_review' and p_new_status = 'approved'/,
  );
});

test("transition_revision_status restricts team_member to a revision currently assigned to them", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "create or replace function public.transition_revision_status",
    "create or replace function public.approve_revision",
  );

  assert.match(
    section,
    /target_revision\.assigned_to = actor_profile_id/,
  );
});

test("transition_revision_status records a status_changed activity with both the previous and new status", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "create or replace function public.transition_revision_status",
    "create or replace function public.approve_revision",
  );

  assert.match(section, /'status_changed'/);
  assert.match(section, /'from_status', target_revision\.status/);
  assert.match(section, /'to_status', p_new_status/);
});

// -- approve_revision / request_revision_changes -----------------------------

test("approve_revision is idempotent and scoped to the caller's own client", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "create or replace function public.approve_revision",
    "create or replace function public.request_revision_changes",
  );

  assert.match(section, /revision\.client_id = resolved_client_id/);
  assert.match(
    section,
    /if target_revision\.status = 'approved' then\s*\n\s*return query select 'approved'::text, true;/,
  );
  assert.match(
    section,
    /target_revision\.status <> 'ready_for_review'/,
  );
});

test("request_revision_changes requires a non-empty comment and stores it only in revision_activities, never on the revisions row", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "create or replace function public.request_revision_changes",
    "-- Row Level Security",
  );

  assert.match(
    section,
    /normalized_comment = ''\s+or char_length\(normalized_comment\) > 3000/,
  );
  assert.match(
    section,
    /update public\.revisions\s*\n\s*set status = 'rejected'\s*\n\s*where id = target_revision_id;/,
  );
  assert.match(
    section,
    /insert into public\.revision_activities \(\s*\n\s*organization_id, revision_id, activity_type, title, description,\s*\n\s*metadata, created_by\s*\n\s*\)/,
  );
  assert.match(section, /normalized_comment,/);
});

test("request_revision_changes only accepts a revision that is ready for review, and is scoped to the caller's own client", async () => {
  const migration = await readMigration();
  const section = slice(
    migration,
    "create or replace function public.request_revision_changes",
    "-- Row Level Security",
  );

  assert.match(section, /revision\.client_id = resolved_client_id/);
  assert.match(
    section,
    /target_revision\.status <> 'ready_for_review'/,
  );
});

// -- Traceability ------------------------------------------------------------

test("a submitted-activity trigger fires on every new revision", async () => {
  const migration = await readMigration();
  assert.match(
    migration,
    /create trigger revisions_record_submitted_activity\s*\n\s*after insert on public\.revisions/,
  );
});

test("an assignment-activity trigger fires only when assigned_to actually changes", async () => {
  const migration = await readMigration();
  assert.match(
    migration,
    /create trigger revisions_record_assignment_activity\s*\n\s*after update of assigned_to on public\.revisions\s*\n\s*for each row\s*\n\s*when \(old\.assigned_to is distinct from new\.assigned_to\)/,
  );
});

// -- Security ----------------------------------------------------------------

test("internal file metadata (storage_path, uploaded_by) never reaches a client-facing function's payload", async () => {
  const migration = await readMigration();
  const clientFacingSection = slice(
    migration,
    "create or replace function public.get_client_revisions",
    "create or replace function public.transition_revision_status",
  );

  assert.doesNotMatch(clientFacingSection, /storage_path/);
  assert.doesNotMatch(clientFacingSection, /uploaded_by/);
  assert.doesNotMatch(clientFacingSection, /submitted_by(?!\s*,\s*new)/);
});

test("raw storage paths and database identifiers are never rendered in the portal revision components", async () => {
  const submitForm = await readSrcFile(
    "../../src/features/portal/revisions/components/revision-submit-form.tsx",
  );
  const revisionList = await readSrcFile(
    "../../src/features/portal/revisions/components/portal-revision-list.tsx",
  );

  for (const file of [submitForm, revisionList]) {
    assert.doesNotMatch(file, /storage_path/);
    assert.doesNotMatch(file, /storagePath/);
  }
});

test("portal revision actions never log secrets or raw Supabase errors beyond a safe, bounded message", async () => {
  const actions = await readSrcFile(
    "../../src/features/portal/revisions/actions.ts",
  );

  assert.match(actions, /message\.length > 0 && message\.length < 200/);
  const consoleCalls = [...actions.matchAll(/console\.(?:log|error)\(([\s\S]*?)\);/g)].map(
    (match) => match[1],
  );
  for (const call of consoleCalls) {
    assert.doesNotMatch(call, /SUPABASE_SECRET_KEY/);
  }
});

// -- RPC payloads: required string arguments never receive null, and
// -- attachment_file_id is properly omitted rather than nulled -------------

test("submitRevisionSchema accepts a valid attachment uuid or an empty (no attachment) value", () => {
  const base = {
    title: "Fix hero spacing",
    description: "The hero has too much padding on mobile.",
    priority: "medium",
  };

  assert.equal(
    submitRevisionSchema.safeParse({ ...base, attachmentFileId: "" }).success,
    true,
  );
  assert.equal(
    submitRevisionSchema.safeParse({
      ...base,
      attachmentFileId: "11111111-1111-4111-8111-111111111111",
    }).success,
    true,
  );
});

test("submitRevisionSchema rejects an attachment value that is neither empty nor a valid uuid", () => {
  const base = {
    title: "Fix hero spacing",
    description: "The hero has too much padding on mobile.",
    priority: "medium",
  };

  assert.equal(
    submitRevisionSchema.safeParse({ ...base, attachmentFileId: "not-a-uuid" })
      .success,
    false,
  );
  assert.equal(
    submitRevisionSchema.safeParse({
      ...base,
      attachmentFileId: "'; drop table revisions; --",
    }).success,
    false,
  );
});

test("page_name and section_name are passed through as real (possibly empty) strings, never converted to null", async () => {
  const actions = await readSrcFile(
    "../../src/features/portal/revisions/actions.ts",
  );

  assert.match(actions, /p_page_name: parsed\.data\.pageName,/);
  assert.match(actions, /p_section_name: parsed\.data\.sectionName,/);
  assert.doesNotMatch(actions, /p_page_name: parsed\.data\.pageName \|\| null/);
  assert.doesNotMatch(
    actions,
    /p_section_name: parsed\.data\.sectionName \|\| null/,
  );
});

test("attachment_file_id is omitted from the RPC payload when no attachment exists, and included only when a real value is present", async () => {
  const actions = await readSrcFile(
    "../../src/features/portal/revisions/actions.ts",
  );

  assert.match(
    actions,
    /\.\.\.\(attachmentFileId\s*\n\s*\?\s*\{ p_attachment_file_id: attachmentFileId \}\s*\n\s*:\s*\{\}\),/,
  );
  assert.doesNotMatch(actions, /p_attachment_file_id:.*\|\| null/);
  assert.doesNotMatch(actions, /p_attachment_file_id:.*\?\? null/);
});

test("no revision action ever sends an explicit null for a required RPC string argument", async () => {
  const actions = await readSrcFile(
    "../../src/features/portal/revisions/actions.ts",
  );

  assert.doesNotMatch(actions, /:\s*[a-zA-Z_.]+\s*\|\|\s*null/);
  assert.doesNotMatch(actions, /:\s*[a-zA-Z_.]+\s*\?\?\s*null/);
});

test("no unsafe type workaround was used anywhere in the revision actions", async () => {
  const internalActions = await readSrcFile(
    "../../src/features/revisions/actions.ts",
  );
  const portalActions = await readSrcFile(
    "../../src/features/portal/revisions/actions.ts",
  );

  for (const file of [internalActions, portalActions]) {
    assert.doesNotMatch(file, /as string/);
    assert.doesNotMatch(file, /as any/);
    assert.doesNotMatch(file, /as never/);
    assert.doesNotMatch(file, /@ts-ignore/);
    assert.doesNotMatch(file, /@ts-expect-error/);
  }
});

// -- Follow-up migration: p_attachment_file_id becomes genuinely optional ---

test("the follow-up migration gives create_client_revision's trailing p_attachment_file_id parameter a default of null, without reordering or retyping any other parameter", async () => {
  const fixMigration = await readAttachmentDefaultFixMigration();

  assert.match(
    fixMigration,
    /create or replace function public\.create_client_revision\(\s*\n\s*target_project_id uuid,\s*\n\s*p_page_name text,\s*\n\s*p_section_name text,\s*\n\s*p_title text,\s*\n\s*p_description text,\s*\n\s*p_priority text,\s*\n\s*p_attachment_file_id uuid default null\s*\n\s*\)/,
  );
});

test("the follow-up migration does not edit the already-applied Phase 8 migration file", async () => {
  const originalMigration = await readMigration();

  assert.doesNotMatch(originalMigration, /default null/);
});
