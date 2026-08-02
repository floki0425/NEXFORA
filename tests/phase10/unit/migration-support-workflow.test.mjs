// Static checks for Phase 10 support-ticket creation, tenant integrity, and
// the corrected status workflow. Live RLS and concurrency behavior belongs
// in integration tests.

import assert from "node:assert/strict";
import test from "node:test";

import {
  compactSql,
  readBaseMigration,
  readFollowUpMigration,
  sliceSql,
} from "./migration-test-helpers.mjs";

test("internal-create RPC has the named Supabase contract with its optional argument last", async () => {
  const migration = await readFollowUpMigration();
  const section = sliceSql(
    migration,
    "create or replace function public.create_internal_support_ticket",
    "revoke all on function public.create_internal_support_ticket",
  );
  const compact = compactSql(section);

  assert.match(
    compact,
    /create or replace function public\.create_internal_support_ticket\( target_client_id uuid, p_title text, p_description text, p_priority text, p_category text, target_project_id uuid default null \)/,
  );
  assert.match(
    compact,
    /returns table \(id uuid, ticket_number text, created_at timestamptz\)/,
  );
  assert.match(compact, /security definer set search_path = ''/);
});

test("internal-create RPC is super_admin/admin only and derives trusted fields server-side", async () => {
  const migration = await readFollowUpMigration();
  const section = sliceSql(
    migration,
    "create or replace function public.create_internal_support_ticket",
    "revoke all on function public.create_internal_support_ticket",
  );
  const signature = section.slice(0, section.indexOf("returns table"));

  assert.match(section, /array\['super_admin', 'admin'\]/);
  assert.doesNotMatch(section, /array\[[^\]]*project_manager/);
  assert.doesNotMatch(signature, /organization_id/);
  assert.doesNotMatch(signature, /ticket_number/);
  assert.doesNotMatch(signature, /created_by/);
  assert.match(
    section,
    /assigned_number := private\.next_ticket_number\(resolved_organization_id\);/,
  );
  assert.match(section, /'open',\s*actor_profile_id/);
  assert.match(
    section,
    /project\.organization_id = resolved_organization_id\s+and project\.client_id = target_client_id/,
  );
});

test("internal-create RPC is executable only by authenticated after default revocation", async () => {
  const migration = await readFollowUpMigration();
  const privileges = sliceSql(
    migration,
    "revoke all on function public.create_internal_support_ticket",
    "-- ---",
  );

  assert.match(privileges, /from public, anon, authenticated;/);
  assert.match(
    privileges,
    /grant execute on function public\.create_internal_support_ticket\([\s\S]*\) to authenticated;/,
  );
  assert.doesNotMatch(privileges, /to anon/);
});

test("follow-up preflights dirty tenant and assignment data before constraints", async () => {
  const migration = await readFollowUpMigration();
  const preflight = sliceSql(migration, "do $preflight$", "$preflight$;");

  assert.match(
    preflight,
    /ticket\.organization_id <> client\.organization_id/,
  );
  assert.match(
    preflight,
    /subscription\.organization_id <> client\.organization_id/,
  );
  assert.match(
    preflight,
    /activity\.organization_id <> ticket\.organization_id/,
  );
  assert.match(
    preflight,
    /ticket\.status = 'assigned'\s+and ticket\.assigned_to is null/,
  );
  assert.equal(
    [...preflight.matchAll(/raise exception using/g)].length,
    5,
    "each dirty-data condition should fail clearly",
  );
});

test("client/organization and ticket-activity tenant relationships are database-enforced", async () => {
  const migration = await readFollowUpMigration();
  const compact = compactSql(migration);

  assert.match(
    compact,
    /support_tickets_client_organization_fkey foreign key \(client_id, organization_id\) references public\.clients \(id, organization_id\)/,
  );
  assert.match(
    compact,
    /subscriptions_client_organization_fkey foreign key \(client_id, organization_id\) references public\.clients \(id, organization_id\)/,
  );
  assert.match(
    compact,
    /support_tickets_id_organization_id_key unique \(id, organization_id\)/,
  );
  assert.match(
    compact,
    /ticket_activities_ticket_organization_fkey foreign key \(ticket_id, organization_id\) references public\.support_tickets \(id, organization_id\) on delete cascade/,
  );
});

test("assigned status has a durable non-null assignee invariant", async () => {
  const migration = await readFollowUpMigration();

  assert.match(
    migration,
    /constraint support_tickets_assigned_to_required\s+check \(status <> 'assigned' or assigned_to is not null\)/,
  );

  const assignmentPolicy = sliceSql(
    migration,
    "create policy support_tickets_update_assignment",
    "drop policy if exists ticket_activities_select_internal_members",
  );
  assert.match(
    assignmentPolicy,
    /support_tickets\.status <> 'assigned'\s+or support_tickets\.assigned_to is not null/,
  );
});

test("corrected internal transition graph contains only the approved edges", async () => {
  const migration = await readFollowUpMigration();
  const transition = sliceSql(
    migration,
    "is_allowed_transition := (",
    "if not is_allowed_transition then",
  );
  const compact = compactSql(transition);

  assert.match(
    compact,
    /target_ticket\.status = 'open' and p_new_status = 'assigned'/,
  );
  assert.match(
    compact,
    /target_ticket\.status = 'assigned' and p_new_status = 'in_progress'/,
  );
  assert.match(
    compact,
    /target_ticket\.status = 'in_progress' and p_new_status in \('waiting_for_client', 'resolved'\)/,
  );
  assert.match(
    compact,
    /target_ticket\.status = 'waiting_for_client' and p_new_status in \('in_progress', 'resolved'\)/,
  );
  assert.doesNotMatch(compact, /status = 'resolved'/);
  assert.doesNotMatch(compact, /'open'[^)]*'in_progress'/);
  assert.doesNotMatch(compact, /'assigned'[^)]*'waiting_for_client'/);
});

