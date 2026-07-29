-- Phase 7: client portal (client invitations, client membership, and a
-- narrowly scoped read-only client-facing surface for projects/milestones).
-- Client Portal file uploads, revisions, invoices, payments, support
-- tickets, maintenance subscriptions, and AI generation remain out of
-- scope. Tasks are intentionally never exposed to the client portal (no
-- documented client-visible boundary exists for them yet). Does not modify
-- any already-applied migration.

-- ---------------------------------------------------------------------------
-- public.client_users
-- ---------------------------------------------------------------------------

create table public.client_users (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  user_id uuid not null,
  role text not null default 'viewer',
  status text not null default 'active',
  created_at timestamptz not null default now(),

  constraint client_users_client_id_fkey
    foreign key (client_id)
    references public.clients (id)
    on delete cascade,
  constraint client_users_user_id_fkey
    foreign key (user_id)
    references public.profiles (id)
    on delete cascade,
  constraint client_users_client_user_key
    unique (client_id, user_id),
  constraint client_users_role_check
    check (role in ('owner', 'manager', 'viewer')),
  constraint client_users_status_check
    check (status in ('active', 'invited', 'suspended'))
);

-- Rows are only ever inserted by accept_client_invitation() below, always
-- directly as 'active' (this phase never pre-creates a row in 'invited'
-- state before acceptance). 'invited' remains a valid, documented status
-- value for schema completeness / future use, not exercised by this phase.

create index client_users_client_idx on public.client_users (client_id);
create index client_users_user_idx on public.client_users (user_id);
create index client_users_status_idx on public.client_users (status);

-- ---------------------------------------------------------------------------
-- public.client_invitations
-- ---------------------------------------------------------------------------

create table public.client_invitations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  email text not null,
  role text not null default 'viewer',
  token_hash text not null,
  status text not null default 'pending',
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),

  constraint client_invitations_client_id_fkey
    foreign key (client_id)
    references public.clients (id)
    on delete cascade,
  constraint client_invitations_created_by_fkey
    foreign key (created_by)
    references public.profiles (id)
    on delete set null,
  constraint client_invitations_token_hash_key
    unique (token_hash),
  -- Only a SHA-256 hex hash of the raw invitation token is ever stored (see
  -- the "Secure client access" note below) — mirrors
  -- proposal_access_tokens.token_hash's exact format/constraint.
  constraint client_invitations_token_hash_format
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint client_invitations_role_check
    check (role in ('owner', 'manager', 'viewer')),
  constraint client_invitations_status_check
    check (status in ('pending', 'accepted', 'expired', 'revoked')),
  constraint client_invitations_email_format
    check (
      email = lower(btrim(email))
      and char_length(email) between 3 and 254
      and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ),
  constraint client_invitations_accepted_at_check
    check ((status = 'accepted') = (accepted_at is not null))
);

create index client_invitations_client_idx
  on public.client_invitations (client_id);

create index client_invitations_status_idx
  on public.client_invitations (status);

create index client_invitations_client_email_idx
  on public.client_invitations (client_id, email);

-- Additional index beyond DATABASE.md's documented column list, genuinely
-- required: enforces "at most one pending invitation per client+email" and
-- is what makes create_or_resend_client_invitation()'s atomic upsert (and
-- therefore safe, idempotent resend) possible without extra bookkeeping
-- columns.
create unique index client_invitations_pending_unique
  on public.client_invitations (client_id, email)
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- client_users and client_invitations are the only tables a client-portal
-- user ever touches directly (their own membership row only — every column
-- on that row is already safe to show its owner). Clients/projects/
-- milestones are deliberately NOT given a new client-facing RLS policy:
-- table-level SELECT grants in this schema are not column-limited per role,
-- so any new permissive policy on those tables would also let a client user
-- `select *` directly and see internal-only columns (notes,
-- billing_address, project_manager_id, organization_id, ...). Client-portal
-- reads of clients/projects/milestones instead go entirely through the
-- SECURITY DEFINER functions below, which verify membership internally and
-- return only curated fields — the same pattern already proven by
-- view_proposal_by_token.
-- ---------------------------------------------------------------------------

alter table public.client_users enable row level security;
alter table public.client_invitations enable row level security;

create policy client_users_select_own
on public.client_users
for select
to authenticated
using (
  user_id = (select private.current_profile_id())
);

create policy client_users_select_internal_members
on public.client_users
for select
to authenticated
using (
  exists (
    select 1
    from public.clients as client
    where client.id = client_users.client_id
      and (select private.is_internal_member(client.organization_id))
  )
);

