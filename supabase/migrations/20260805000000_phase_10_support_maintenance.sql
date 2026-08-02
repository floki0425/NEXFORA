-- Phase 10: support tickets and maintenance subscriptions.
-- Adds support_tickets, ticket_activities, subscriptions, and
-- subscription_usage, plus a race-safe official ticket-number counter.
-- AI, accounting integrations, automatic renewal billing, and Phase 11+
-- functionality remain out of scope. Does not modify any already-applied
-- migration.

-- ---------------------------------------------------------------------------
-- public.support_tickets
-- ---------------------------------------------------------------------------

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_id uuid not null,
  project_id uuid,
  ticket_number text not null,
  title text not null,
  description text not null,
  category text,
  priority text not null default 'medium',
  status text not null default 'open',
  assigned_to uuid,
  created_by uuid,
  -- Additional field beyond DATABASE.md's suggested schema: USER_FLOWS.md
  -- §53 requires "Add Resolution Note" as an explicit step of the
  -- resolution flow, and the note must survive a later reopen so the
  -- history of what was previously claimed fixed is never silently lost.
  resolution_note text,
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint support_tickets_organization_id_fkey
    foreign key (organization_id)
    references public.organizations (id)
    on delete cascade,
  constraint support_tickets_client_id_fkey
    foreign key (client_id)
    references public.clients (id)
    on delete cascade,
  constraint support_tickets_project_id_fkey
    foreign key (project_id)
    references public.projects (id)
    on delete set null,
  constraint support_tickets_assigned_to_fkey
    foreign key (assigned_to)
    references public.profiles (id)
    on delete set null,
  constraint support_tickets_created_by_fkey
    foreign key (created_by)
    references public.profiles (id)
    on delete set null,
  -- A linked project must genuinely belong to the same organization and
  -- client as the ticket. Reuses the tri-column uniqueness Phase 8 added on
  -- projects; project_id is nullable and Postgres does not enforce a
  -- composite foreign key containing a null, so this only binds once a
  -- project is actually linked.
  constraint support_tickets_project_org_client_fkey
    foreign key (project_id, organization_id, client_id)
    references public.projects (id, organization_id, client_id),
  constraint support_tickets_organization_number_key
    unique (organization_id, ticket_number),
  constraint support_tickets_ticket_number_format
    check (ticket_number ~ '^NXF-TKT-[0-9]{4}-[0-9]{4,}$'),
  constraint support_tickets_title_not_blank
    check (btrim(title) <> '' and char_length(title) <= 200),
  constraint support_tickets_description_not_blank
    check (btrim(description) <> '' and char_length(description) <= 5000),
  constraint support_tickets_category_length
    check (category is null or char_length(category) <= 60),
  constraint support_tickets_resolution_note_length
    check (resolution_note is null or char_length(resolution_note) <= 3000),
  constraint support_tickets_priority_check
    check (priority in ('low', 'medium', 'high', 'urgent')),
  constraint support_tickets_status_check
    check (
      status in (
        'open',
        'assigned',
        'in_progress',
        'waiting_for_client',
        'resolved',
        'closed'
      )
    ),
  -- resolved_at/closed_at are set by the transition functions below and
  -- must agree with the status they represent. 'closed' is only reachable
  -- from 'resolved', so a closed ticket always retains its resolved_at.
  constraint support_tickets_resolved_at_check
    check ((status in ('resolved', 'closed')) = (resolved_at is not null)),
  constraint support_tickets_closed_at_check
    check ((status = 'closed') = (closed_at is not null))
);

create index support_tickets_organization_updated_idx
  on public.support_tickets (organization_id, updated_at desc);

create index support_tickets_organization_status_idx
  on public.support_tickets (organization_id, status);

create index support_tickets_organization_priority_idx
  on public.support_tickets (organization_id, priority);

create index support_tickets_client_idx
  on public.support_tickets (client_id);

create index support_tickets_project_idx
  on public.support_tickets (project_id);

create index support_tickets_assigned_idx
  on public.support_tickets (assigned_to);

