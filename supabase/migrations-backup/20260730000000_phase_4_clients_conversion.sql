-- Phase 4: organization-scoped clients and atomic lead conversion.
-- Projects, client portal access, invitations, and client activity tables are
-- intentionally outside this migration.

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  source_lead_id uuid,
  business_name text not null,
  contact_name text not null,
  email text not null,
  phone text,
  industry text,
  website_url text,
  billing_address text,
  notes text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint clients_organization_id_fkey
    foreign key (organization_id)
    references public.organizations (id)
    on delete cascade,
  constraint clients_source_lead_id_fkey
    foreign key (source_lead_id)
    references public.leads (id)
    on delete set null,
  constraint clients_source_lead_id_key
    unique (source_lead_id),
  constraint clients_business_name_not_blank
    check (
      btrim(business_name) <> ''
      and char_length(business_name) <= 160
    ),
  constraint clients_contact_name_not_blank
    check (
      btrim(contact_name) <> ''
      and char_length(contact_name) <= 120
    ),
  constraint clients_email_format
    check (
      email = lower(btrim(email))
      and char_length(email) between 3 and 254
      and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ),
  constraint clients_phone_length
    check (phone is null or char_length(phone) <= 40),
  constraint clients_industry_length
    check (industry is null or char_length(industry) <= 120),
  constraint clients_website_url_length
    check (website_url is null or char_length(website_url) <= 2048),
  constraint clients_billing_address_length
    check (
      billing_address is null
      or char_length(billing_address) <= 2000
    ),
  constraint clients_notes_length
    check (notes is null or char_length(notes) <= 5000),
  constraint clients_status_check
    check (status in ('active', 'inactive', 'archived'))
);

alter table public.leads
  add constraint leads_converted_client_id_fkey
  foreign key (converted_client_id)
  references public.clients (id)
  on delete set null;

create index clients_organization_updated_idx
  on public.clients (organization_id, updated_at desc);

create index clients_organization_status_updated_idx
  on public.clients (organization_id, status, updated_at desc);

create index clients_organization_email_idx
  on public.clients (organization_id, email);

create index clients_organization_business_name_idx
  on public.clients (organization_id, business_name);

create trigger clients_set_updated_at
before update on public.clients
for each row
execute function private.set_updated_at();

alter table public.clients enable row level security;

create policy clients_select_internal_members
on public.clients
for select
to authenticated
using (
  (select private.is_internal_member(clients.organization_id))
);

create policy clients_update_client_managers
on public.clients
for update
to authenticated
using (
  (
    select private.has_internal_role(
      clients.organization_id,
      array['super_admin', 'admin']
    )
  )
)
with check (
  (
    select private.has_internal_role(
      clients.organization_id,
      array['super_admin', 'admin']
    )
  )
);

revoke all privileges
  on table public.clients
  from public, anon, authenticated;

grant select on table public.clients to authenticated;
grant update (
  business_name,
  contact_name,
  email,
  phone,
  industry,
  website_url,
  billing_address,
  notes,
  status
) on public.clients to authenticated;

grant all privileges on table public.clients to service_role;

create or replace function public.convert_lead_to_client(
  target_lead_id uuid
)
returns table (
  client_id uuid,
  created_new boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_organization_id uuid;
  actor_profile_id uuid;
  actor_role text;
  active_membership_count integer;
  source_lead public.leads%rowtype;
  new_client_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception using
      errcode = 'P0001',
      message = 'Authentication is required.';
  end if;

  select
    min(membership.organization_id::text)::uuid,
    min(membership.user_id::text)::uuid,
    min(membership.role),
    count(*)::integer
  into
    actor_organization_id,
    actor_profile_id,
    actor_role,
    active_membership_count
  from public.organization_members as membership
  inner join public.profiles as profile
    on profile.id = membership.user_id
  inner join public.organizations as organization
    on organization.id = membership.organization_id
  where profile.auth_user_id = (select auth.uid())
    and membership.status = 'active'
    and organization.status = 'active';

  if active_membership_count <> 1
    or actor_role not in ('super_admin', 'admin')
  then
    raise exception using
      errcode = 'P0001',
      message = 'You do not have permission to convert this lead.';
  end if;

  select lead.*
  into source_lead
  from public.leads as lead
  where lead.id = target_lead_id
    and lead.organization_id = actor_organization_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'This lead could not be found.';
  end if;

  if source_lead.converted_client_id is not null then
    return query
      select source_lead.converted_client_id, false;
    return;
  end if;

  if source_lead.status <> 'won' then
    raise exception using
      errcode = 'P0001',
      message = 'Only won leads can be converted.';
  end if;

  insert into public.clients (
    organization_id,
    source_lead_id,
    business_name,
    contact_name,
    email,
    phone,
    industry,
    status
  )
  values (
    actor_organization_id,
    source_lead.id,
    coalesce(
      nullif(btrim(source_lead.business_name), ''),
      btrim(source_lead.full_name)
    ),
    btrim(source_lead.full_name),
    lower(btrim(source_lead.email)),
    nullif(btrim(source_lead.phone), ''),
    nullif(btrim(source_lead.industry), ''),
    'active'
  )
  returning id into new_client_id;

  update public.leads
  set
    converted_client_id = new_client_id,
    converted_at = pg_catalog.now()
  where id = source_lead.id
    and organization_id = actor_organization_id;

  insert into public.lead_activities (
    organization_id,
    lead_id,
    activity_type,
    title,
    metadata,
    created_by
  )
  values (
    actor_organization_id,
    source_lead.id,
    'client_created',
    'Lead converted to client',
    pg_catalog.jsonb_build_object('client_id', new_client_id),
    actor_profile_id
  );

  return query
    select new_client_id, true;
end;
$function$;

revoke all on function public.convert_lead_to_client(uuid)
  from public, anon, authenticated;

grant execute on function public.convert_lead_to_client(uuid)
  to authenticated;