test("resolving requires a bounded note and records status, timestamp, actor, and history atomically", async () => {
  const migration = await readFollowUpMigration();
  const section = sliceSql(
    migration,
    "create or replace function public.transition_ticket_status",
    "revoke all on function public.transition_ticket_status",
  );

  assert.match(
    section,
    /p_new_status = 'resolved' and normalized_note is null/,
  );
  assert.match(
    section,
    /char_length\(normalized_note\) > 3000/,
  );
  assert.match(
    section,
    /when p_new_status = 'resolved' then pg_catalog\.now\(\)/,
  );
  assert.match(section, /insert into public\.ticket_activities/);
  assert.match(
    section,
    /'from_status', target_ticket\.status,\s*'to_status', p_new_status/,
  );
  assert.match(section, /actor_profile_id/);
});

test("client close is resolved-only and repeated close is idempotent without duplicate activity", async () => {
  const migration = await readBaseMigration();
  const section = sliceSql(
    migration,
    "create or replace function public.close_ticket_by_client",
    "revoke all on function public.close_ticket_by_client",
  );
  const alreadyClosed = section.indexOf("if target_ticket.status = 'closed' then");
  const activityInsert = section.indexOf("insert into public.ticket_activities");

  assert.ok(alreadyClosed > -1);
  assert.ok(activityInsert > alreadyClosed);
  assert.match(
    section,
    /return query select 'closed'::text, true;\s+return;/,
  );
  assert.match(section, /if target_ticket\.status <> 'resolved' then/);
  assert.match(
    section,
    /set status = 'closed', closed_at = pg_catalog\.now\(\)/,
  );
  assert.match(section, /'closed',\s*'Client confirmed the resolution'/);
});

test("client reopen requires a comment, is resolved-only, and preserves the resolution note", async () => {
  const migration = await readBaseMigration();
  const section = sliceSql(
    migration,
    "create or replace function public.reopen_ticket_by_client",
    "revoke all on function public.reopen_ticket_by_client",
  );
  const update = sliceSql(
    section,
    "update public.support_tickets",
    "insert into public.ticket_activities",
  );

  assert.match(
    section,
    /normalized_comment = '' or char_length\(normalized_comment\) > 3000/,
  );
  assert.match(section, /if target_ticket\.status <> 'resolved' then/);
  assert.match(update, /set status = 'in_progress', resolved_at = null/);
  assert.doesNotMatch(update, /resolution_note/);
  assert.match(section, /'reopened'/);
  assert.match(section, /normalized_comment/);
});

test("client support reads expose curated fields and not internal assignment or actor data", async () => {
  const migration = await readBaseMigration();
  const tickets = sliceSql(
    migration,
    "create or replace function public.get_client_support_tickets",
    "revoke all on function public.get_client_support_tickets",
  );
  const activities = sliceSql(
    migration,
    "create or replace function public.get_client_ticket_activities",
    "revoke all on function public.get_client_ticket_activities",
  );
  const ticketReturns = tickets.slice(0, tickets.indexOf("language sql"));
  const activityReturns = activities.slice(0, activities.indexOf("language sql"));

  assert.doesNotMatch(ticketReturns, /organization_id|client_id|assigned_to|created_by/);
  assert.doesNotMatch(activityReturns, /organization_id|metadata|created_by/);
  assert.match(
    tickets,
    /ticket\.client_id = \(select private\.active_client_id\(\)\)/,
  );
  assert.match(
    activities,
    /ticket\.client_id = \(select private\.active_client_id\(\)\)/,
  );
});

test("follow-up uses a bounded owned-ticket detail read and retains the newest activity window", async () => {
  const migration = await readFollowUpMigration();
  const tickets = sliceSql(
    migration,
    "create or replace function public.get_client_support_ticket",
    "revoke all on function public.get_client_support_ticket",
  );
  const activities = sliceSql(
    migration,
    "create or replace function public.get_client_ticket_activities",
    "revoke all on function public.get_client_ticket_activities",
  );

  assert.match(tickets, /ticket\.id = target_ticket_id/);
  assert.match(
    tickets,
    /ticket\.client_id = \(select private\.active_client_id\(\)\)/,
  );
  const ticketReturns = tickets.slice(0, tickets.indexOf("language sql"));
  assert.doesNotMatch(
    ticketReturns,
    /organization_id|client_id|assigned_to|created_by/,
  );
  const ticketPrivileges = sliceSql(
    migration,
    "revoke all on function public.get_client_support_ticket",
    "create or replace function public.get_client_ticket_activities",
  );
  assert.match(ticketPrivileges, /from public, anon, authenticated;/);
  assert.match(ticketPrivileges, /to authenticated;/);
  assert.match(
    activities,
    /order by activity\.created_at desc, activity\.id desc\s+limit 200/,
  );
  assert.match(
    activities,
    /order by recent\.created_at asc, recent\.id asc/,
  );
});
