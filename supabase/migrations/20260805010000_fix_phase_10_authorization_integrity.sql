-- Phase 10 follow-up: close authorization and tenant-integrity gaps found
-- after the original support/maintenance migration was applied manually.
-- This migration is additive except for replacing the affected policies,
-- transition function, and bounded client activity read. It does not add
-- deferred Phase 11+ functionality.

-- ---------------------------------------------------------------------------
-- Preflight existing rows before adding stronger constraints. Never guess how
-- to repair business data inside a schema migration.
-- ---------------------------------------------------------------------------

do $preflight$
begin
  if exists (
    select 1
    from public.support_tickets as ticket
    inner join public.clients as client on client.id = ticket.client_id
    where ticket.organization_id <> client.organization_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'Phase 10 repair aborted: a support ticket belongs to a different organization than its client.';
  end if;

  if exists (
    select 1
    from public.subscriptions as subscription
    inner join public.clients as client on client.id = subscription.client_id
    where subscription.organization_id <> client.organization_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'Phase 10 repair aborted: a subscription belongs to a different organization than its client.';
  end if;

  if exists (
    select 1
    from public.ticket_activities as activity
    inner join public.support_tickets as ticket on ticket.id = activity.ticket_id
    where activity.organization_id <> ticket.organization_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'Phase 10 repair aborted: a ticket activity belongs to a different organization than its ticket.';
  end if;

  if exists (
    select 1
    from public.support_tickets as ticket
    where ticket.status = 'assigned'
      and ticket.assigned_to is null
  ) then
    raise exception using
      errcode = '23514',
      message = 'Phase 10 repair aborted: an assigned support ticket has no assignee.';
  end if;

  if exists (
    select 1
    from public.subscriptions as subscription
    where subscription.currency !~ '^[A-Z]{3}$'
  ) then
    raise exception using
      errcode = '23514',
      message = 'Phase 10 repair aborted: a subscription currency is not a three-letter uppercase code.';
  end if;
end;
$preflight$;

-- A client and organization must agree even when no project is linked.
alter table public.support_tickets
  add constraint support_tickets_client_organization_fkey
  foreign key (client_id, organization_id)
  references public.clients (id, organization_id);

alter table public.subscriptions
  add constraint subscriptions_client_organization_fkey
  foreign key (client_id, organization_id)
  references public.clients (id, organization_id);

-- Activity organization scope is now guaranteed by the database rather than
-- only by the trigger/RPC paths that currently create activities.
alter table public.support_tickets
  add constraint support_tickets_id_organization_id_key
  unique (id, organization_id);

alter table public.ticket_activities
  add constraint ticket_activities_ticket_organization_fkey
  foreign key (ticket_id, organization_id)
  references public.support_tickets (id, organization_id)
  on delete cascade;

-- The assigned state must continue to describe reality after later direct
-- assignment updates, not only at the instant the transition RPC runs.
alter table public.support_tickets
  add constraint support_tickets_assigned_to_required
  check (status <> 'assigned' or assigned_to is not null);

-- Currency is rendered through Intl.NumberFormat. Enforce the same safe shape
-- for direct authenticated table writes that the application schema requires.
alter table public.subscriptions
  add constraint subscriptions_currency_format
  check (currency ~ '^[A-Z]{3}$');

-- ---------------------------------------------------------------------------
-- Internal ticket creation. The caller supplies business input only; tenant,
-- official number, actor, initial status, and activity history stay trusted.
-- The optional argument is last because PostgreSQL requires all parameters
-- following a defaulted parameter to have defaults too.
-- ---------------------------------------------------------------------------

create or replace function public.create_internal_support_ticket(
  target_client_id uuid,
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
  actor_profile_id uuid := private.current_profile_id();
  resolved_organization_id uuid;
  normalized_title text := btrim(coalesce(p_title, ''));
  normalized_description text := btrim(coalesce(p_description, ''));
  normalized_category text := nullif(btrim(coalesce(p_category, '')), '');
  assigned_number text;
  new_ticket_id uuid;
  new_created_at timestamptz;
begin
  if (select auth.uid()) is null or actor_profile_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'Authentication is required.';
  end if;

  select client.organization_id
  into resolved_organization_id
  from public.clients as client
  where client.id = target_client_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'This client could not be found.';
  end if;

  if not (
    select private.has_internal_role(
      resolved_organization_id,
      array['super_admin', 'admin']
    )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'You do not have permission to open support tickets for this client.';
  end if;

  if normalized_title = '' or char_length(normalized_title) > 200 then
    raise exception using
      errcode = 'P0001',
      message = 'A title is required and must be 200 characters or fewer.';
  end if;

  if normalized_description = ''
    or char_length(normalized_description) > 5000
  then
    raise exception using
      errcode = 'P0001',
      message = 'A description is required and must be 5000 characters or fewer.';
  end if;

  if p_priority is null
    or p_priority not in ('low', 'medium', 'high', 'urgent')
  then
    raise exception using
      errcode = 'P0001',
      message = 'Choose a valid priority.';
  end if;

  if normalized_category is not null
    and char_length(normalized_category) > 60
  then
    raise exception using
      errcode = 'P0001',
      message = 'The category must be 60 characters or fewer.';
  end if;

  if target_project_id is not null and not exists (
    select 1
    from public.projects as project
    where project.id = target_project_id
      and project.organization_id = resolved_organization_id
      and project.client_id = target_client_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'This project could not be found for the selected client.';
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
    target_client_id,
    target_project_id,
    assigned_number,
    normalized_title,
    normalized_description,
    normalized_category,
    p_priority,
    'open',
    actor_profile_id
  )
  returning support_tickets.id, support_tickets.created_at
  into new_ticket_id, new_created_at;

  return query select new_ticket_id, assigned_number, new_created_at;
end;
$function$;

revoke all on function public.create_internal_support_ticket(
  uuid, text, text, text, text, uuid
) from public, anon, authenticated;

grant execute on function public.create_internal_support_ticket(
  uuid, text, text, text, text, uuid
) to authenticated;

-- ---------------------------------------------------------------------------
-- Internal transition workflow and authorization.
--
--   open               -> assigned
--   assigned           -> in_progress
--   in_progress        -> waiting_for_client, resolved
--   waiting_for_client -> in_progress, resolved
--
-- Client confirmation/reopen remain exclusively in the existing client RPCs.
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
  actor_profile_id uuid := private.current_profile_id();
  target_ticket public.support_tickets%rowtype;
  is_allowed_transition boolean;
  normalized_note text := nullif(btrim(coalesce(p_resolution_note, '')), '');
begin
  if (select auth.uid()) is null or actor_profile_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'Authentication is required.';
  end if;

  if p_new_status is null
    or p_new_status not in (
      'assigned', 'in_progress', 'waiting_for_client', 'resolved'
    )
  then
    raise exception using
      errcode = 'P0001',
      message = 'This status cannot be set directly.';
  end if;

  -- super_admin/admin may act across their organization. A project_manager
  -- is limited to a manageable linked project or a self-assigned ticket. A
  -- team_member is limited to a self-assigned ticket.
  select ticket.*
  into target_ticket
  from public.support_tickets as ticket
  where ticket.id = target_ticket_id
    and (
      (
        select private.has_internal_role(
          ticket.organization_id,
          array['super_admin', 'admin']
        )
      )
      or (
        ticket.assigned_to = actor_profile_id
        and (
          select private.has_internal_role(
            ticket.organization_id,
            array['project_manager', 'team_member']
          )
        )
      )
      or (
        ticket.project_id is not null
        and (
          select private.has_internal_role(
            ticket.organization_id,
            array['project_manager']
          )
        )
        and (select private.can_manage_project(ticket.project_id))
      )
    )
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'This ticket could not be found or you do not have permission to update it.';
  end if;

  is_allowed_transition := (
    (target_ticket.status = 'open' and p_new_status = 'assigned')
    or (
      target_ticket.status = 'assigned'
      and p_new_status = 'in_progress'
    )
    or (
      target_ticket.status = 'in_progress'
      and p_new_status in ('waiting_for_client', 'resolved')
    )
    or (
      target_ticket.status = 'waiting_for_client'
      and p_new_status in ('in_progress', 'resolved')
    )
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

  if normalized_note is not null and char_length(normalized_note) > 3000 then
    raise exception using
      errcode = 'P0001',
      message = 'The resolution note must be 3000 characters or fewer.';
  end if;

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
      else null
    end
  where id = target_ticket_id;

  insert into public.ticket_activities (
    organization_id,
    ticket_id,
    activity_type,
    title,
    description,
    metadata,
    created_by
  )
  values (
    target_ticket.organization_id,
    target_ticket_id,
    case
      when p_new_status = 'resolved' then 'resolved'
      else 'status_changed'
    end,
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
-- Support RLS. Portal users still have no base-table policy; their existing
-- curated SECURITY DEFINER read functions continue to be the only portal
-- read path.
-- ---------------------------------------------------------------------------

drop policy if exists support_tickets_select_internal_members
  on public.support_tickets;

create policy support_tickets_select_internal_members
on public.support_tickets
for select
to authenticated
using (
  (
    select private.has_internal_role(
      support_tickets.organization_id,
      array['super_admin', 'admin']
    )
  )
  or (
    support_tickets.assigned_to = (select private.current_profile_id())
    and (
      select private.has_internal_role(
        support_tickets.organization_id,
        array['project_manager', 'team_member']
      )
    )
  )
  or (
    support_tickets.project_id is not null
    and (
      select private.has_internal_role(
        support_tickets.organization_id,
        array['project_manager']
      )
    )
    and (select private.can_manage_project(support_tickets.project_id))
  )
);

drop policy if exists support_tickets_update_assignment
  on public.support_tickets;

create policy support_tickets_update_assignment
on public.support_tickets
for update
to authenticated
using (
  (
    select private.has_internal_role(
      support_tickets.organization_id,
      array['super_admin', 'admin']
    )
  )
  or (
    (
      select private.has_internal_role(
        support_tickets.organization_id,
        array['project_manager']
      )
    )
    and (
      support_tickets.assigned_to = (select private.current_profile_id())
      or (
        support_tickets.project_id is not null
        and (select private.can_manage_project(support_tickets.project_id))
      )
    )
  )
)
with check (
  (
    (
      select private.has_internal_role(
        support_tickets.organization_id,
        array['super_admin', 'admin']
      )
    )
    or (
      (
        select private.has_internal_role(
          support_tickets.organization_id,
          array['project_manager']
        )
      )
      and (
        support_tickets.assigned_to = (select private.current_profile_id())
        or (
          support_tickets.project_id is not null
          and (select private.can_manage_project(support_tickets.project_id))
        )
      )
    )
  )
  and (
    support_tickets.status <> 'assigned'
    or support_tickets.assigned_to is not null
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

drop policy if exists ticket_activities_select_internal_members
  on public.ticket_activities;

create policy ticket_activities_select_internal_members
on public.ticket_activities
for select
to authenticated
using (
  exists (
    select 1
    from public.support_tickets as ticket
    where ticket.id = ticket_activities.ticket_id
      and ticket.organization_id = ticket_activities.organization_id
  )
);

-- ---------------------------------------------------------------------------
-- Maintenance RLS. Financial/internal plan data is limited to admins, or to
-- project managers for a linked project they can actually manage. Team
-- members have no base-table subscription or usage visibility.
-- ---------------------------------------------------------------------------

drop policy if exists subscriptions_select_internal_members
  on public.subscriptions;

create policy subscriptions_select_internal_members
on public.subscriptions
for select
to authenticated
using (
  (
    select private.has_internal_role(
      subscriptions.organization_id,
      array['super_admin', 'admin']
    )
  )
  or (
    subscriptions.project_id is not null
    and (
      select private.has_internal_role(
        subscriptions.organization_id,
        array['project_manager']
      )
    )
    and (select private.can_manage_project(subscriptions.project_id))
  )
);

drop policy if exists subscription_usage_select_internal_members
  on public.subscription_usage;

create policy subscription_usage_select_internal_members
on public.subscription_usage
for select
to authenticated
using (
  exists (
    select 1
    from public.subscriptions as subscription
    where subscription.id = subscription_usage.subscription_id
      and subscription.organization_id = subscription_usage.organization_id
  )
);

drop policy if exists subscription_usage_insert_managers
  on public.subscription_usage;

create policy subscription_usage_insert_managers
on public.subscription_usage
for insert
to authenticated
with check (
  recorded_by = (select private.current_profile_id())
  and exists (
    select 1
    from public.subscriptions as subscription
    where subscription.id = subscription_usage.subscription_id
      and subscription.organization_id = subscription_usage.organization_id
      and (
        (
          select private.has_internal_role(
            subscription.organization_id,
            array['super_admin', 'admin']
          )
        )
        or (
          subscription.project_id is not null
          and (
            select private.has_internal_role(
              subscription.organization_id,
              array['project_manager']
            )
          )
          and (select private.can_manage_project(subscription.project_id))
        )
      )
  )
);

-- ---------------------------------------------------------------------------
-- Keep portal detail routes reachable after their bounded summary lists grow.
-- The base migration exposed only capped list RPCs, which made an older owned
-- record indistinguishable from a foreign record. These ID-filtered, client-
-- scoped detail RPCs avoid unbounded list reads. Activity history retains the
-- newest 200 entries and presents that retained window chronologically.
-- ---------------------------------------------------------------------------

create or replace function public.get_client_support_ticket(
  target_ticket_id uuid
)
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
    and ticket.id = target_ticket_id;
$function$;

revoke all on function public.get_client_support_ticket(uuid)
  from public, anon, authenticated;

grant execute on function public.get_client_support_ticket(uuid)
  to authenticated;

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
  select
    recent.activity_type,
    recent.title,
    recent.description,
    recent.created_at
  from (
    select
      activity.id,
      activity.activity_type,
      activity.title,
      activity.description,
      activity.created_at
    from public.ticket_activities as activity
    inner join public.support_tickets as ticket
      on ticket.id = activity.ticket_id
    where activity.ticket_id = target_ticket_id
      and ticket.client_id = (select private.active_client_id())
    order by activity.created_at desc, activity.id desc
    limit 200
  ) as recent
  order by recent.created_at asc, recent.id asc;
$function$;

revoke all on function public.get_client_ticket_activities(uuid)
  from public, anon, authenticated;

grant execute on function public.get_client_ticket_activities(uuid)
  to authenticated;

create or replace function public.get_client_subscription(
  target_subscription_id uuid
)
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
    and subscription.id = target_subscription_id;
$function$;

revoke all on function public.get_client_subscription(uuid)
  from public, anon, authenticated;

grant execute on function public.get_client_subscription(uuid)
  to authenticated;
