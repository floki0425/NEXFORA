-- Phase 11: domain-event seam. One database-level point where a sensitive
-- business mutation atomically produces (a) an immutable audit record and
-- (b) notifications for the correct internal recipients. Additive only: 5
-- new tables, new private/public functions, and AFTER triggers on existing
-- tables. Does not alter any existing table's columns, drop anything, or
-- change any existing function's signature, grants, or authorization logic.
--
-- Reconciliation notes (the approved handoff has a few internal
-- inconsistencies between its own sections; each is resolved once here
-- rather than silently, so a reviewer can find every deviation in one
-- place):
--
-- 1. audit_logs.action and notifications.event_type share ONE canonical
--    value set (see EVENT_TYPES below) instead of two separately-drifting
--    lists, because private.emit_event's signature (handoff SS8.6) takes a
--    single p_action and resolve_notification_recipients takes a single
--    p_event_type — the cleanest reading is that they are the same string
--    per emission.
-- 2. Reminder actions use the handoff SS6 names (invoice.reminder_due,
--    subscription.renewal_due, lead.follow_up_due) rather than the SS12
--    names (invoice.reminder_sent, subscription.renewal_reminder_sent,
--    lead.follow_up_raised), since SS6's names are what recipient
--    resolution is keyed on and one name must win.
-- 3. Three tables required by SS12's "must create an audit record" list
--    (project_members, subscription_usage, project_files) are not in SS8.7's
--    11-table trigger list. Definition of Done item 2 ("every listed action
--    writes exactly one audit record") only holds if those three are also
--    instrumented, so this migration adds three small, audit-only triggers
--    for them alongside the 11 from SS8.7.
-- 4. leads_emit_events fires on UPDATE OF status, converted_client_id (not
--    just status) because convert_lead_to_client() sets converted_client_id
--    without touching status in the same UPDATE — an UPDATE OF status
--    trigger alone would never see lead.converted.
-- 5. revisions_emit_events fires on UPDATE OF status, assigned_to (not just
--    status) so that revision.assigned (required by SS12) is reachable; SS8.7
--    only lists "UPDATE OF status" for revisions.
-- 6. Unresolved decision #3 (SS21: "whether reminder emails to clients go to
--    clients.email only, or also to portal client_users with role
--    owner/manager") is resolved as: client_users (owner/manager) only.
--    notifications.user_id is `not null references profiles(id)` and
--    notification_deliveries.notification_id is `not null references
--    notifications(id)` — there is no schema-consistent way to deliver to a
--    bare clients.email address with no profile behind it. A client with no
--    owner/manager portal account simply receives no emailed reminder this
--    phase; admins still do.
-- 7. The cron path does not call public.refresh_overdue_invoices(). That
--    function resolves the caller's organization from `auth.uid()` and
--    `return`s immediately when `auth.uid()` is null (see
--    20260804000000_phase_9_invoices_payments.sql:495-497) — under the
--    service-role connection the cron route and raise_due_invoice_reminders
--    both use, there is no JWT and no `auth.uid()`, so calling it would be a
--    silent no-op across every organization. raise_due_invoice_reminders()
--    below performs the equivalent cross-organization overdue sweep itself
--    instead of calling the existing (single-org, session-scoped) function.
-- 8. claim_pending_email_deliveries returns the raw notification fields
--    (title, message, event_type, entity_type, entity_id) rather than a
--    pre-built `subject`/`body_html` pair. Every other email in this repo is
--    templated in TypeScript (src/lib/email/templates/*.ts) using
--    escape-html.ts; building HTML inside SQL would duplicate escaping logic
--    in a second language and is inconsistent with that established
--    pattern. src/lib/reminders/run-reminders.ts builds the subject/body via
--    src/lib/email/templates/notification-email.ts before calling Resend.

-- ---------------------------------------------------------------------------
-- SECTION 0: preflight. Abort loudly rather than guess if the foundation
-- this migration builds on does not look like what it expects.
-- ---------------------------------------------------------------------------

do $preflight$
begin
  if to_regclass('public.organizations') is null
    or to_regclass('public.profiles') is null
    or to_regclass('public.organization_members') is null
    or to_regclass('public.leads') is null
    or to_regclass('public.clients') is null
    or to_regclass('public.client_users') is null
    or to_regclass('public.client_invitations') is null
    or to_regclass('public.projects') is null
    or to_regclass('public.milestones') is null
    or to_regclass('public.project_members') is null
    or to_regclass('public.proposals') is null
    or to_regclass('public.invoices') is null
    or to_regclass('public.payments') is null
    or to_regclass('public.revisions') is null
    or to_regclass('public.support_tickets') is null
    or to_regclass('public.subscriptions') is null
    or to_regclass('public.subscription_usage') is null
    or to_regclass('public.project_files') is null
  then
    raise exception using
      errcode = '55000',
      message = 'Phase 11 preflight aborted: one or more required Phase 1-10 tables are missing.';
  end if;

  if to_regprocedure('private.current_profile_id()') is null
    or to_regprocedure('private.is_internal_member(uuid)') is null
    or to_regprocedure('private.has_internal_role(uuid, text[])') is null
    or to_regprocedure('private.set_updated_at()') is null
    or to_regprocedure('private.can_manage_project(uuid)') is null
  then
    raise exception using
      errcode = '55000',
      message = 'Phase 11 preflight aborted: one or more required private helper functions are missing.';
  end if;

  if to_regclass('public.audit_logs') is not null
    or to_regclass('public.notifications') is not null
    or to_regclass('public.notification_preferences') is not null
    or to_regclass('public.notification_deliveries') is not null
    or to_regclass('private.reminder_runs') is not null
  then
    raise exception using
      errcode = '55000',
      message = 'Phase 11 preflight aborted: a Phase 11 object already exists. This migration must not run twice.';
  end if;
end;
$preflight$;

-- ---------------------------------------------------------------------------
-- SECTION 1: tables
-- ---------------------------------------------------------------------------

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  actor_user_id uuid,
  actor_type text not null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint audit_logs_organization_id_fkey
    foreign key (organization_id)
    references public.organizations (id)
    on delete cascade,
  constraint audit_logs_actor_user_id_fkey
    foreign key (actor_user_id)
    references public.profiles (id)
    on delete set null,
  constraint audit_logs_actor_type_check
    check (actor_type in ('internal', 'client', 'system')),
  constraint audit_logs_action_check
    check (
      action in (
        'lead.created', 'lead.status_changed', 'lead.won', 'lead.lost', 'lead.converted',
        'lead.follow_up_due',
        'client.created', 'client.archived', 'client.restored',
        'client_invitation.issued', 'client_invitation.revoked', 'client_invitation.accepted',
        'proposal.sent', 'proposal.viewed', 'proposal.accepted', 'proposal.declined',
        'proposal.changes_requested', 'proposal.access_token_reissued',
        'invoice.sent', 'invoice.voided', 'invoice.marked_overdue', 'invoice.reminder_due',
        'payment.recorded', 'payment.verified', 'payment.failed',
        'project.created', 'project.status_changed', 'project.completed',
        'project_member.added', 'project_member.removed', 'milestone.completed',
        'file.uploaded_internal', 'file.uploaded_client',
        'revision.created', 'revision.status_changed', 'revision.ready_for_review', 'revision.assigned',
        'ticket.created', 'ticket.assigned', 'ticket.status_changed', 'ticket.reopened',
        'subscription.created', 'subscription.cancelled', 'subscription.reactivated',
        'subscription.usage_recorded', 'subscription.renewal_due',
        'role.changed'
      )
    ),
  constraint audit_logs_entity_type_length
    check (char_length(entity_type) <= 40),
  constraint audit_logs_metadata_is_object
    check (jsonb_typeof(metadata) = 'object')
);

create index audit_logs_organization_created_idx
  on public.audit_logs (organization_id, created_at desc);
create index audit_logs_entity_idx
  on public.audit_logs (entity_type, entity_id);
create index audit_logs_actor_idx
  on public.audit_logs (actor_user_id);
create index audit_logs_organization_action_created_idx
  on public.audit_logs (organization_id, action, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  user_id uuid not null,
  event_type text not null,
  title text not null,
  message text,
  entity_type text,
  entity_id uuid,
  dedupe_key text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),

  constraint notifications_organization_id_fkey
    foreign key (organization_id)
    references public.organizations (id)
    on delete cascade,
  constraint notifications_user_id_fkey
    foreign key (user_id)
    references public.profiles (id)
    on delete cascade,
  constraint notifications_event_type_check
    check (
      event_type in (
        'lead.created', 'lead.status_changed', 'lead.won', 'lead.lost', 'lead.converted',
        'lead.follow_up_due',
        'client.created', 'client.archived', 'client.restored',
        'client_invitation.issued', 'client_invitation.revoked', 'client_invitation.accepted',
        'proposal.sent', 'proposal.viewed', 'proposal.accepted', 'proposal.declined',
        'proposal.changes_requested', 'proposal.access_token_reissued',
        'invoice.sent', 'invoice.voided', 'invoice.marked_overdue', 'invoice.reminder_due',
        'payment.recorded', 'payment.verified', 'payment.failed',
        'project.created', 'project.status_changed', 'project.completed',
        'project_member.added', 'project_member.removed', 'milestone.completed',
        'file.uploaded_internal', 'file.uploaded_client',
        'revision.created', 'revision.status_changed', 'revision.ready_for_review', 'revision.assigned',
        'ticket.created', 'ticket.assigned', 'ticket.status_changed', 'ticket.reopened',
        'subscription.created', 'subscription.cancelled', 'subscription.reactivated',
        'subscription.usage_recorded', 'subscription.renewal_due',
        'role.changed'
      )
    ),
  constraint notifications_title_not_blank
    check (btrim(title) <> '' and char_length(title) <= 200),
  constraint notifications_message_length
    check (message is null or char_length(message) <= 1000),
  constraint notifications_entity_type_length
    check (entity_type is null or char_length(entity_type) <= 40),
  constraint notifications_dedupe_key_length
    check (char_length(dedupe_key) <= 100),
  constraint notifications_dedupe_unique
    unique (user_id, event_type, entity_id, dedupe_key)
);

create index notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
create index notifications_user_unread_idx
  on public.notifications (user_id)
  where read_at is null;

create table public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  event_type text not null,
  in_app boolean not null default true,
  email boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint notification_preferences_profile_id_fkey
    foreign key (profile_id)
    references public.profiles (id)
    on delete cascade,
  constraint notification_preferences_event_type_check
    check (
      event_type in (
        'lead.created', 'lead.status_changed', 'lead.won', 'lead.lost', 'lead.converted',
        'lead.follow_up_due',
        'client.created', 'client.archived', 'client.restored',
        'client_invitation.issued', 'client_invitation.revoked', 'client_invitation.accepted',
        'proposal.sent', 'proposal.viewed', 'proposal.accepted', 'proposal.declined',
        'proposal.changes_requested', 'proposal.access_token_reissued',
        'invoice.sent', 'invoice.voided', 'invoice.marked_overdue', 'invoice.reminder_due',
        'payment.recorded', 'payment.verified', 'payment.failed',
        'project.created', 'project.status_changed', 'project.completed',
        'project_member.added', 'project_member.removed', 'milestone.completed',
        'file.uploaded_internal', 'file.uploaded_client',
        'revision.created', 'revision.status_changed', 'revision.ready_for_review', 'revision.assigned',
        'ticket.created', 'ticket.assigned', 'ticket.status_changed', 'ticket.reopened',
        'subscription.created', 'subscription.cancelled', 'subscription.reactivated',
        'subscription.usage_recorded', 'subscription.renewal_due',
        'role.changed'
      )
    ),
  constraint notification_preferences_profile_event_key
    unique (profile_id, event_type)
);

create trigger notification_preferences_set_updated_at
before update on public.notification_preferences
for each row
execute function private.set_updated_at();

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null,
  channel text not null default 'email',
  recipient_email text not null,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  last_error_code text,
  provider_reference text,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),

  constraint notification_deliveries_notification_id_fkey
    foreign key (notification_id)
    references public.notifications (id)
    on delete cascade,
  constraint notification_deliveries_channel_check
    check (channel in ('email')),
  constraint notification_deliveries_recipient_email_format
    check (
      recipient_email = lower(btrim(recipient_email))
      and recipient_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ),
  constraint notification_deliveries_status_check
    check (status in ('pending', 'sending', 'sent', 'failed')),
  constraint notification_deliveries_attempt_count_range
    check (attempt_count >= 0 and attempt_count <= 5),
  constraint notification_deliveries_last_error_code_length
    check (last_error_code is null or char_length(last_error_code) <= 60),
  constraint deliveries_sent_at_required
    check ((status = 'sent') = (sent_at is not null))
);

create index notification_deliveries_pending_idx
  on public.notification_deliveries (next_attempt_at)
  where status = 'pending';

create schema if not exists private;

create table private.reminder_runs (
  id uuid primary key default gen_random_uuid(),
  reminder_type text not null,
  entity_id uuid not null,
  window_key text not null,
  created_at timestamptz not null default now(),

  constraint reminder_runs_reminder_type_check
    check (reminder_type in ('invoice_reminder', 'renewal_reminder', 'lead_follow_up')),
  constraint reminder_runs_unique
    unique (reminder_type, entity_id, window_key)
);

revoke all on table private.reminder_runs from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- SECTION 2: row level security
-- ---------------------------------------------------------------------------

alter table public.audit_logs enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_deliveries enable row level security;

create policy audit_logs_select_admins
on public.audit_logs
for select
to authenticated
using (
  (select private.is_internal_member(organization_id))
  and (select private.has_internal_role(organization_id, array['super_admin', 'admin']))
);

create policy notifications_select_own
on public.notifications
for select
to authenticated
using (
  user_id = (select private.current_profile_id())
  and (select private.is_internal_member(organization_id))
);

create policy notification_preferences_select_own
on public.notification_preferences
for select
to authenticated
using (
  profile_id = (select private.current_profile_id())
);

-- notification_deliveries: no policy for `authenticated` on any command.
-- Absence of a policy denies access outright once RLS is enabled — this is
-- deliberate (SS9: "authenticated SELECT: none / authenticated writes: none
-- - service_role only"), not an oversight.

revoke all privileges on table public.audit_logs from public, anon, authenticated;
grant select on table public.audit_logs to authenticated;
grant all privileges on table public.audit_logs to service_role;

revoke all privileges on table public.notifications from public, anon, authenticated;
grant select on table public.notifications to authenticated;
grant all privileges on table public.notifications to service_role;

revoke all privileges on table public.notification_preferences from public, anon, authenticated;
grant select on table public.notification_preferences to authenticated;
grant all privileges on table public.notification_preferences to service_role;

revoke all privileges on table public.notification_deliveries from public, anon, authenticated;
grant all privileges on table public.notification_deliveries to service_role;

-- ---------------------------------------------------------------------------
-- SECTION 3: private helpers
-- ---------------------------------------------------------------------------

create or replace function private.resolve_event_actor(
  p_organization_id uuid,
  p_client_id uuid default null
)
returns table (actor_user_id uuid, actor_type text)
language sql
stable
security definer
set search_path = ''
as $function$
  with actor as (
    select private.current_profile_id() as profile_id
  )
  select
    actor.profile_id,
    case
      when actor.profile_id is null then 'system'
      when p_organization_id is not null
        and (select private.is_internal_member(p_organization_id)) then 'internal'
      when p_client_id is not null and exists (
        select 1
        from public.client_users as membership
        where membership.client_id = p_client_id
          and membership.user_id = actor.profile_id
          and membership.status = 'active'
      ) then 'client'
      else 'system'
    end
  from actor;
$function$;

revoke all on function private.resolve_event_actor(uuid, uuid)
  from public, anon, authenticated;

create or replace function private.notification_title(p_action text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $function$
  select case p_action
    when 'lead.created' then 'New lead received'
    when 'lead.status_changed' then 'Lead status updated'
    when 'lead.won' then 'Lead won'
    when 'lead.lost' then 'Lead lost'
    when 'lead.converted' then 'Lead converted to client'
    when 'lead.follow_up_due' then 'Lead needs follow-up'
    when 'client.created' then 'New client created'
    when 'client.archived' then 'Client archived'
    when 'client.restored' then 'Client restored'
    when 'client_invitation.issued' then 'Client invitation sent'
    when 'client_invitation.revoked' then 'Client invitation revoked'
    when 'client_invitation.accepted' then 'Client invitation accepted'
    when 'proposal.sent' then 'Proposal sent'
    when 'proposal.viewed' then 'Proposal viewed'
    when 'proposal.accepted' then 'Proposal accepted'
    when 'proposal.declined' then 'Proposal declined'
    when 'proposal.changes_requested' then 'Proposal changes requested'
    when 'proposal.access_token_reissued' then 'Proposal link reissued'
    when 'invoice.sent' then 'Invoice sent'
    when 'invoice.voided' then 'Invoice voided'
    when 'invoice.marked_overdue' then 'Invoice overdue'
    when 'invoice.reminder_due' then 'Invoice reminder'
    when 'payment.recorded' then 'Payment recorded'
    when 'payment.verified' then 'Payment verified'
    when 'payment.failed' then 'Payment failed'
    when 'project.created' then 'New project created'
    when 'project.status_changed' then 'Project status updated'
    when 'project.completed' then 'Project completed'
    when 'project_member.added' then 'Project member added'
    when 'project_member.removed' then 'Project member removed'
    when 'milestone.completed' then 'Milestone completed'
    when 'file.uploaded_internal' then 'Internal file uploaded'
    when 'file.uploaded_client' then 'Client file uploaded'
    when 'revision.created' then 'Revision submitted'
    when 'revision.status_changed' then 'Revision status updated'
    when 'revision.ready_for_review' then 'Revision ready for review'
    when 'revision.assigned' then 'Revision assigned'
    when 'ticket.created' then 'New support ticket'
    when 'ticket.assigned' then 'Ticket assigned'
    when 'ticket.status_changed' then 'Ticket status updated'
    when 'ticket.reopened' then 'Ticket reopened'
    when 'subscription.created' then 'Subscription created'
    when 'subscription.cancelled' then 'Subscription cancelled'
    when 'subscription.reactivated' then 'Subscription reactivated'
    when 'subscription.usage_recorded' then 'Subscription usage recorded'
    when 'subscription.renewal_due' then 'Subscription renewal due'
    when 'role.changed' then 'Role changed'
    else initcap(replace(p_action, '.', ' '))
  end;
$function$;

revoke all on function private.notification_title(text)
  from public, anon, authenticated;

create or replace function private.resolve_notification_recipients(
  p_event_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_organization_id uuid
)
returns table (profile_id uuid, email text)
language sql
stable
security definer
set search_path = ''
as $function$
  -- Branch 1: every active admin/super_admin in the organization.
  select membership.user_id, auth_user.email
  from public.organization_members as membership
  inner join public.profiles as profile on profile.id = membership.user_id
  inner join auth.users as auth_user on auth_user.id = profile.auth_user_id
  where membership.organization_id = p_organization_id
    and membership.status = 'active'
    and membership.role in ('super_admin', 'admin')
    and p_event_type = any (array[
      'lead.created', 'lead.status_changed', 'lead.won', 'lead.lost', 'lead.follow_up_due',
      'proposal.sent', 'proposal.viewed', 'proposal.accepted', 'proposal.declined',
      'proposal.changes_requested',
      'invoice.sent', 'invoice.voided', 'invoice.reminder_due',
      'payment.recorded', 'payment.verified', 'payment.failed',
      'ticket.created', 'ticket.assigned', 'ticket.reopened',
      'subscription.created', 'subscription.cancelled', 'subscription.renewal_due',
      'client.created', 'client.archived'
    ])

  union

  -- Branch 2: leads.assigned_to for lead lifecycle + follow-up events.
  select lead.assigned_to, auth_user.email
  from public.leads as lead
  inner join public.profiles as profile on profile.id = lead.assigned_to
  inner join auth.users as auth_user on auth_user.id = profile.auth_user_id
  inner join public.organization_members as membership
    on membership.organization_id = lead.organization_id
    and membership.user_id = lead.assigned_to
    and membership.status = 'active'
  where p_entity_type = 'lead'
    and lead.id = p_entity_id
    and lead.assigned_to is not null
    and p_event_type = any (array[
      'lead.created', 'lead.status_changed', 'lead.won', 'lead.lost', 'lead.follow_up_due'
    ])

  union

  -- Branch 3: support_tickets.assigned_to.
  select ticket.assigned_to, auth_user.email
  from public.support_tickets as ticket
  inner join public.profiles as profile on profile.id = ticket.assigned_to
  inner join auth.users as auth_user on auth_user.id = profile.auth_user_id
  inner join public.organization_members as membership
    on membership.organization_id = ticket.organization_id
    and membership.user_id = ticket.assigned_to
    and membership.status = 'active'
  where p_entity_type = 'support_ticket'
    and ticket.id = p_entity_id
    and ticket.assigned_to is not null
    and p_event_type = any (array['ticket.created', 'ticket.assigned', 'ticket.reopened'])

  union

  -- Branch 4: proposals.created_by.
  select proposal.created_by, auth_user.email
  from public.proposals as proposal
  inner join public.profiles as profile on profile.id = proposal.created_by
  inner join auth.users as auth_user on auth_user.id = profile.auth_user_id
  inner join public.organization_members as membership
    on membership.organization_id = proposal.organization_id
    and membership.user_id = proposal.created_by
    and membership.status = 'active'
  where p_entity_type = 'proposal'
    and proposal.id = p_entity_id
    and proposal.created_by is not null
    and p_event_type = any (array[
      'proposal.sent', 'proposal.viewed', 'proposal.accepted', 'proposal.declined',
      'proposal.changes_requested'
    ])

  union

  -- Branch 5: revision.created / revision.ready_for_review -> the project's
  -- project_manager_id.
  select project.project_manager_id, auth_user.email
  from public.revisions as revision
  inner join public.projects as project on project.id = revision.project_id
  inner join public.profiles as profile on profile.id = project.project_manager_id
  inner join auth.users as auth_user on auth_user.id = profile.auth_user_id
  inner join public.organization_members as membership
    on membership.organization_id = revision.organization_id
    and membership.user_id = project.project_manager_id
    and membership.status = 'active'
  where p_entity_type = 'revision'
    and revision.id = p_entity_id
    and project.project_manager_id is not null
    and p_event_type = any (array['revision.created', 'revision.ready_for_review'])

  union

  -- Branch 5b: same two events -> the revision's own assigned_to.
  select revision.assigned_to, auth_user.email
  from public.revisions as revision
  inner join public.profiles as profile on profile.id = revision.assigned_to
  inner join auth.users as auth_user on auth_user.id = profile.auth_user_id
  inner join public.organization_members as membership
    on membership.organization_id = revision.organization_id
    and membership.user_id = revision.assigned_to
    and membership.status = 'active'
  where p_entity_type = 'revision'
    and revision.id = p_entity_id
    and revision.assigned_to is not null
    and p_event_type = any (array['revision.created', 'revision.ready_for_review'])

  union

  -- Branch 6: project.completed / milestone.completed -> project_manager_id.
  select project.project_manager_id, auth_user.email
  from public.projects as project
  inner join public.profiles as profile on profile.id = project.project_manager_id
  inner join auth.users as auth_user on auth_user.id = profile.auth_user_id
  inner join public.organization_members as membership
    on membership.organization_id = project.organization_id
    and membership.user_id = project.project_manager_id
    and membership.status = 'active'
  where (
      (p_entity_type = 'project' and project.id = p_entity_id)
      or (
        p_entity_type = 'milestone'
        and project.id = (
          select milestone.project_id
          from public.milestones as milestone
          where milestone.id = p_entity_id
        )
      )
    )
    and project.project_manager_id is not null
    and p_event_type = any (array['project.completed', 'milestone.completed'])

  union

  -- Branch 6b: same two events -> project_members.
  select pm.user_id, auth_user.email
  from public.project_members as pm
  inner join public.projects as project on project.id = pm.project_id
  inner join public.profiles as profile on profile.id = pm.user_id
  inner join auth.users as auth_user on auth_user.id = profile.auth_user_id
  inner join public.organization_members as membership
    on membership.organization_id = project.organization_id
    and membership.user_id = pm.user_id
    and membership.status = 'active'
  where (
      (p_entity_type = 'project' and project.id = p_entity_id)
      or (
        p_entity_type = 'milestone'
        and project.id = (
          select milestone.project_id
          from public.milestones as milestone
          where milestone.id = p_entity_id
        )
      )
    )
    and p_event_type = any (array['project.completed', 'milestone.completed'])

  union

  -- Branch 7: invoice.reminder_due / subscription.renewal_due -> client
  -- portal owner/manager users (see reconciliation note 6 above).
  select cu.user_id, auth_user.email
  from public.client_users as cu
  inner join public.clients as client on client.id = cu.client_id
  inner join public.profiles as profile on profile.id = cu.user_id
  inner join auth.users as auth_user on auth_user.id = profile.auth_user_id
  where (
      (
        p_entity_type = 'invoice'
        and client.id = (
          select invoice.client_id from public.invoices as invoice where invoice.id = p_entity_id
        )
      )
      or (
        p_entity_type = 'subscription'
        and client.id = (
          select subscription.client_id
          from public.subscriptions as subscription
          where subscription.id = p_entity_id
        )
      )
    )
    and cu.status = 'active'
    and cu.role in ('owner', 'manager')
    and p_event_type = any (array['invoice.reminder_due', 'subscription.renewal_due']);
$function$;

revoke all on function private.resolve_notification_recipients(text, text, uuid, uuid)
  from public, anon, authenticated;

create or replace function private.emit_event(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_actor_type text,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_metadata jsonb,
  p_dedupe_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  recipient record;
  new_notification_id uuid;
  pref_in_app boolean;
  pref_email boolean;
begin
  insert into public.audit_logs (
    organization_id, actor_user_id, actor_type, action, entity_type, entity_id, metadata
  )
  values (
    p_organization_id, p_actor_user_id, p_actor_type, p_action, p_entity_type, p_entity_id,
    coalesce(p_metadata, '{}'::jsonb)
  );

  -- Recipient resolution and notification fan-out are best-effort: a failure
  -- here must never roll back the audit row above or the business mutation
  -- that triggered this event (SS21 risk: "emit_event must never raise on
  -- recipient-resolution failure").
  begin
    for recipient in
      select resolved.profile_id, resolved.email
      from private.resolve_notification_recipients(
        p_action, p_entity_type, p_entity_id, p_organization_id
      ) as resolved
      where resolved.profile_id is distinct from p_actor_user_id
    loop
      select coalesce(pref.in_app, true), coalesce(pref.email, true)
      into pref_in_app, pref_email
      from public.notification_preferences as pref
      where pref.profile_id = recipient.profile_id
        and pref.event_type = p_action;

      if not found then
        pref_in_app := true;
        pref_email := true;
      end if;

      new_notification_id := null;

      if pref_in_app then
        insert into public.notifications (
          organization_id, user_id, event_type, title, message, entity_type, entity_id, dedupe_key
        )
        values (
          p_organization_id, recipient.profile_id, p_action,
          private.notification_title(p_action), null,
          p_entity_type, p_entity_id, p_dedupe_key
        )
        on conflict (user_id, event_type, entity_id, dedupe_key) do nothing
        returning id into new_notification_id;
      end if;

      if pref_email and recipient.email is not null and new_notification_id is not null then
        insert into public.notification_deliveries (
          notification_id, channel, recipient_email, status, next_attempt_at
        )
        values (
          new_notification_id, 'email', recipient.email, 'pending', now()
        );
      end if;
    end loop;
  exception
    when others then
      null;
  end;
end;
$function$;

revoke all on function private.emit_event(uuid, uuid, text, text, text, uuid, jsonb, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- SECTION 4: public RPCs granted to `authenticated`
-- ---------------------------------------------------------------------------

create or replace function public.list_my_notifications(
  p_limit integer default 20,
  p_before timestamptz default null
)
returns table (
  id uuid,
  event_type text,
  title text,
  message text,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    notification.id, notification.event_type, notification.title, notification.message,
    notification.entity_type, notification.entity_id, notification.read_at, notification.created_at
  from public.notifications as notification
  where notification.user_id = (select private.current_profile_id())
    and (p_before is null or notification.created_at < p_before)
  order by notification.created_at desc, notification.id desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$function$;

revoke all on function public.list_my_notifications(integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.list_my_notifications(integer, timestamptz) to authenticated;

create or replace function public.get_my_unread_notification_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $function$
  select count(*)::integer
  from public.notifications as notification
  where notification.user_id = (select private.current_profile_id())
    and notification.read_at is null;
$function$;

revoke all on function public.get_my_unread_notification_count()
  from public, anon, authenticated;
grant execute on function public.get_my_unread_notification_count() to authenticated;

create or replace function public.mark_notification_read(
  p_notification_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  update public.notifications
  set read_at = now()
  where id = p_notification_id
    and user_id = (select private.current_profile_id())
    and read_at is null;
end;
$function$;

revoke all on function public.mark_notification_read(uuid)
  from public, anon, authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;

create or replace function public.mark_all_notifications_read()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  update public.notifications
  set read_at = now()
  where user_id = (select private.current_profile_id())
    and read_at is null;
end;
$function$;

revoke all on function public.mark_all_notifications_read()
  from public, anon, authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;

create or replace function public.set_notification_preference(
  p_event_type text,
  p_in_app boolean,
  p_email boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_profile_id uuid;
begin
  actor_profile_id := private.current_profile_id();

  if actor_profile_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'Authentication is required.';
  end if;

  insert into public.notification_preferences (profile_id, event_type, in_app, email)
  values (actor_profile_id, p_event_type, p_in_app, p_email)
  on conflict (profile_id, event_type)
  do update set
    in_app = excluded.in_app,
    email = excluded.email,
    updated_at = now();
end;
$function$;

revoke all on function public.set_notification_preference(text, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.set_notification_preference(text, boolean, boolean)
  to authenticated;

create or replace function public.list_audit_logs(
  p_limit integer default 50,
  p_offset integer default 0,
  p_entity_type text default null,
  p_action text default null,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  id uuid,
  actor_user_id uuid,
  actor_type text,
  action text,
  entity_type text,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  actor_organization_id uuid;
  active_membership_count integer;
begin
  select
    min(membership.organization_id::text)::uuid,
    count(*)::integer
  into actor_organization_id, active_membership_count
  from public.organization_members as membership
  inner join public.profiles as profile
    on profile.id = membership.user_id
  inner join public.organizations as organization
    on organization.id = membership.organization_id
  where profile.auth_user_id = (select auth.uid())
    and membership.status = 'active'
    and membership.role in ('super_admin', 'admin')
    and organization.status = 'active';

  if active_membership_count <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'You do not have permission to view the audit log.';
  end if;

  return query
    select
      log.id, log.actor_user_id, log.actor_type, log.action, log.entity_type, log.entity_id,
      log.metadata, log.created_at
    from public.audit_logs as log
    where log.organization_id = actor_organization_id
      and (p_entity_type is null or log.entity_type = p_entity_type)
      and (p_action is null or log.action = p_action)
      and (p_from is null or log.created_at >= p_from)
      and (p_to is null or log.created_at <= p_to)
    order by log.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 100))
    offset greatest(0, coalesce(p_offset, 0));
end;
$function$;

revoke all on function public.list_audit_logs(
  integer, integer, text, text, timestamptz, timestamptz
) from public, anon, authenticated;
grant execute on function public.list_audit_logs(
  integer, integer, text, text, timestamptz, timestamptz
) to authenticated;

-- ---------------------------------------------------------------------------
-- SECTION 5: service-role-only RPCs (scheduled reminders + email outbox)
-- ---------------------------------------------------------------------------

create or replace function public.raise_due_invoice_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  raised_count integer := 0;
  invoice_row record;
  claimed_id uuid;
begin
  -- public.refresh_overdue_invoices() is session-scoped to the caller's own
  -- organization and no-ops entirely when auth.uid() is null (see
  -- reconciliation note 7 at the top of this migration); this cross-org
  -- sweep replaces it for the service-role reminder path only.
  update public.invoices
  set status = 'overdue'
  where status in ('sent', 'partial')
    and due_date is not null
    and due_date < current_date
    and total - amount_paid > 0;

  for invoice_row in
    select
      invoice.id, invoice.organization_id, invoice.invoice_number, invoice.currency,
      invoice.due_date, invoice.status,
      case
        when invoice.due_date = current_date + 3 then 'due-3'
        when invoice.due_date = current_date then 'due-0'
        when invoice.due_date = current_date - 7 then 'overdue+7'
        else null
      end as window_key
    from public.invoices as invoice
    where invoice.status in ('sent', 'partial', 'overdue')
      and invoice.due_date is not null
      and invoice.total - invoice.amount_paid > 0
      and invoice.due_date in (current_date + 3, current_date, current_date - 7)
  loop
    if invoice_row.window_key is null then
      continue;
    end if;

    insert into private.reminder_runs (reminder_type, entity_id, window_key)
    values ('invoice_reminder', invoice_row.id, invoice_row.window_key)
    on conflict (reminder_type, entity_id, window_key) do nothing
    returning id into claimed_id;

    if claimed_id is not null then
      perform private.emit_event(
        invoice_row.organization_id, null, 'system', 'invoice.reminder_due', 'invoice', invoice_row.id,
        jsonb_build_object(
          'invoice_number', invoice_row.invoice_number,
          'currency', invoice_row.currency,
          'window_key', invoice_row.window_key
        ),
        invoice_row.window_key
      );
      raised_count := raised_count + 1;
    end if;
  end loop;

  return raised_count;
end;
$function$;

revoke all on function public.raise_due_invoice_reminders()
  from public, anon, authenticated;
grant execute on function public.raise_due_invoice_reminders() to service_role;

create or replace function public.raise_due_renewal_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  raised_count integer := 0;
  subscription_row record;
  claimed_id uuid;
begin
  for subscription_row in
    select
      subscription.id, subscription.organization_id, subscription.plan_name,
      subscription.renewal_at,
      case
        when subscription.renewal_at::date = current_date + 14 then 'renewal-14'
        when subscription.renewal_at::date = current_date + 3 then 'renewal-3'
        else null
      end as window_key
    from public.subscriptions as subscription
    where subscription.status = 'active'
      and subscription.renewal_at is not null
      and subscription.renewal_at::date in (current_date + 14, current_date + 3)
  loop
    if subscription_row.window_key is null then
      continue;
    end if;

    insert into private.reminder_runs (reminder_type, entity_id, window_key)
    values ('renewal_reminder', subscription_row.id, subscription_row.window_key)
    on conflict (reminder_type, entity_id, window_key) do nothing
    returning id into claimed_id;

    if claimed_id is not null then
      perform private.emit_event(
        subscription_row.organization_id, null, 'system', 'subscription.renewal_due', 'subscription',
        subscription_row.id,
        jsonb_build_object(
          'plan_name', subscription_row.plan_name,
          'window_key', subscription_row.window_key
        ),
        subscription_row.window_key
      );
      raised_count := raised_count + 1;
    end if;
  end loop;

  return raised_count;
end;
$function$;

revoke all on function public.raise_due_renewal_reminders()
  from public, anon, authenticated;
grant execute on function public.raise_due_renewal_reminders() to service_role;

create or replace function public.raise_due_lead_follow_ups()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  raised_count integer := 0;
  lead_row record;
  claimed_id uuid;
  threshold_date date;
begin
  for lead_row in
    select
      lead.id, lead.organization_id, lead.status, lead.updated_at, lead.created_at,
      (
        select max(activity.created_at)
        from public.lead_activities as activity
        where activity.lead_id = lead.id
      ) as last_activity_at
    from public.leads as lead
    where lead.status in ('contacted', 'discovery', 'proposal', 'negotiation')
  loop
    threshold_date := (
      greatest(
        lead_row.updated_at,
        coalesce(lead_row.last_activity_at, lead_row.created_at)
      ) + interval '7 days'
    )::date;

    if current_date < threshold_date then
      continue;
    end if;

    insert into private.reminder_runs (reminder_type, entity_id, window_key)
    values ('lead_follow_up', lead_row.id, threshold_date::text)
    on conflict (reminder_type, entity_id, window_key) do nothing
    returning id into claimed_id;

    if claimed_id is not null then
      perform private.emit_event(
        lead_row.organization_id, null, 'system', 'lead.follow_up_due', 'lead', lead_row.id,
        jsonb_build_object('window_key', threshold_date::text),
        threshold_date::text
      );
      raised_count := raised_count + 1;
    end if;
  end loop;

  return raised_count;
end;
$function$;

revoke all on function public.raise_due_lead_follow_ups()
  from public, anon, authenticated;
grant execute on function public.raise_due_lead_follow_ups() to service_role;

create or replace function public.claim_pending_email_deliveries(
  p_limit integer default 20
)
returns table (
  delivery_id uuid,
  recipient_email text,
  event_type text,
  title text,
  message text,
  entity_type text,
  entity_id uuid
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  return query
    update public.notification_deliveries as delivery
    set status = 'sending'
    from public.notifications as notification
    where delivery.notification_id = notification.id
      and delivery.id in (
        select claimable.id
        from public.notification_deliveries as claimable
        where claimable.status = 'pending'
          and claimable.next_attempt_at <= now()
        order by claimable.next_attempt_at
        limit greatest(1, least(coalesce(p_limit, 20), 50))
        for update skip locked
      )
    returning
      delivery.id, delivery.recipient_email, notification.event_type, notification.title,
      notification.message, notification.entity_type, notification.entity_id;
end;
$function$;

revoke all on function public.claim_pending_email_deliveries(integer)
  from public, anon, authenticated;
grant execute on function public.claim_pending_email_deliveries(integer) to service_role;

create or replace function public.mark_email_delivery_result(
  p_delivery_id uuid,
  p_status text,
  p_error_code text default null,
  p_provider_reference text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_attempt_count integer;
begin
  if p_status not in ('sent', 'failed') then
    raise exception using
      errcode = 'P0001',
      message = 'p_status must be sent or failed.';
  end if;

  if p_status = 'sent' then
    update public.notification_deliveries
    set status = 'sent', sent_at = now(), provider_reference = p_provider_reference
    where id = p_delivery_id
      and status = 'sending';
    return;
  end if;

  select attempt_count + 1
  into current_attempt_count
  from public.notification_deliveries
  where id = p_delivery_id
    and status = 'sending';

  if not found then
    return;
  end if;

  update public.notification_deliveries
  set
    attempt_count = current_attempt_count,
    last_error_code = p_error_code,
    status = case when current_attempt_count >= 5 then 'failed' else 'pending' end,
    next_attempt_at = case current_attempt_count
      when 1 then now() + interval '1 minute'
      when 2 then now() + interval '5 minutes'
      when 3 then now() + interval '30 minutes'
      when 4 then now() + interval '2 hours'
      else now() + interval '6 hours'
    end
  where id = p_delivery_id;
end;
$function$;

revoke all on function public.mark_email_delivery_result(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.mark_email_delivery_result(uuid, text, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- SECTION 6: trigger-first instrumentation. AFTER triggers are the primary
-- mechanism because the repo uses a hybrid write model (column-scoped
-- PostgREST grants and SECURITY DEFINER RPCs) — a trigger fires on both
-- paths and cannot be bypassed by either. 11 tables from the handoff's
-- SS8.7 trigger table, plus 3 more (project_members, subscription_usage,
-- project_files) required to satisfy every action in SS12's audit-action
-- table (reconciliation note 3 above).
-- ---------------------------------------------------------------------------

-- leads --------------------------------------------------------------------

create or replace function private.emit_leads_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid;
  v_actor_type text;
begin
  select actor.actor_user_id, actor.actor_type
  into v_actor_id, v_actor_type
  from private.resolve_event_actor(new.organization_id, null) as actor;

  if tg_op = 'INSERT' then
    perform private.emit_event(
      new.organization_id, v_actor_id, v_actor_type, 'lead.created', 'lead', new.id,
      pg_catalog.jsonb_build_object('source', new.source),
      coalesce(new.updated_at, new.created_at)::text
    );
    return new;
  end if;

  if old.status is distinct from new.status then
    perform private.emit_event(
      new.organization_id, v_actor_id, v_actor_type,
      case new.status
        when 'won' then 'lead.won'
        when 'lost' then 'lead.lost'
        else 'lead.status_changed'
      end,
      'lead', new.id,
      pg_catalog.jsonb_build_object('old_status', old.status, 'new_status', new.status),
      new.updated_at::text
    );
  elsif old.converted_client_id is distinct from new.converted_client_id
    and new.converted_client_id is not null
  then
    perform private.emit_event(
      new.organization_id, v_actor_id, v_actor_type, 'lead.converted', 'lead', new.id,
      pg_catalog.jsonb_build_object('client_id', new.converted_client_id),
      new.updated_at::text
    );
  end if;

  return new;
end;
$function$;

revoke all on function private.emit_leads_events() from public, anon, authenticated;

create trigger leads_emit_events
after insert or update of status, converted_client_id on public.leads
for each row
execute function private.emit_leads_events();

-- clients --------------------------------------------------------------------

create or replace function private.emit_clients_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid;
  v_actor_type text;
begin
  select actor.actor_user_id, actor.actor_type
  into v_actor_id, v_actor_type
  from private.resolve_event_actor(new.organization_id, new.id) as actor;

  if tg_op = 'INSERT' then
    perform private.emit_event(
      new.organization_id, v_actor_id, v_actor_type, 'client.created', 'client', new.id,
      pg_catalog.jsonb_build_object('business_name', new.business_name),
      coalesce(new.updated_at, new.created_at)::text
    );
    return new;
  end if;

  if new.status = 'archived' and old.status is distinct from 'archived' then
    perform private.emit_event(
      new.organization_id, v_actor_id, v_actor_type, 'client.archived', 'client', new.id,
      pg_catalog.jsonb_build_object('old_status', old.status, 'new_status', new.status),
      new.updated_at::text
    );
  elsif old.status = 'archived' and new.status is distinct from 'archived' then
    perform private.emit_event(
      new.organization_id, v_actor_id, v_actor_type, 'client.restored', 'client', new.id,
      pg_catalog.jsonb_build_object('old_status', old.status, 'new_status', new.status),
      new.updated_at::text
    );
  end if;

  return new;
end;
$function$;

revoke all on function private.emit_clients_events() from public, anon, authenticated;

create trigger clients_emit_events
after insert or update of status on public.clients
for each row
execute function private.emit_clients_events();

-- client_invitations ---------------------------------------------------------

create or replace function private.emit_client_invitations_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid;
  v_actor_type text;
  v_organization_id uuid;
begin
  select client.organization_id
  into v_organization_id
  from public.clients as client
  where client.id = new.client_id;

  select actor.actor_user_id, actor.actor_type
  into v_actor_id, v_actor_type
  from private.resolve_event_actor(v_organization_id, new.client_id) as actor;

  if tg_op = 'INSERT' then
    perform private.emit_event(
      v_organization_id, v_actor_id, v_actor_type, 'client_invitation.issued',
      'client_invitation', new.id,
      pg_catalog.jsonb_build_object('role', new.role),
      new.created_at::text
    );
    return new;
  end if;

  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    perform private.emit_event(
      v_organization_id, v_actor_id, v_actor_type, 'client_invitation.accepted',
      'client_invitation', new.id,
      pg_catalog.jsonb_build_object('old_status', old.status, 'new_status', new.status),
      coalesce(new.accepted_at, new.created_at)::text
    );
  elsif new.status = 'revoked' and old.status is distinct from 'revoked' then
    perform private.emit_event(
      v_organization_id, v_actor_id, v_actor_type, 'client_invitation.revoked',
      'client_invitation', new.id,
      pg_catalog.jsonb_build_object('old_status', old.status, 'new_status', new.status),
      pg_catalog.now()::text
    );
  end if;

  return new;
end;
$function$;

revoke all on function private.emit_client_invitations_events()
  from public, anon, authenticated;

create trigger client_invitations_emit_events
after insert or update of status on public.client_invitations
for each row
execute function private.emit_client_invitations_events();

-- projects --------------------------------------------------------------------

create or replace function private.emit_projects_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid;
  v_actor_type text;
begin
  select actor.actor_user_id, actor.actor_type
  into v_actor_id, v_actor_type
  from private.resolve_event_actor(new.organization_id, new.client_id) as actor;

  if tg_op = 'INSERT' then
    perform private.emit_event(
      new.organization_id, v_actor_id, v_actor_type, 'project.created', 'project', new.id,
      pg_catalog.jsonb_build_object('status', new.status),
      coalesce(new.updated_at, new.created_at)::text
    );
    return new;
  end if;

  if old.status is distinct from new.status then
    perform private.emit_event(
      new.organization_id, v_actor_id, v_actor_type,
      case new.status when 'completed' then 'project.completed' else 'project.status_changed' end,
      'project', new.id,
      pg_catalog.jsonb_build_object('old_status', old.status, 'new_status', new.status),
      new.updated_at::text
    );
  end if;

  return new;
end;
$function$;

revoke all on function private.emit_projects_events() from public, anon, authenticated;

create trigger projects_emit_events
after insert or update of status on public.projects
for each row
execute function private.emit_projects_events();

-- milestones ------------------------------------------------------------------

create or replace function private.emit_milestones_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid;
  v_actor_type text;
  v_organization_id uuid;
  v_client_id uuid;
begin
  select project.organization_id, project.client_id
  into v_organization_id, v_client_id
  from public.projects as project
  where project.id = new.project_id;

  select actor.actor_user_id, actor.actor_type
  into v_actor_id, v_actor_type
  from private.resolve_event_actor(v_organization_id, v_client_id) as actor;

  perform private.emit_event(
    v_organization_id, v_actor_id, v_actor_type, 'milestone.completed', 'milestone', new.id,
    pg_catalog.jsonb_build_object('project_id', new.project_id),
    coalesce(new.completed_at, new.updated_at)::text
  );

  return new;
end;
$function$;

revoke all on function private.emit_milestones_events() from public, anon, authenticated;

create trigger milestones_emit_events
after update of status on public.milestones
for each row
when (new.status = 'completed' and old.status is distinct from 'completed')
execute function private.emit_milestones_events();

-- project_members (audit only; not in SS8.7's table, added per
-- reconciliation note 3) ------------------------------------------------------

create or replace function private.emit_project_members_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid;
  v_actor_type text;
  v_organization_id uuid;
  v_client_id uuid;
  v_row public.project_members;
  v_action text;
  v_entity_id uuid;
begin
  v_row := coalesce(new, old);

  select project.organization_id, project.client_id
  into v_organization_id, v_client_id
  from public.projects as project
  where project.id = v_row.project_id;

  select actor.actor_user_id, actor.actor_type
  into v_actor_id, v_actor_type
  from private.resolve_event_actor(v_organization_id, v_client_id) as actor;

  if tg_op = 'INSERT' then
    v_action := 'project_member.added';
    v_entity_id := new.id;
  else
    v_action := 'project_member.removed';
    v_entity_id := old.id;
  end if;

  perform private.emit_event(
    v_organization_id, v_actor_id, v_actor_type, v_action, 'project_member', v_entity_id,
    pg_catalog.jsonb_build_object('project_id', v_row.project_id, 'user_id', v_row.user_id),
    pg_catalog.now()::text
  );

  return v_row;
end;
$function$;

revoke all on function private.emit_project_members_events()
  from public, anon, authenticated;

create trigger project_members_emit_events
after insert or delete on public.project_members
for each row
execute function private.emit_project_members_events();

-- proposals --------------------------------------------------------------------

create or replace function private.emit_proposals_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid;
  v_actor_type text;
begin
  select actor.actor_user_id, actor.actor_type
  into v_actor_id, v_actor_type
  from private.resolve_event_actor(new.organization_id, new.client_id) as actor;

  if new.status = 'sent' and old.status is distinct from 'sent' then
    perform private.emit_event(
      new.organization_id, v_actor_id, v_actor_type, 'proposal.sent', 'proposal', new.id,
      pg_catalog.jsonb_build_object('proposal_number', new.proposal_number),
      new.updated_at::text
    );
  elsif new.status = 'viewed' and old.status is distinct from 'viewed' then
    perform private.emit_event(
      new.organization_id, v_actor_id, v_actor_type, 'proposal.viewed', 'proposal', new.id,
      pg_catalog.jsonb_build_object('proposal_number', new.proposal_number),
      new.updated_at::text
    );
  elsif new.status = 'accepted' and old.status is distinct from 'accepted' then
    perform private.emit_event(
      new.organization_id, v_actor_id, v_actor_type, 'proposal.accepted', 'proposal', new.id,
      pg_catalog.jsonb_build_object('proposal_number', new.proposal_number),
      new.updated_at::text
    );
  elsif new.status = 'declined' and old.status is distinct from 'declined' then
    perform private.emit_event(
      new.organization_id, v_actor_id, v_actor_type, 'proposal.declined', 'proposal', new.id,
      pg_catalog.jsonb_build_object('proposal_number', new.proposal_number),
      new.updated_at::text
    );
  elsif new.status = 'changes_requested' and old.status is distinct from 'changes_requested' then
    perform private.emit_event(
      new.organization_id, v_actor_id, v_actor_type, 'proposal.changes_requested', 'proposal', new.id,
      pg_catalog.jsonb_build_object('proposal_number', new.proposal_number),
      new.updated_at::text
    );
  end if;

  return new;
end;
$function$;

revoke all on function private.emit_proposals_events() from public, anon, authenticated;

create trigger proposals_emit_events
after update of status on public.proposals
for each row
execute function private.emit_proposals_events();

-- invoices --------------------------------------------------------------------

create or replace function private.emit_invoices_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid;
  v_actor_type text;
begin
  select actor.actor_user_id, actor.actor_type
  into v_actor_id, v_actor_type
  from private.resolve_event_actor(new.organization_id, new.client_id) as actor;

  if new.status = 'sent' and old.status is distinct from 'sent' then
    perform private.emit_event(
      new.organization_id, v_actor_id, v_actor_type, 'invoice.sent', 'invoice', new.id,
      pg_catalog.jsonb_build_object(
        'invoice_number', new.invoice_number, 'currency', new.currency
      ),
      new.updated_at::text
    );
  elsif new.status = 'void' and old.status is distinct from 'void' then
    perform private.emit_event(
      new.organization_id, v_actor_id, v_actor_type, 'invoice.voided', 'invoice', new.id,
      pg_catalog.jsonb_build_object(
        'invoice_number', new.invoice_number, 'currency', new.currency
      ),
      new.updated_at::text
    );
  elsif new.status = 'overdue' and old.status is distinct from 'overdue' then
    perform private.emit_event(
      new.organization_id, v_actor_id, v_actor_type, 'invoice.marked_overdue', 'invoice', new.id,
      pg_catalog.jsonb_build_object(
        'invoice_number', new.invoice_number, 'currency', new.currency
      ),
      new.updated_at::text
    );
  end if;

  return new;
end;
$function$;

revoke all on function private.emit_invoices_events() from public, anon, authenticated;

create trigger invoices_emit_events
after update of status on public.invoices
for each row
execute function private.emit_invoices_events();

-- payments --------------------------------------------------------------------

create or replace function private.emit_payments_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid;
  v_actor_type text;
begin
  select actor.actor_user_id, actor.actor_type
  into v_actor_id, v_actor_type
  from private.resolve_event_actor(new.organization_id, new.client_id) as actor;

  if tg_op = 'INSERT' then
    if new.status = 'paid' then
      perform private.emit_event(
        new.organization_id, v_actor_id, v_actor_type, 'payment.recorded', 'payment', new.id,
        pg_catalog.jsonb_build_object(
          'amount', new.amount, 'currency', new.currency, 'invoice_id', new.invoice_id
        ),
        coalesce(new.updated_at, new.created_at)::text
      );
    end if;
    return new;
  end if;

  if new.status = 'paid' and old.status is distinct from 'paid' then
    perform private.emit_event(
      new.organization_id, v_actor_id, v_actor_type, 'payment.verified', 'payment', new.id,
      pg_catalog.jsonb_build_object(
        'amount', new.amount, 'currency', new.currency, 'invoice_id', new.invoice_id
      ),
      new.updated_at::text
    );
  elsif new.status = 'failed' and old.status is distinct from 'failed' then
    perform private.emit_event(
      new.organization_id, v_actor_id, v_actor_type, 'payment.failed', 'payment', new.id,
      pg_catalog.jsonb_build_object(
        'amount', new.amount, 'currency', new.currency, 'invoice_id', new.invoice_id
      ),
      new.updated_at::text
    );
  end if;

  return new;
end;
$function$;

revoke all on function private.emit_payments_events() from public, anon, authenticated;

create trigger payments_emit_events
after insert or update of status on public.payments
for each row
execute function private.emit_payments_events();

-- revisions --------------------------------------------------------------------

create or replace function private.emit_revisions_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid;
  v_actor_type text;
begin
  select actor.actor_user_id, actor.actor_type
  into v_actor_id, v_actor_type
  from private.resolve_event_actor(new.organization_id, new.client_id) as actor;

  if tg_op = 'INSERT' then
    perform private.emit_event(
      new.organization_id, v_actor_id, v_actor_type, 'revision.created', 'revision', new.id,
      pg_catalog.jsonb_build_object('status', new.status),
      coalesce(new.updated_at, new.created_at)::text
    );
    return new;
  end if;

  if old.status is distinct from new.status then
    perform private.emit_event(
      new.organization_id, v_actor_id, v_actor_type,
      case new.status
        when 'ready_for_review' then 'revision.ready_for_review'
        else 'revision.status_changed'
      end,
      'revision', new.id,
      pg_catalog.jsonb_build_object('old_status', old.status, 'new_status', new.status),
      new.updated_at::text
    );
  elsif old.assigned_to is distinct from new.assigned_to and new.assigned_to is not null then
    perform private.emit_event(
      new.organization_id, v_actor_id, v_actor_type, 'revision.assigned', 'revision', new.id,
      pg_catalog.jsonb_build_object('assigned_to', new.assigned_to),
      new.updated_at::text
    );
  end if;

  return new;
end;
$function$;

revoke all on function private.emit_revisions_events() from public, anon, authenticated;

create trigger revisions_emit_events
after insert or update of status, assigned_to on public.revisions
for each row
execute function private.emit_revisions_events();

-- support_tickets ----------------------------------------------------------

create or replace function private.emit_support_tickets_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid;
  v_actor_type text;
begin
  select actor.actor_user_id, actor.actor_type
  into v_actor_id, v_actor_type
  from private.resolve_event_actor(new.organization_id, new.client_id) as actor;

  if tg_op = 'INSERT' then
    perform private.emit_event(
      new.organization_id, v_actor_id, v_actor_type, 'ticket.created', 'support_ticket', new.id,
      pg_catalog.jsonb_build_object('ticket_number', new.ticket_number),
      coalesce(new.updated_at, new.created_at)::text
    );
    return new;
  end if;

  if old.status is distinct from new.status then
    if new.status in ('open', 'assigned') and old.status in ('resolved', 'closed') then
      perform private.emit_event(
        new.organization_id, v_actor_id, v_actor_type, 'ticket.reopened', 'support_ticket', new.id,
        pg_catalog.jsonb_build_object(
          'ticket_number', new.ticket_number, 'old_status', old.status, 'new_status', new.status
        ),
        new.updated_at::text
      );
    else
      perform private.emit_event(
        new.organization_id, v_actor_id, v_actor_type, 'ticket.status_changed', 'support_ticket', new.id,
        pg_catalog.jsonb_build_object(
          'ticket_number', new.ticket_number, 'old_status', old.status, 'new_status', new.status
        ),
        new.updated_at::text
      );
    end if;
  elsif old.assigned_to is distinct from new.assigned_to and new.assigned_to is not null then
    perform private.emit_event(
      new.organization_id, v_actor_id, v_actor_type, 'ticket.assigned', 'support_ticket', new.id,
      pg_catalog.jsonb_build_object('ticket_number', new.ticket_number, 'assigned_to', new.assigned_to),
      new.updated_at::text
    );
  end if;

  return new;
end;
$function$;

revoke all on function private.emit_support_tickets_events()
  from public, anon, authenticated;

create trigger support_tickets_emit_events
after insert or update of status, assigned_to on public.support_tickets
for each row
execute function private.emit_support_tickets_events();

-- subscriptions --------------------------------------------------------------

create or replace function private.emit_subscriptions_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid;
  v_actor_type text;
begin
  select actor.actor_user_id, actor.actor_type
  into v_actor_id, v_actor_type
  from private.resolve_event_actor(new.organization_id, new.client_id) as actor;

  if tg_op = 'INSERT' then
    perform private.emit_event(
      new.organization_id, v_actor_id, v_actor_type, 'subscription.created', 'subscription', new.id,
      pg_catalog.jsonb_build_object('plan_name', new.plan_name),
      coalesce(new.updated_at, new.created_at)::text
    );
    return new;
  end if;

  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    perform private.emit_event(
      new.organization_id, v_actor_id, v_actor_type, 'subscription.cancelled', 'subscription', new.id,
      pg_catalog.jsonb_build_object(
        'plan_name', new.plan_name, 'old_status', old.status, 'new_status', new.status
      ),
      new.updated_at::text
    );
  elsif old.status = 'cancelled' and new.status = 'active' then
    perform private.emit_event(
      new.organization_id, v_actor_id, v_actor_type, 'subscription.reactivated', 'subscription', new.id,
      pg_catalog.jsonb_build_object(
        'plan_name', new.plan_name, 'old_status', old.status, 'new_status', new.status
      ),
      new.updated_at::text
    );
  end if;

  return new;
end;
$function$;

revoke all on function private.emit_subscriptions_events()
  from public, anon, authenticated;

create trigger subscriptions_emit_events
after insert or update of status on public.subscriptions
for each row
execute function private.emit_subscriptions_events();

-- subscription_usage (audit only; not in SS8.7's table, added per
-- reconciliation note 3) ------------------------------------------------------

create or replace function private.emit_subscription_usage_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid;
  v_actor_type text;
  v_client_id uuid;
begin
  select subscription.client_id
  into v_client_id
  from public.subscriptions as subscription
  where subscription.id = new.subscription_id;

  select actor.actor_user_id, actor.actor_type
  into v_actor_id, v_actor_type
  from private.resolve_event_actor(new.organization_id, v_client_id) as actor;

  perform private.emit_event(
    new.organization_id, v_actor_id, v_actor_type, 'subscription.usage_recorded',
    'subscription_usage', new.id,
    pg_catalog.jsonb_build_object('subscription_id', new.subscription_id, 'hours_used', new.hours_used),
    new.created_at::text
  );

  return new;
end;
$function$;

revoke all on function private.emit_subscription_usage_events()
  from public, anon, authenticated;

create trigger subscription_usage_emit_events
after insert on public.subscription_usage
for each row
execute function private.emit_subscription_usage_events();

-- project_files (audit only; not in SS8.7's table, added per reconciliation
-- note 3) ----------------------------------------------------------------------

create or replace function private.emit_project_files_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid;
  v_actor_type text;
begin
  select actor.actor_user_id, actor.actor_type
  into v_actor_id, v_actor_type
  from private.resolve_event_actor(new.organization_id, new.client_id) as actor;

  perform private.emit_event(
    new.organization_id, v_actor_id, v_actor_type,
    case new.visibility when 'client' then 'file.uploaded_client' else 'file.uploaded_internal' end,
    'project_file', new.id,
    pg_catalog.jsonb_build_object('project_id', new.project_id, 'visibility', new.visibility),
    new.created_at::text
  );

  return new;
end;
$function$;

revoke all on function private.emit_project_files_events()
  from public, anon, authenticated;

create trigger project_files_emit_events
after insert on public.project_files
for each row
execute function private.emit_project_files_events();