create trigger support_tickets_set_updated_at
before update on public.support_tickets
for each row
execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- public.ticket_activities
--
-- Additional table beyond the three named in this phase's database scope,
-- added for the same traceability reason revision_activities was added in
-- Phase 8: AGENTS.md §38.5 requires support status changes to be
-- traceable, and USER_FLOWS.md §53 allows a resolved ticket to be reopened
-- — so a single support_tickets row cannot hold the full history of who
-- changed what, when, and why. Mirrors revision_activities' exact shape
-- and conventions rather than inventing a second activity model.
-- ---------------------------------------------------------------------------

create table public.ticket_activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  ticket_id uuid not null,
  activity_type text not null,
  title text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),

  constraint ticket_activities_organization_id_fkey
    foreign key (organization_id)
    references public.organizations (id)
    on delete cascade,
  constraint ticket_activities_ticket_id_fkey
    foreign key (ticket_id)
    references public.support_tickets (id)
    on delete cascade,
  constraint ticket_activities_created_by_fkey
    foreign key (created_by)
    references public.profiles (id)
    on delete set null,
  constraint ticket_activities_type_check
    check (
      activity_type in (
        'created',
        'status_changed',
        'assigned',
        'resolved',
        'reopened',
        'closed'
      )
    ),
  constraint ticket_activities_title_not_blank
    check (btrim(title) <> '' and char_length(title) <= 200),
  constraint ticket_activities_description_length
    check (description is null or char_length(description) <= 3000),
  constraint ticket_activities_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create index ticket_activities_ticket_created_idx
  on public.ticket_activities (ticket_id, created_at desc);

create index ticket_activities_organization_idx
  on public.ticket_activities (organization_id);

-- ---------------------------------------------------------------------------
-- public.subscriptions
-- ---------------------------------------------------------------------------

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_id uuid not null,
  project_id uuid,
  plan_name text not null,
  status text not null default 'active',
  billing_cycle text not null,
  -- Money uses numeric(14,2) exactly like invoices/proposals — never
  -- floating point (AGENTS.md §11, DATABASE.md §45).
  amount numeric(14, 2) not null default 0,
  currency text not null default 'PHP',
  included_hours numeric(8, 2),
  -- Additional field: internal-only plan notes, never exposed through the
  -- client-facing read functions below (mirrors invoices.notes).
  notes text,
  started_at timestamptz,
  renewal_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint subscriptions_organization_id_fkey
    foreign key (organization_id)
    references public.organizations (id)
    on delete cascade,
  constraint subscriptions_client_id_fkey
    foreign key (client_id)
    references public.clients (id)
    on delete cascade,
  constraint subscriptions_project_id_fkey
    foreign key (project_id)
    references public.projects (id)
    on delete set null,
  constraint subscriptions_created_by_fkey
    foreign key (created_by)
    references public.profiles (id)
    on delete set null,
  constraint subscriptions_project_org_client_fkey
    foreign key (project_id, organization_id, client_id)
    references public.projects (id, organization_id, client_id),
  -- Lets subscription_usage reference (subscription_id, organization_id)
  -- together so Postgres itself guarantees a usage row can never be
  -- attributed to a subscription in another organization.
  constraint subscriptions_id_organization_id_key
    unique (id, organization_id),
  constraint subscriptions_plan_name_not_blank
    check (btrim(plan_name) <> '' and char_length(plan_name) <= 160),
  constraint subscriptions_status_check
    check (
      status in ('trial', 'active', 'past_due', 'paused', 'cancelled', 'expired')
    ),
  constraint subscriptions_billing_cycle_check
    check (billing_cycle in ('monthly', 'quarterly', 'yearly', 'custom')),
  constraint subscriptions_amount_check
    check (amount >= 0),
  constraint subscriptions_currency_not_blank
    check (btrim(currency) <> ''),
  constraint subscriptions_included_hours_check
    check (included_hours is null or included_hours >= 0),
  constraint subscriptions_notes_length
    check (notes is null or char_length(notes) <= 5000),
  constraint subscriptions_cancelled_at_check
    check ((status = 'cancelled') = (cancelled_at is not null))
);

create index subscriptions_organization_updated_idx
  on public.subscriptions (organization_id, updated_at desc);

create index subscriptions_organization_status_idx
  on public.subscriptions (organization_id, status);

create index subscriptions_client_idx
  on public.subscriptions (client_id);

create index subscriptions_project_idx
  on public.subscriptions (project_id);

create index subscriptions_organization_renewal_idx
  on public.subscriptions (organization_id, renewal_at)
  where status in ('trial', 'active', 'past_due');

