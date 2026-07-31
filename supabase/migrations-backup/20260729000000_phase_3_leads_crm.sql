-- Phase 3: lead intake, CRM status, assignment, notes, and activity.
-- Client conversion remains out of scope; conversion fields are reserved but
-- cannot be changed by the authenticated role in this phase.

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  full_name text not null,
  business_name text,
  email text not null,
  phone text,
  industry text,
  service_interest text not null,
  problem_summary text,
  requested_features jsonb not null default '[]'::jsonb,
  budget_min numeric(12, 2),
  budget_max numeric(12, 2),
  target_timeline text,
  source text not null,
  source_detail text,
  status text not null default 'new',
  lead_score integer,
  assigned_to uuid,
  lost_reason text,
  converted_client_id uuid,
  converted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint leads_organization_id_fkey
    foreign key (organization_id)
    references public.organizations (id)
    on delete cascade,
  constraint leads_assigned_to_fkey
    foreign key (assigned_to)
    references public.profiles (id)
    on delete set null,
  constraint leads_full_name_not_blank
    check (btrim(full_name) <> '' and char_length(full_name) <= 120),
  constraint leads_business_name_length
    check (business_name is null or char_length(business_name) <= 160),
  constraint leads_email_format
    check (
      email = lower(btrim(email))
      and char_length(email) between 3 and 254
      and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ),
  constraint leads_phone_length
    check (phone is null or char_length(phone) <= 40),
  constraint leads_industry_length
    check (industry is null or char_length(industry) <= 120),
  constraint leads_service_interest_not_blank
    check (
      btrim(service_interest) <> ''
      and char_length(service_interest) <= 120
    ),
  constraint leads_problem_summary_length
    check (
      problem_summary is null
      or char_length(problem_summary) <= 5000
    ),
  constraint leads_requested_features_array
    check (
      jsonb_typeof(requested_features) = 'array'
      and jsonb_array_length(requested_features) <= 30
    ),
  constraint leads_budget_min_check
    check (budget_min is null or budget_min >= 0),
  constraint leads_budget_max_check
    check (budget_max is null or budget_max >= 0),
  constraint leads_budget_range_check
    check (
      budget_min is null
      or budget_max is null
      or budget_max >= budget_min
    ),
  constraint leads_target_timeline_length
    check (
      target_timeline is null
      or char_length(target_timeline) <= 120
    ),
  constraint leads_source_check
    check (
      source in (
        'website',
        'facebook',
        'messenger',
        'email',
        'referral',
        'networking',
        'manual',
        'existing_client',
        'other'
      )
    ),
  constraint leads_source_detail_length
    check (
      source_detail is null
      or char_length(source_detail) <= 500
    ),
  constraint leads_status_check
    check (
      status in (
        'new',
        'contacted',
        'discovery',
        'qualified',
        'proposal',
        'negotiation',
        'won',
        'lost'
      )
    ),
  constraint leads_lead_score_check
    check (lead_score is null or lead_score between 0 and 100),
  constraint leads_lost_reason_check
    check (
      (status <> 'lost' and lost_reason is null)
      or (
        status = 'lost'
        and lost_reason is not null
        and btrim(lost_reason) <> ''
        and char_length(lost_reason) <= 500
      )
    ),
  constraint leads_conversion_pair_check
    check (
      (converted_client_id is null and converted_at is null)
      or (converted_client_id is not null and converted_at is not null)
    )
);

create table public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  lead_id uuid not null,
  activity_type text not null,
  title text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),

  constraint lead_activities_organization_id_fkey
    foreign key (organization_id)
    references public.organizations (id)
    on delete cascade,
  constraint lead_activities_lead_id_fkey
    foreign key (lead_id)
    references public.leads (id)
    on delete cascade,
  constraint lead_activities_created_by_fkey
    foreign key (created_by)
    references public.profiles (id)
    on delete set null,
  constraint lead_activities_type_check
    check (
      activity_type in (
        'inquiry_submitted',
        'lead_created',
        'status_changed',
        'assigned',
        'note_added',
        'call_scheduled',
        'email_sent',
        'proposal_created',
        'proposal_sent',
        'proposal_viewed',
        'proposal_accepted',
        'lead_won',
        'lead_lost',
        'client_created',
        'project_created'
      )
    ),
  constraint lead_activities_title_not_blank
    check (btrim(title) <> '' and char_length(title) <= 180),
  constraint lead_activities_description_length
    check (
      description is null
      or char_length(description) <= 5000
    ),
  constraint lead_activities_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create index leads_organization_updated_idx
  on public.leads (organization_id, updated_at desc);

create index leads_organization_status_updated_idx
  on public.leads (organization_id, status, updated_at desc);

