-- Bootstrap the first NEXFORA OS owner.
-- Run this only after creating the owner in Supabase Authentication.

do $$
declare
  v_auth_user_id uuid := '122557fe-8e9c-4b4e-81ec-c0ecf0ed3683';
  v_organization_id uuid;
  v_profile_id uuid;
begin
  -- 1. Create or retrieve the Nexfora organization
  insert into public.organizations (
    name,
    slug,
    status
  )
  values (
    'Nexfora Digital Innovation',
    'nexfora',
    'active'
  )
  on conflict (slug)
  do update set
    name = excluded.name,
    status = excluded.status
  returning id into v_organization_id;

  -- 2. Create or retrieve the owner profile
  insert into public.profiles (
    auth_user_id,
    full_name,
    timezone
  )
  values (
    v_auth_user_id,
    'Joshua Evangelista',
    'Asia/Manila'
  )
  on conflict (auth_user_id)
  do update set
    full_name = excluded.full_name,
    timezone = excluded.timezone
  returning id into v_profile_id;

  -- 3. Assign the owner as super admin
  insert into public.organization_members (
    organization_id,
    user_id,
    role,
    status
  )
  values (
    v_organization_id,
    v_profile_id,
    'super_admin',
    'active'
  )
  on conflict (organization_id, user_id)
  do update set
    role = excluded.role,
    status = excluded.status;
end;
$$;