create trigger subscriptions_set_updated_at
before update on public.subscriptions
for each row
execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- public.subscription_usage
--
-- USER_FLOWS.md §55 is explicit: "Do not deduct hours invisibly." Usage is
-- therefore an append-only ledger of individually described entries, and
-- the remaining allowance is always derived from the sum of those entries
-- rather than a mutable running total that could drift.
-- ---------------------------------------------------------------------------

create table public.subscription_usage (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  subscription_id uuid not null,
  description text not null,
  hours_used numeric(8, 2) not null,
  usage_date date not null,
  recorded_by uuid,
  created_at timestamptz not null default now(),

  constraint subscription_usage_organization_id_fkey
    foreign key (organization_id)
    references public.organizations (id)
    on delete cascade,
  constraint subscription_usage_subscription_id_fkey
    foreign key (subscription_id)
    references public.subscriptions (id)
    on delete cascade,
  constraint subscription_usage_subscription_org_fkey
    foreign key (subscription_id, organization_id)
    references public.subscriptions (id, organization_id),
  constraint subscription_usage_recorded_by_fkey
    foreign key (recorded_by)
    references public.profiles (id)
    on delete set null,
  constraint subscription_usage_description_not_blank
    check (btrim(description) <> '' and char_length(description) <= 2000),
  constraint subscription_usage_hours_used_check
    check (hours_used > 0 and hours_used <= 1000)
);

create index subscription_usage_subscription_date_idx
  on public.subscription_usage (subscription_id, usage_date desc);

create index subscription_usage_organization_idx
  on public.subscription_usage (organization_id);

-- ---------------------------------------------------------------------------
-- private.ticket_number_counters
--
-- Mirrors private.invoice_number_counters / proposal_number_counters
-- exactly. Kept independent from both — an organization's ticket, invoice,
-- and proposal sequences never share counters.
-- ---------------------------------------------------------------------------

create table private.ticket_number_counters (
  organization_id uuid not null,
  number_year integer not null,
  last_value integer not null default 1,

  constraint ticket_number_counters_pkey
    primary key (organization_id, number_year),
  constraint ticket_number_counters_organization_id_fkey
    foreign key (organization_id)
    references public.organizations (id)
    on delete cascade,
  constraint ticket_number_counters_last_value_check
    check (last_value > 0)
);

revoke all on table private.ticket_number_counters
  from public, anon, authenticated;