create index leads_organization_source_updated_idx
  on public.leads (organization_id, source, updated_at desc);

create index leads_organization_assigned_updated_idx
  on public.leads (organization_id, assigned_to, updated_at desc);

create index leads_organization_created_idx
  on public.leads (organization_id, created_at desc);

create index leads_email_idx
  on public.leads (email);

create index lead_activities_lead_created_idx
  on public.lead_activities (lead_id, created_at desc);

create index lead_activities_organization_created_idx
  on public.lead_activities (organization_id, created_at desc);

create trigger leads_set_updated_at
before update on public.leads
for each row
execute function private.set_updated_at();

create or replace function private.record_lead_created_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_profile_id uuid := private.current_profile_id();
begin
  insert into public.lead_activities (
    organization_id,
    lead_id,
    activity_type,
    title,
    created_by
  )
  values (
    new.organization_id,
    new.id,
    case
      when actor_profile_id is null and new.source = 'website'
        then 'inquiry_submitted'
      else 'lead_created'
    end,
    case
      when actor_profile_id is null and new.source = 'website'
        then 'Project inquiry submitted'
      else 'Lead created'
    end,
    actor_profile_id
  );

  if new.assigned_to is not null then
    insert into public.lead_activities (
      organization_id,
      lead_id,
      activity_type,
      title,
      metadata,
      created_by
    )
    values (
      new.organization_id,
      new.id,
      'assigned',
      'Lead assigned',
      pg_catalog.jsonb_build_object('assigned_to', new.assigned_to),
      actor_profile_id
    );
  end if;

  return new;
end;
$function$;

revoke all on function private.record_lead_created_activity()
  from public, anon, authenticated;

create trigger leads_record_created_activity
after insert on public.leads
for each row
execute function private.record_lead_created_activity();

create or replace function private.record_lead_update_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_profile_id uuid := private.current_profile_id();
begin
  if old.status is distinct from new.status then
    insert into public.lead_activities (
      organization_id,
      lead_id,
      activity_type,
      title,
      description,
      metadata,
      created_by
    )
    values (
      new.organization_id,
      new.id,
      case
        when new.status = 'won' then 'lead_won'
        when new.status = 'lost' then 'lead_lost'
        else 'status_changed'
      end,
      'Status changed from ' || old.status || ' to ' || new.status,
      case when new.status = 'lost' then new.lost_reason else null end,
      pg_catalog.jsonb_build_object(
        'from',
        old.status,
        'to',
        new.status
      ),
      actor_profile_id
    );
  end if;

  if old.assigned_to is distinct from new.assigned_to then
    insert into public.lead_activities (
      organization_id,
      lead_id,
      activity_type,
      title,
      metadata,
      created_by
    )
    values (
      new.organization_id,
      new.id,
      'assigned',
      case
        when new.assigned_to is null then 'Lead unassigned'
        else 'Lead assigned'
      end,
      pg_catalog.jsonb_build_object(
        'from',
        old.assigned_to,
        'to',
        new.assigned_to
      ),
      actor_profile_id
    );
  end if;

  return new;
end;
$function$;

revoke all on function private.record_lead_update_activity()
  from public, anon, authenticated;

create trigger leads_record_update_activity
after update on public.leads
for each row
execute function private.record_lead_update_activity();

create or replace function private.can_view_internal_profile(
  target_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.organization_members as target_membership
    where target_membership.user_id = target_profile_id
      and target_membership.status = 'active'
      and (
        select private.is_internal_member(
          target_membership.organization_id
        )
      )
  );
$function$;

revoke all on function private.can_view_internal_profile(uuid)
  from public, anon, authenticated;
grant execute on function private.can_view_internal_profile(uuid)
  to authenticated;

create policy profiles_select_active_internal_colleagues
on public.profiles
for select
to authenticated
using (
  (select private.can_view_internal_profile(profiles.id))
);

create policy organization_members_select_lead_managers
on public.organization_members
for select
to authenticated
using (
  (
    select private.has_internal_role(
      organization_members.organization_id,
      array['super_admin', 'admin']
    )
  )
);

alter table public.leads enable row level security;
alter table public.lead_activities enable row level security;

create policy leads_select_internal_members
on public.leads
for select
to authenticated
using (
  (select private.is_internal_member(leads.organization_id))
);

create policy leads_insert_lead_managers
on public.leads
for insert
to authenticated
with check (
  (
    select private.has_internal_role(
      leads.organization_id,
      array['super_admin', 'admin']
    )
  )
  and (
    leads.assigned_to is null
    or exists (
      select 1
      from public.organization_members as assignee_membership
      where assignee_membership.organization_id = leads.organization_id
        and assignee_membership.user_id = leads.assigned_to
        and assignee_membership.status = 'active'
    )
  )
);

