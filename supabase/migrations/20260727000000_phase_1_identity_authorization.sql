-- Phase 1: authentication-adjacent identity, internal membership, and RLS.
-- Authenticated application sessions are intentionally read-only for these
-- tables. Bootstrap and membership changes require a trusted server secret or
-- the Supabase SQL editor.

create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  logo_url text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint organizations_name_not_blank
    check (btrim(name) <> ''),
  constraint organizations_slug_key
    unique (slug),
  constraint organizations_slug_format
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint organizations_status_check
    check (status in ('active', 'inactive'))
);

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null,
  full_name text not null,
  avatar_url text,
  phone text,
  timezone text not null default 'Asia/Manila',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_auth_user_id_key
    unique (auth_user_id),
  constraint profiles_auth_user_id_fkey
    foreign key (auth_user_id)
    references auth.users (id)
    on delete cascade,
  constraint profiles_full_name_not_blank
    check (btrim(full_name) <> ''),
  constraint profiles_timezone_not_blank
    check (btrim(timezone) <> '')
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  user_id uuid not null,
  role text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint organization_members_organization_id_fkey
    foreign key (organization_id)
    references public.organizations (id)
    on delete cascade,
  constraint organization_members_user_id_fkey
    foreign key (user_id)
    references public.profiles (id)
    on delete cascade,
  constraint organization_members_organization_user_key
    unique (organization_id, user_id),
  constraint organization_members_role_check
    check (
      role in (
        'super_admin',
        'admin',
        'project_manager',
        'team_member'
      )
    ),
  constraint organization_members_status_check
    check (status in ('active', 'invited', 'suspended'))
);

create index organization_members_user_status_organization_idx
  on public.organization_members (user_id, status, organization_id);

create index organization_members_organization_status_role_idx
  on public.organization_members (organization_id, status, role);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$function$;

create trigger organizations_set_updated_at
before update on public.organizations
for each row
execute function private.set_updated_at();

create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function private.set_updated_at();

create trigger organization_members_set_updated_at
before update on public.organization_members
for each row
execute function private.set_updated_at();

create or replace function private.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $function$
  select profile.id
  from public.profiles as profile
  where profile.auth_user_id = (select auth.uid());
$function$;

create or replace function private.is_internal_member(
  target_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.organization_members as membership
    inner join public.profiles as profile
      on profile.id = membership.user_id
    inner join public.organizations as organization
      on organization.id = membership.organization_id
    where profile.auth_user_id = (select auth.uid())
      and membership.organization_id = target_organization_id
      and membership.status = 'active'
      and organization.status = 'active'
  );
$function$;

create or replace function private.has_internal_role(
  target_organization_id uuid,
  allowed_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.organization_members as membership
    inner join public.profiles as profile
      on profile.id = membership.user_id
    inner join public.organizations as organization
      on organization.id = membership.organization_id
    where profile.auth_user_id = (select auth.uid())
      and membership.organization_id = target_organization_id
      and membership.status = 'active'
      and membership.role = any (allowed_roles)
      and organization.status = 'active'
  );
$function$;

revoke all on function private.set_updated_at()
  from public, anon, authenticated;
revoke all on function private.current_profile_id()
  from public, anon, authenticated;
revoke all on function private.is_internal_member(uuid)
  from public, anon, authenticated;
revoke all on function private.has_internal_role(uuid, text[])
  from public, anon, authenticated;

grant usage on schema private to authenticated;
grant execute on function private.current_profile_id() to authenticated;
grant execute on function private.is_internal_member(uuid) to authenticated;
grant execute on function private.has_internal_role(uuid, text[])
  to authenticated;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;

create policy organizations_select_active_members
on public.organizations
for select
to authenticated
using (
  (select private.is_internal_member(organizations.id))
);

create policy profiles_select_own
on public.profiles
for select
to authenticated
using (
  auth_user_id = (select auth.uid())
);

create policy organization_members_select_own
on public.organization_members
for select
to authenticated
using (
  user_id = (select private.current_profile_id())
);

revoke all privileges
  on table
    public.organizations,
    public.profiles,
    public.organization_members
  from public, anon, authenticated;

grant select
  on table
    public.organizations,
    public.profiles,
    public.organization_members
  to authenticated;

grant all privileges
  on table
    public.organizations,
    public.profiles,
    public.organization_members
  to service_role;