create or replace function private.next_ticket_number(
  target_organization_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_year integer := extract(year from pg_catalog.now())::integer;
  assigned_value integer;
begin
  insert into private.ticket_number_counters (
    organization_id,
    number_year,
    last_value
  )
  values (target_organization_id, current_year, 1)
  on conflict (organization_id, number_year)
  do update set last_value = private.ticket_number_counters.last_value + 1
  returning last_value into assigned_value;

  return 'NXF-TKT-' || current_year || '-'
    || lpad(assigned_value::text, 4, '0');
end;
$function$;

revoke all on function private.next_ticket_number(uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ticket activity triggers: creation and assignment are simple row-level
-- facts and are recorded automatically. Status changes are recorded
-- explicitly inside their own RPC functions instead, because resolution
-- and reopen both carry a required human-written note that lives in no
-- column on support_tickets — the same split Phase 8 used for revisions.
-- ---------------------------------------------------------------------------

create or replace function private.record_ticket_created_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.ticket_activities (
    organization_id, ticket_id, activity_type, title, created_by
  )
  values (
    new.organization_id, new.id, 'created', 'Ticket submitted', new.created_by
  );

  return new;
end;
$function$;

revoke all on function private.record_ticket_created_activity()
  from public, anon, authenticated;

create trigger support_tickets_record_created_activity
after insert on public.support_tickets
for each row
execute function private.record_ticket_created_activity();

create or replace function private.record_ticket_assignment_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.ticket_activities (
    organization_id, ticket_id, activity_type, title, metadata, created_by
  )
  values (
    new.organization_id,
    new.id,
    'assigned',
    case
      when new.assigned_to is null then 'Assignment removed'
      else 'Ticket assigned'
    end,
    pg_catalog.jsonb_build_object(
      'from_assignee', old.assigned_to,
      'to_assignee', new.assigned_to
    ),
    (select private.current_profile_id())
  );

  return new;
end;
$function$;

revoke all on function private.record_ticket_assignment_activity()
  from public, anon, authenticated;

create trigger support_tickets_record_assignment_activity
after update of assigned_to on public.support_tickets
for each row
when (old.assigned_to is distinct from new.assigned_to)
execute function private.record_ticket_assignment_activity();

-- ---------------------------------------------------------------------------
-- public.create_client_support_ticket: the only way a portal user opens a
-- ticket. organization_id, client_id, ticket_number, and created_by are all
-- server-resolved — never accepted from the browser. Only 'owner'/'manager'
-- may submit; 'viewer' stays read-only, matching the Phase 8 portal
-- write-permission decision.
-- ---------------------------------------------------------------------------

create or replace function public.create_client_support_ticket(
  p_title text,
  p_description text,
  p_priority text,
  p_category text,
  target_project_id uuid default null
)
returns table (id uuid, ticket_number text, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  resolved_client_id uuid := private.active_client_id();
  resolved_role text := private.active_client_role();
  actor_profile_id uuid := private.current_profile_id();
  resolved_organization_id uuid;
  normalized_title text := btrim(coalesce(p_title, ''));
  normalized_description text := btrim(coalesce(p_description, ''));
  assigned_number text;
  new_ticket_id uuid;
  new_created_at timestamptz;
begin
  if resolved_client_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'An active client membership is required.';
  end if;

  if resolved_role not in ('owner', 'manager') then
    raise exception using
      errcode = 'P0001',
      message = 'You do not have permission to open support tickets.';
  end if;

  if normalized_title = '' or char_length(normalized_title) > 200 then
    raise exception using
      errcode = 'P0001',
      message = 'A title is required.';
  end if;

  if normalized_description = ''
    or char_length(normalized_description) > 5000
  then
    raise exception using
      errcode = 'P0001',
      message = 'A description is required.';
  end if;

  if p_priority not in ('low', 'medium', 'high', 'urgent') then
    raise exception using
      errcode = 'P0001',
      message = 'Choose a valid priority.';
  end if;

  select client.organization_id
  into resolved_organization_id
  from public.clients as client
  where client.id = resolved_client_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'This client could not be found.';
  end if;

  -- An optional linked project must belong to this same client. Checked
  -- explicitly (rather than relying only on the composite foreign key) so
  -- the caller gets a clear, safe message instead of a raw constraint
  -- violation.
  if target_project_id is not null and not exists (
    select 1
    from public.projects as project
    where project.id = target_project_id
      and project.client_id = resolved_client_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'This project could not be found.';
  end if;

  assigned_number := private.next_ticket_number(resolved_organization_id);

  insert into public.support_tickets (
    organization_id,
    client_id,
    project_id,
    ticket_number,
    title,
    description,
    category,
    priority,
    status,
    created_by
  )
  values (
    resolved_organization_id,
    resolved_client_id,
    target_project_id,
    assigned_number,
    normalized_title,
    normalized_description,
    nullif(btrim(coalesce(p_category, '')), ''),
    p_priority,
    'open',
    actor_profile_id
  )
  returning support_tickets.id, support_tickets.created_at
  into new_ticket_id, new_created_at;

  return query select new_ticket_id, assigned_number, new_created_at;
end;
$function$;

revoke all on function public.create_client_support_ticket(
  text, text, text, text, uuid
) from public, anon, authenticated;

grant execute on function public.create_client_support_ticket(
  text, text, text, text, uuid
) to authenticated;

-- ---------------------------------------------------------------------------
-- public.transition_ticket_status: the internal-driven part of the support
-- workflow. Only the documented edges are permitted:
--
--   open               -> assigned, in_progress
--   assigned           -> in_progress, waiting_for_client
--   in_progress        -> waiting_for_client, resolved
--   waiting_for_client -> in_progress
--   resolved           -> in_progress   (internal reopen)
--
-- resolved -> closed and resolved -> in_progress from the *client* side are
-- deliberately excluded here; they belong to the two client-only functions
-- below, mirroring how Phase 8 split approve/request-changes out of
-- transition_revision_status.
-- ---------------------------------------------------------------------------

create or replace function public.transition_ticket_status(
  target_ticket_id uuid,
  p_new_status text,
  p_resolution_note text default null
)
returns table (status text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_organization_id uuid;
  actor_profile_id uuid;
  actor_role text;
  active_membership_count integer;
  target_ticket public.support_tickets%rowtype;
  is_allowed_transition boolean;
  normalized_note text := nullif(btrim(coalesce(p_resolution_note, '')), '');
begin
  if (select auth.uid()) is null then
    raise exception using
      errcode = 'P0001',
      message = 'Authentication is required.';
  end if;

  if p_new_status not in (
    'assigned', 'in_progress', 'waiting_for_client', 'resolved'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'This status cannot be set directly.';
  end if;

  select
    min(membership.organization_id::text)::uuid,
    min(membership.user_id::text)::uuid,
    min(membership.role),
    count(*)::integer
  into
    actor_organization_id, actor_profile_id, actor_role,
    active_membership_count
  from public.organization_members as membership
  inner join public.profiles as profile
    on profile.id = membership.user_id
  inner join public.organizations as organization
    on organization.id = membership.organization_id
  where profile.auth_user_id = (select auth.uid())
    and membership.status = 'active'
    and organization.status = 'active';

  if active_membership_count <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'You do not have permission to update this ticket.';
  end if;

  select ticket.*
  into target_ticket
  from public.support_tickets as ticket
  where ticket.id = target_ticket_id
    and ticket.organization_id = actor_organization_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'This ticket could not be found.';
  end if;

  -- team_member may only act on a ticket assigned to them; every other
  -- internal role may act on any ticket in their organization.
  if actor_role = 'team_member'
    and target_ticket.assigned_to is distinct from actor_profile_id
  then
    raise exception using
      errcode = 'P0001',
      message = 'You do not have permission to update this ticket.';
  end if;

  is_allowed_transition := (
    (target_ticket.status = 'open' and p_new_status in ('assigned', 'in_progress'))
    or (
      target_ticket.status = 'assigned'
      and p_new_status in ('in_progress', 'waiting_for_client')
    )
    or (
      target_ticket.status = 'in_progress'
      and p_new_status in ('waiting_for_client', 'resolved')
    )
    or (target_ticket.status = 'waiting_for_client' and p_new_status = 'in_progress')
    or (target_ticket.status = 'resolved' and p_new_status = 'in_progress')
  );

  if not is_allowed_transition then
    raise exception using
      errcode = 'P0001',
      message = 'That status change is not allowed from the current status.';
  end if;

  if p_new_status = 'resolved' and normalized_note is null then
    raise exception using
      errcode = 'P0001',
      message = 'A resolution note is required when resolving a ticket.';
  end if;

  -- 'assigned' must describe reality: a ticket cannot be in the assigned
  -- state with no assignee. Assignment itself happens through the
  -- separately-granted update (assigned_to) column policy.
  if p_new_status = 'assigned' and target_ticket.assigned_to is null then
    raise exception using
      errcode = 'P0001',
      message = 'Assign this ticket to a team member before marking it assigned.';
  end if;

  update public.support_tickets
  set
    status = p_new_status,
    resolution_note = case
      when p_new_status = 'resolved' then normalized_note
      else resolution_note
    end,
    resolved_at = case
      when p_new_status = 'resolved' then pg_catalog.now()
      -- Reopening clears resolved_at so the resolved_at/status check
      -- constraint stays satisfied; the note itself is deliberately kept
      -- for history.
      else null
    end
  where id = target_ticket_id;

  insert into public.ticket_activities (
    organization_id, ticket_id, activity_type, title, description, metadata,
    created_by
  )
  values (
    actor_organization_id,
    target_ticket_id,
    case when p_new_status = 'resolved' then 'resolved' else 'status_changed' end,
    case
      when p_new_status = 'resolved' then 'Ticket resolved'
      else 'Status changed to ' || replace(p_new_status, '_', ' ')
    end,
    case when p_new_status = 'resolved' then normalized_note else null end,
    pg_catalog.jsonb_build_object(
      'from_status', target_ticket.status,
      'to_status', p_new_status
    ),
    actor_profile_id
  );

  return query select p_new_status;
end;
$function$;

revoke all on function public.transition_ticket_status(uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.transition_ticket_status(uuid, text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- public.close_ticket_by_client: client confirms a resolved ticket.
-- Idempotent — an already-closed ticket returns success with
-- already_closed = true rather than erroring or duplicating activity,
-- matching approve_revision's exact shape.
-- ---------------------------------------------------------------------------

create or replace function public.close_ticket_by_client(
  target_ticket_id uuid
)
returns table (status text, already_closed boolean)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  resolved_client_id uuid := private.active_client_id();
  resolved_role text := private.active_client_role();
  actor_profile_id uuid := private.current_profile_id();
  target_ticket public.support_tickets%rowtype;
begin
  if resolved_client_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'An active client membership is required.';
  end if;

  if resolved_role not in ('owner', 'manager') then
    raise exception using
      errcode = 'P0001',
      message = 'You do not have permission to update this ticket.';
  end if;

  select ticket.*
  into target_ticket
  from public.support_tickets as ticket
  where ticket.id = target_ticket_id
    and ticket.client_id = resolved_client_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'This ticket could not be found.';
  end if;

  if target_ticket.status = 'closed' then
    return query select 'closed'::text, true;
    return;
  end if;

  if target_ticket.status <> 'resolved' then
    raise exception using
      errcode = 'P0001',
      message = 'Only a resolved ticket can be confirmed and closed.';
  end if;

  update public.support_tickets
  set status = 'closed', closed_at = pg_catalog.now()
  where id = target_ticket_id;

  insert into public.ticket_activities (
    organization_id, ticket_id, activity_type, title, metadata, created_by
  )
  values (
    target_ticket.organization_id,
    target_ticket_id,
    'closed',
    'Client confirmed the resolution',
    pg_catalog.jsonb_build_object('from_status', 'resolved', 'to_status', 'closed'),
    actor_profile_id
  );

  return query select 'closed'::text, false;
end;
$function$;

revoke all on function public.close_ticket_by_client(uuid)
  from public, anon, authenticated;

grant execute on function public.close_ticket_by_client(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- public.reopen_ticket_by_client: "issue persists" branch of USER_FLOWS.md
-- §53. Requires a non-empty comment explaining what is still wrong, stored
-- only in ticket_activities.description so an earlier resolution note is
-- never overwritten — both remain in history.
-- ---------------------------------------------------------------------------

create or replace function public.reopen_ticket_by_client(
  target_ticket_id uuid,
  p_comment text
)
returns table (status text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  resolved_client_id uuid := private.active_client_id();
  resolved_role text := private.active_client_role();
  actor_profile_id uuid := private.current_profile_id();
  target_ticket public.support_tickets%rowtype;
  normalized_comment text := btrim(coalesce(p_comment, ''));
begin
  if resolved_client_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'An active client membership is required.';
  end if;

  if resolved_role not in ('owner', 'manager') then
    raise exception using
      errcode = 'P0001',
      message = 'You do not have permission to update this ticket.';
  end if;

  if normalized_comment = '' or char_length(normalized_comment) > 3000 then
    raise exception using
      errcode = 'P0001',
      message = 'Please describe what is still not working.';
  end if;

  select ticket.*
  into target_ticket
  from public.support_tickets as ticket
  where ticket.id = target_ticket_id
    and ticket.client_id = resolved_client_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'This ticket could not be found.';
  end if;

  if target_ticket.status <> 'resolved' then
    raise exception using
      errcode = 'P0001',
      message = 'Only a resolved ticket can be reopened.';
  end if;

  update public.support_tickets
  set status = 'in_progress', resolved_at = null
  where id = target_ticket_id;

  insert into public.ticket_activities (
    organization_id, ticket_id, activity_type, title, description, metadata,
    created_by
  )
  values (
    target_ticket.organization_id,
    target_ticket_id,
    'reopened',
    'Client reported the issue persists',
    normalized_comment,
    pg_catalog.jsonb_build_object(
      'from_status', 'resolved', 'to_status', 'in_progress'
    ),
    actor_profile_id
  );

  return query select 'in_progress'::text;
end;
$function$;

revoke all on function public.reopen_ticket_by_client(uuid, text)
  from public, anon, authenticated;

grant execute on function public.reopen_ticket_by_client(uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Client-facing read paths. Same design as Phase 7/8/9: no client-facing
-- RLS policy on the base tables, because table-level SELECT cannot be
-- column-limited per role — internal-only fields (organization_id,
-- assigned_to, notes, created_by) are kept out of reach by never being
-- selected here.
-- ---------------------------------------------------------------------------

create or replace function public.get_client_support_tickets()
returns table (
  id uuid,
  ticket_number text,
  title text,
  description text,
  category text,
  priority text,
  status text,
  project_id uuid,
  resolution_note text,
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    ticket.id, ticket.ticket_number, ticket.title, ticket.description,
    ticket.category, ticket.priority, ticket.status, ticket.project_id,
    ticket.resolution_note, ticket.resolved_at, ticket.closed_at,
    ticket.created_at, ticket.updated_at
  from public.support_tickets as ticket
  where ticket.client_id = (select private.active_client_id())
  order by ticket.created_at desc
  limit 100;
$function$;

revoke all on function public.get_client_support_tickets()
  from public, anon, authenticated;

grant execute on function public.get_client_support_tickets() to authenticated;

create or replace function public.get_client_ticket_activities(
  target_ticket_id uuid
)
returns table (
  activity_type text,
  title text,
  description text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select activity.activity_type, activity.title, activity.description,
    activity.created_at
  from public.ticket_activities as activity
  inner join public.support_tickets as ticket
    on ticket.id = activity.ticket_id
  where activity.ticket_id = target_ticket_id
    and ticket.client_id = (select private.active_client_id())
  order by activity.created_at asc
  limit 200;
$function$;

revoke all on function public.get_client_ticket_activities(uuid)
  from public, anon, authenticated;

grant execute on function public.get_client_ticket_activities(uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- public.get_client_subscriptions: the portal's maintenance-plan view.
-- included_hours/used_hours/remaining_hours are all returned explicitly so
-- the portal can show the full picture — USER_FLOWS.md §55's "Do not deduct
-- hours invisibly" requirement. used_hours is summed live from the
-- append-only usage ledger, never read from a cached column.
-- ---------------------------------------------------------------------------

create or replace function public.get_client_subscriptions()
returns table (
  id uuid,
  plan_name text,
  status text,
  billing_cycle text,
  amount numeric,
  currency text,
  included_hours numeric,
  used_hours numeric,
  remaining_hours numeric,
  project_id uuid,
  started_at timestamptz,
  renewal_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    subscription.id,
    subscription.plan_name,
    subscription.status,
    subscription.billing_cycle,
    subscription.amount,
    subscription.currency,
    subscription.included_hours,
    coalesce(usage.total_hours, 0) as used_hours,
    case
      when subscription.included_hours is null then null
      else subscription.included_hours - coalesce(usage.total_hours, 0)
    end as remaining_hours,
    subscription.project_id,
    subscription.started_at,
    subscription.renewal_at,
    subscription.cancelled_at,
    subscription.created_at
  from public.subscriptions as subscription
  left join (
    select entry.subscription_id, sum(entry.hours_used) as total_hours
    from public.subscription_usage as entry
    group by entry.subscription_id
  ) as usage on usage.subscription_id = subscription.id
  where subscription.client_id = (select private.active_client_id())
  order by subscription.created_at desc
  limit 50;
$function$;

revoke all on function public.get_client_subscriptions()
  from public, anon, authenticated;

grant execute on function public.get_client_subscriptions() to authenticated;

create or replace function public.get_client_subscription_usage(
  target_subscription_id uuid
)
returns table (
  id uuid,
  description text,
  hours_used numeric,
  usage_date date,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select entry.id, entry.description, entry.hours_used, entry.usage_date,
    entry.created_at
  from public.subscription_usage as entry
  inner join public.subscriptions as subscription
    on subscription.id = entry.subscription_id
  where entry.subscription_id = target_subscription_id
    and subscription.client_id = (select private.active_client_id())
  order by entry.usage_date desc, entry.created_at desc
  limit 200;
$function$;

revoke all on function public.get_client_subscription_usage(uuid)
  from public, anon, authenticated;

grant execute on function public.get_client_subscription_usage(uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.support_tickets enable row level security;
alter table public.ticket_activities enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_usage enable row level security;

-- support_tickets: internal members of the owning organization may read
-- every ticket. Only `assigned_to` is ever directly updatable by the
-- authenticated role — status changes always go through the RPC functions
-- above, which is what makes "the browser cannot set an arbitrary ticket
-- status" true. Portal users get no policy here at all; their reads go
-- through get_client_support_tickets().
create policy support_tickets_select_internal_members
on public.support_tickets
for select
to authenticated
using (
  (select private.is_internal_member(support_tickets.organization_id))
);

create policy support_tickets_update_assignment
on public.support_tickets
for update
to authenticated
using (
  (
    select private.has_internal_role(
      support_tickets.organization_id,
      array['super_admin', 'admin', 'project_manager']
    )
  )
)
with check (
  (
    select private.has_internal_role(
      support_tickets.organization_id,
      array['super_admin', 'admin', 'project_manager']
    )
  )
  and (
    support_tickets.assigned_to is null
    or exists (
      select 1
      from public.organization_members as assignee_membership
      where assignee_membership.organization_id = support_tickets.organization_id
        and assignee_membership.user_id = support_tickets.assigned_to
        and assignee_membership.status = 'active'
    )
  )
);

create policy ticket_activities_select_internal_members
on public.ticket_activities
for select
to authenticated
using (
  (select private.is_internal_member(ticket_activities.organization_id))
);

create policy subscriptions_select_internal_members
on public.subscriptions
for select
to authenticated
using (
  (select private.is_internal_member(subscriptions.organization_id))
);

create policy subscriptions_insert_managers
on public.subscriptions
for insert
to authenticated
with check (
  (
    select private.has_internal_role(
      subscriptions.organization_id,
      array['super_admin', 'admin']
    )
  )
  and created_by = (select private.current_profile_id())
  and exists (
    select 1
    from public.clients as client
    where client.id = subscriptions.client_id
      and client.organization_id = subscriptions.organization_id
  )
  and (
    subscriptions.project_id is null
    or exists (
      select 1
      from public.projects as project
      where project.id = subscriptions.project_id
        and project.organization_id = subscriptions.organization_id
        and project.client_id = subscriptions.client_id
    )
  )
);

create policy subscriptions_update_managers
on public.subscriptions
for update
to authenticated
using (
  (
    select private.has_internal_role(
      subscriptions.organization_id,
      array['super_admin', 'admin']
    )
  )
)
with check (
  (
    select private.has_internal_role(
      subscriptions.organization_id,
      array['super_admin', 'admin']
    )
  )
);

create policy subscription_usage_select_internal_members
on public.subscription_usage
for select
to authenticated
using (
  (select private.is_internal_member(subscription_usage.organization_id))
);

create policy subscription_usage_insert_managers
on public.subscription_usage
for insert
to authenticated
with check (
  (
    select private.has_internal_role(
      subscription_usage.organization_id,
      array['super_admin', 'admin', 'project_manager']
    )
  )
  and recorded_by = (select private.current_profile_id())
  and exists (
    select 1
    from public.subscriptions as subscription
    where subscription.id = subscription_usage.subscription_id
      and subscription.organization_id = subscription_usage.organization_id
  )
);

-- subscription_usage is an append-only ledger: no UPDATE or DELETE policy
-- exists for `authenticated` at all, so a recorded entry can never be
-- silently edited or removed to make used hours look smaller.

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all privileges
  on table
    public.support_tickets,
    public.ticket_activities,
    public.subscriptions,
    public.subscription_usage
  from public, anon, authenticated;

grant select on table public.support_tickets to authenticated;
grant update (assigned_to) on public.support_tickets to authenticated;

grant select on table public.ticket_activities to authenticated;

grant select on table public.subscriptions to authenticated;
grant insert (
  organization_id,
  client_id,
  project_id,
  plan_name,
  status,
  billing_cycle,
  amount,
  currency,
  included_hours,
  notes,
  started_at,
  renewal_at,
  created_by
) on public.subscriptions to authenticated;
grant update (
  plan_name,
  status,
  billing_cycle,
  amount,
  currency,
  included_hours,
  notes,
  started_at,
  renewal_at,
  cancelled_at
) on public.subscriptions to authenticated;

grant select on table public.subscription_usage to authenticated;
grant insert (
  organization_id,
  subscription_id,
  description,
  hours_used,
  usage_date,
  recorded_by
) on public.subscription_usage to authenticated;

grant all privileges
  on table
    public.support_tickets,
    public.ticket_activities,
    public.subscriptions,
    public.subscription_usage
  to service_role;