create policy leads_update_lead_managers
on public.leads
for update
to authenticated
using (
  (
    select private.has_internal_role(
      leads.organization_id,
      array['super_admin', 'admin']
    )
  )
)
with check (
  (
    select private.has_internal_role(
      leads.organization_id,
      array['super_admin', 'admin']
    )
  )
  and (
    leads.assigned_to is null
    or exists (
      select 1
      from public.organization_members as assignee_membership
      where assignee_membership.organization_id = leads.organization_id
        and assignee_membership.user_id = leads.assigned_to
        and assignee_membership.status = 'active'
    )
  )
);

create policy lead_activities_select_internal_members
on public.lead_activities
for select
to authenticated
using (
  (select private.is_internal_member(lead_activities.organization_id))
);

create policy lead_activities_insert_lead_managers
on public.lead_activities
for insert
to authenticated
with check (
  (
    select private.has_internal_role(
      lead_activities.organization_id,
      array['super_admin', 'admin']
    )
  )
  and created_by = (select private.current_profile_id())
  and exists (
    select 1
    from public.leads as lead
    where lead.id = lead_activities.lead_id
      and lead.organization_id = lead_activities.organization_id
  )
);

revoke all privileges
  on table public.leads, public.lead_activities
  from public, anon, authenticated;

grant select on table public.leads to authenticated;
grant insert (
  organization_id,
  full_name,
  business_name,
  email,
  phone,
  industry,
  service_interest,
  problem_summary,
  requested_features,
  budget_min,
  budget_max,
  target_timeline,
  source,
  source_detail,
  status,
  lead_score,
  assigned_to,
  lost_reason
) on public.leads to authenticated;
grant update (
  full_name,
  business_name,
  email,
  phone,
  industry,
  service_interest,
  problem_summary,
  requested_features,
  budget_min,
  budget_max,
  target_timeline,
  source,
  source_detail,
  status,
  lead_score,
  assigned_to,
  lost_reason
) on public.leads to authenticated;

grant select on table public.lead_activities to authenticated;
grant insert (
  organization_id,
  lead_id,
  activity_type,
  title,
  description,
  metadata,
  created_by
) on public.lead_activities to authenticated;

grant all privileges
  on table public.leads, public.lead_activities
  to service_role;

create or replace function public.submit_project_inquiry(
  inquiry_full_name text,
  inquiry_business_name text,
  inquiry_email text,
  inquiry_phone text,
  inquiry_industry text,
  inquiry_service_interest text,
  inquiry_problem_summary text,
  inquiry_requested_features jsonb,
  inquiry_budget_min numeric,
  inquiry_budget_max numeric,
  inquiry_target_timeline text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_organization_id uuid;
  normalized_email text := lower(btrim(inquiry_email));
  recent_inquiry_count integer;
begin
  -- Serialize submissions for the same normalized email so the bounded
  -- anti-abuse check cannot be bypassed by concurrent requests.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(normalized_email, 0)
  );

  select organization.id
  into target_organization_id
  from public.organizations as organization
  where organization.slug = 'nexfora'
    and organization.status = 'active'
  limit 1;

  if target_organization_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'Project inquiry is temporarily unavailable.';
  end if;

  select count(*)::integer
  into recent_inquiry_count
  from public.leads as lead
  where lead.organization_id = target_organization_id
    and lead.source = 'website'
    and lead.email = normalized_email
    and lead.created_at >= pg_catalog.now() - interval '15 minutes';

  if recent_inquiry_count >= 3 then
    return false;
  end if;

  insert into public.leads (
    organization_id,
    full_name,
    business_name,
    email,
    phone,
    industry,
    service_interest,
    problem_summary,
    requested_features,
    budget_min,
    budget_max,
    target_timeline,
    source,
    status
  )
  values (
    target_organization_id,
    btrim(inquiry_full_name),
    nullif(btrim(inquiry_business_name), ''),
    normalized_email,
    nullif(btrim(inquiry_phone), ''),
    nullif(btrim(inquiry_industry), ''),
    btrim(inquiry_service_interest),
    btrim(inquiry_problem_summary),
    coalesce(inquiry_requested_features, '[]'::jsonb),
    inquiry_budget_min,
    inquiry_budget_max,
    nullif(btrim(inquiry_target_timeline), ''),
    'website',
    'new'
  );

  return true;
exception
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'Project inquiry could not be submitted.';
end;
$function$;

revoke all on function public.submit_project_inquiry(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  numeric,
  numeric,
  text
) from public, anon, authenticated;

grant execute on function public.submit_project_inquiry(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  numeric,
  numeric,
  text
) to anon, authenticated;