create policy client_invitations_select_internal_members
on public.client_invitations
for select
to authenticated
using (
  exists (
    select 1
    from public.clients as client
    where client.id = client_invitations.client_id
      and (select private.is_internal_member(client.organization_id))
  )
);

-- No policy/grant permits authenticated to INSERT/UPDATE/DELETE either
-- table directly, and no policy/grant reaches anon at all — every mutation
-- (invite, resend, revoke, accept) happens exclusively through the
-- SECURITY DEFINER functions below, which bypass RLS as the table owner.
-- This is what makes "browser cannot create arbitrary client membership",
-- "browser cannot mark an invitation accepted directly", and "raw
-- invitation-token lookup is not available through broad table reads" true.

revoke all privileges
  on table public.client_users, public.client_invitations
  from public, anon, authenticated;

grant select on table public.client_users to authenticated;
grant select on table public.client_invitations to authenticated;

grant all privileges
  on table public.client_users, public.client_invitations
  to service_role;

-- ---------------------------------------------------------------------------
-- private.active_client_id: internal helper, not PostgREST-callable (the
-- `private` schema is not in config.toml's exposed `schemas` list). Mirrors
-- requireInternalMember's fail-closed behavior: resolves a client only when
-- the caller has exactly one active client_users row whose linked client is
-- itself active. Used only from inside the public.* functions below.
-- ---------------------------------------------------------------------------

create or replace function private.active_client_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $function$
  select min(membership.client_id::text)::uuid
  from public.client_users as membership
  inner join public.profiles as profile
    on profile.id = membership.user_id
  inner join public.clients as client
    on client.id = membership.client_id
  where profile.auth_user_id = (select auth.uid())
    and membership.status = 'active'
    and client.status = 'active'
  having count(*) = 1;
$function$;

revoke all on function private.active_client_id()
  from public, anon, authenticated;

grant execute on function private.active_client_id() to authenticated;

-- ---------------------------------------------------------------------------
-- public.get_active_client_membership: the sole "who is this portal user"
-- gateway, called by requirePortalMember(). Every column reference below is
-- alias-qualified so none can ever be confused with this function's own
-- RETURNS TABLE column names (the exact bug class fixed for send_proposal).
-- ---------------------------------------------------------------------------

create or replace function public.get_active_client_membership()
returns table (
  client_id uuid,
  business_name text,
  client_role text,
  client_status text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    client.id,
    client.business_name,
    membership.role,
    membership.status
  from public.client_users as membership
  inner join public.clients as client
    on client.id = membership.client_id
  inner join public.profiles as profile
    on profile.id = membership.user_id
  where profile.auth_user_id = (select auth.uid())
    and membership.client_id = (select private.active_client_id())
    and membership.status = 'active';
$function$;

revoke all on function public.get_active_client_membership()
  from public, anon, authenticated;

grant execute on function public.get_active_client_membership()
  to authenticated;

-- ---------------------------------------------------------------------------
-- public.get_client_projects: safe project fields only, bounded, for the
-- caller's active client. Reused by both the dashboard and /portal/projects.
-- Tasks are never included (no documented client-visible boundary exists).
-- ---------------------------------------------------------------------------

create or replace function public.get_client_projects()
returns table (
  id uuid,
  name text,
  status text,
  priority text,
  progress_percent integer,
  start_date date,
  target_date date,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    project.id,
    project.name,
    project.status,
    project.priority,
    project.progress_percent,
    project.start_date,
    project.target_date,
    project.updated_at
  from public.projects as project
  where project.client_id = (select private.active_client_id())
  order by project.updated_at desc
  limit 50;
$function$;

revoke all on function public.get_client_projects()
  from public, anon, authenticated;

grant execute on function public.get_client_projects() to authenticated;

-- ---------------------------------------------------------------------------
-- public.get_client_project_detail: safe project fields plus milestones,
-- scoped to the caller's active client. Returns null uniformly for a
-- nonexistent project and for a project belonging to another client — the
-- same "no distinguishing detail" behavior already used by the proposal
-- token functions, so a modified project UUID cannot be used to probe
-- whether it exists for a different client.
-- ---------------------------------------------------------------------------

create or replace function public.get_client_project_detail(
  target_project_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  resolved_client_id uuid := private.active_client_id();
  target_project public.projects%rowtype;
begin
  if resolved_client_id is null then
    return null;
  end if;

  select project.*
  into target_project
  from public.projects as project
  where project.id = target_project_id
    and project.client_id = resolved_client_id;

  if not found then
    return null;
  end if;

  return pg_catalog.jsonb_build_object(
    'id', target_project.id,
    'name', target_project.name,
    'description', target_project.description,
    'status', target_project.status,
    'priority', target_project.priority,
    'progress_percent', target_project.progress_percent,
    'start_date', target_project.start_date,
    'target_date', target_project.target_date,
    'updated_at', target_project.updated_at,
    'milestones', (
      select coalesce(pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', milestone.id,
          'title', milestone.title,
          'description', milestone.description,
          'status', milestone.status,
          'due_date', milestone.due_date,
          'sort_order', milestone.sort_order
        )
        order by milestone.sort_order
      ), '[]'::jsonb)
      from public.milestones as milestone
      where milestone.project_id = target_project.id
    )
  );
end;
$function$;

revoke all on function public.get_client_project_detail(uuid)
  from public, anon, authenticated;

grant execute on function public.get_client_project_detail(uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- public.create_or_resend_client_invitation: the atomic invite/resend
-- transaction. super_admin/admin only, organization-scoped. One call
-- handles both first-send (insert) and resend (rotate token/expiry/role on
-- the existing pending row) via ON CONFLICT against
-- client_invitations_pending_unique — the old raw token stops working the
-- instant the row's hash changes, and at most one pending invitation per
-- client+email can ever exist.
-- ---------------------------------------------------------------------------

create or replace function public.create_or_resend_client_invitation(
  target_client_id uuid,
  p_email text,
  p_role text,
  p_expires_at timestamptz,
  p_token_hash text
)
returns table (
  invitation_id uuid,
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
  normalized_email text := lower(btrim(p_email));
  existing_active_count integer;
  result_id uuid;
  result_created_new boolean;
begin
  if (select auth.uid()) is null then
    raise exception using
      errcode = 'P0001',
      message = 'Authentication is required.';
  end if;

  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using
      errcode = 'P0001',
      message = 'A valid invitation token hash is required.';
  end if;

  if p_role not in ('owner', 'manager', 'viewer') then
    raise exception using
      errcode = 'P0001',
      message = 'A valid client role is required.';
  end if;

  if normalized_email = ''
    or char_length(normalized_email) > 254
    or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then
    raise exception using
      errcode = 'P0001',
      message = 'A valid email address is required.';
  end if;

  if p_expires_at <= pg_catalog.now() then
    raise exception using
      errcode = 'P0001',
      message = 'A valid future expiration is required.';
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
      message = 'You do not have permission to invite client users.';
  end if;

  if not exists (
    select 1
    from public.clients as client
    where client.id = target_client_id
      and client.organization_id = actor_organization_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'This client could not be found.';
  end if;

  select count(*)::integer
  into existing_active_count
  from public.client_users as membership
  inner join public.profiles as profile
    on profile.id = membership.user_id
  inner join auth.users as auth_user
    on auth_user.id = profile.auth_user_id
  where membership.client_id = target_client_id
    and membership.status = 'active'
    and lower(auth_user.email) = normalized_email;

  if existing_active_count > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'This person already has active portal access for this client.';
  end if;

  insert into public.client_invitations (
    client_id,
    email,
    role,
    token_hash,
    status,
    expires_at,
    created_by
  )
  values (
    target_client_id,
    normalized_email,
    p_role,
    p_token_hash,
    'pending',
    p_expires_at,
    actor_profile_id
  )
  on conflict (client_id, email) where status = 'pending'
  do update set
    token_hash = excluded.token_hash,
    expires_at = excluded.expires_at,
    role = excluded.role,
    created_by = excluded.created_by
  returning client_invitations.id, (xmax = 0)
  into result_id, result_created_new;

  return query select result_id, result_created_new;
end;
$function$;

revoke all on function public.create_or_resend_client_invitation(
  uuid, text, text, timestamptz, text
) from public, anon, authenticated;

grant execute on function public.create_or_resend_client_invitation(
  uuid, text, text, timestamptz, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- public.get_client_invitation_by_token: secure, pre-authentication lookup
-- for the accept-invitation page. Invalid, expired, and revoked tokens all
-- return null uniformly (mirrors view_proposal_by_token's "no
-- distinguishing detail" behavior).
-- ---------------------------------------------------------------------------

create or replace function public.get_client_invitation_by_token(
  p_token_hash text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  target_invitation public.client_invitations%rowtype;
  client_business_name text;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return null;
  end if;

  select invitation.*
  into target_invitation
  from public.client_invitations as invitation
  where invitation.token_hash = p_token_hash
    and invitation.status = 'pending'
    and invitation.expires_at > pg_catalog.now();

  if not found then
    return null;
  end if;

  select client.business_name
  into client_business_name
  from public.clients as client
  where client.id = target_invitation.client_id;

  return pg_catalog.jsonb_build_object(
    'client_id', target_invitation.client_id,
    'business_name', client_business_name,
    'email', target_invitation.email,
    'role', target_invitation.role,
    'expires_at', target_invitation.expires_at
  );
end;
$function$;

revoke all on function public.get_client_invitation_by_token(text)
  from public, anon, authenticated;

grant execute on function public.get_client_invitation_by_token(text)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- public.accept_client_invitation: requires an authenticated caller (the
-- app layer signs the user in — new or existing account — before calling
-- this). Validates the token, requires the authenticated email to match the
-- invitation's email, and is idempotent: an already-active membership for
-- the caller short-circuits to success before the pending/expiry check even
-- runs, so re-clicking a long-since-expired link you already used
-- successfully still succeeds. A token cannot be reused for a different
-- email or a different client — both are checked against the invitation
-- row itself, never a browser-supplied value.
-- ---------------------------------------------------------------------------

create or replace function public.accept_client_invitation(
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller_email text := lower(btrim((select auth.jwt() ->> 'email')));
  caller_profile_id uuid;
  target_invitation public.client_invitations%rowtype;
  existing_membership public.client_users%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception using
      errcode = 'P0001',
      message = 'Authentication is required.';
  end if;

  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using
      errcode = 'P0001',
      message = 'This invitation link is invalid or has expired.';
  end if;

  select profile.id
  into caller_profile_id
  from public.profiles as profile
  where profile.auth_user_id = (select auth.uid());

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'We could not find your account profile. Please try again.';
  end if;

  select invitation.*
  into target_invitation
  from public.client_invitations as invitation
  where invitation.token_hash = p_token_hash
  for update;

  if not found
    or lower(btrim(target_invitation.email)) <> caller_email
  then
    raise exception using
      errcode = 'P0001',
      message = 'This invitation link is invalid or has expired.';
  end if;

  select membership.*
  into existing_membership
  from public.client_users as membership
  where membership.client_id = target_invitation.client_id
    and membership.user_id = caller_profile_id;

  if found and existing_membership.status = 'active' then
    return pg_catalog.jsonb_build_object(
      'client_id', target_invitation.client_id,
      'already_accepted', true
    );
  end if;

  if target_invitation.status <> 'pending'
    or target_invitation.expires_at <= pg_catalog.now()
  then
    raise exception using
      errcode = 'P0001',
      message = 'This invitation link is invalid or has expired.';
  end if;

  insert into public.client_users (client_id, user_id, role, status)
  values (
    target_invitation.client_id,
    caller_profile_id,
    target_invitation.role,
    'active'
  )
  on conflict (client_id, user_id)
  do update set status = 'active', role = excluded.role;

  update public.client_invitations
  set status = 'accepted', accepted_at = pg_catalog.now()
  where id = target_invitation.id
    and status = 'pending';

  return pg_catalog.jsonb_build_object(
    'client_id', target_invitation.client_id,
    'already_accepted', false
  );
end;
$function$;

revoke all on function public.accept_client_invitation(text)
  from public, anon, authenticated;

grant execute on function public.accept_client_invitation(text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- public.revoke_client_invitation: super_admin/admin only, organization-
-- scoped. Only affects a status='pending' row; revoking an
-- already-accepted/expired/revoked invitation is a safe no-op (0 rows
-- updated, no error).
-- ---------------------------------------------------------------------------

create or replace function public.revoke_client_invitation(
  target_invitation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_organization_id uuid;
  actor_role text;
  active_membership_count integer;
begin
  if (select auth.uid()) is null then
    raise exception using
      errcode = 'P0001',
      message = 'Authentication is required.';
  end if;

  select
    min(membership.organization_id::text)::uuid,
    min(membership.role),
    count(*)::integer
  into actor_organization_id, actor_role, active_membership_count
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
      message = 'You do not have permission to revoke this invitation.';
  end if;

  update public.client_invitations as invitation
  set status = 'revoked'
  from public.clients as client
  where invitation.id = target_invitation_id
    and invitation.client_id = client.id
    and client.organization_id = actor_organization_id
    and invitation.status = 'pending';
end;
$function$;

revoke all on function public.revoke_client_invitation(uuid)
  from public, anon, authenticated;

grant execute on function public.revoke_client_invitation(uuid)
  to authenticated;
