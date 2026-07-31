-- Fixes a genuine defect in project_files_storage_insert_internal and
-- project_files_storage_insert_client (both defined in
-- 20260803000000_phase_8_files_revisions.sql), confirmed by running the
-- Phase 8 automated test suite against a real Supabase project: every
-- authorized upload (internal admin, client owner, client manager) is
-- rejected with "new row violates row-level security policy", even though
-- the same caller can successfully call create_internal_project_file /
-- create_client_project_file (the RPCs the same upload flow calls right
-- after the storage upload) for the identical project.
--
-- Root cause: both policies' `with check` includes a plain
-- `exists (select 1 from public.projects as project where ...)` — a
-- direct, non-SECURITY DEFINER subquery on public.projects, evaluated
-- under the CALLING role's own row-level visibility, not the elevated
-- visibility a SECURITY DEFINER function gets. Internal members have
-- RLS SELECT on public.projects scoped to their own organization
-- (projects_select_internal_members, from
-- 20260731000000_phase_5_projects_foundation.sql), which is why the
-- internal-admin failure could not be explained by that alone once
-- confirmed empirically — but portal clients have NO direct RLS SELECT
-- on public.projects at all, by design (see get_client_project_detail's
-- and get_client_project_files'/get_client_revisions' comments: "no
-- client-facing RLS policy on projects/project_files"). For a client
-- session, `exists (select 1 from public.projects ...)` can therefore
-- never return true regardless of real ownership, so
-- project_files_storage_insert_client can never let a real upload
-- through. This was confirmed directly: a signed-in client owner's own
-- `select * from projects where id = <their own project>` returns no
-- row, while the same session's create_client_project_file RPC call
-- (which resolves ownership via the SECURITY DEFINER
-- private.active_client_id()/private.active_client_role() instead of a
-- direct table read) succeeds.
--
-- Fix: move the entire authorization decision (the projects-row check
-- AND the role/assignment check) into a SECURITY DEFINER helper per
-- policy, mirroring the pattern private.can_manage_project() and
-- private.active_client_id()/private.active_client_role() already use
-- successfully elsewhere in this same phase — so the policy body itself
-- never directly queries an RLS-protected table under the caller's own
-- restricted visibility. Each new helper reproduces the exact
-- authorization rule its matching RPC already enforces:
--   - create_internal_project_file: caller can_manage_project() for the
--     target project AND the project genuinely belongs to the
--     organization/client encoded in the path.
--   - create_client_project_file: caller's active_client_id() matches
--     the path's client segment, active_client_role() is owner/manager,
--     and the project genuinely belongs to that client.
--
-- Scope note: this migration only touches the two INSERT policies, which
-- is what was actually confirmed broken (via failing "authorized upload
-- succeeds" tests). project_files_storage_select_client contains a
-- similarly-shaped direct `exists (select 1 from public.project_files
-- ...)` subquery, which — by the same reasoning — should have the same
-- theoretical issue for a client session. It was not changed here because
-- downloads were not observed to fail in testing (createSignedUrl
-- appears not to strictly enforce this policy at signed-URL-generation
-- time in the tested Supabase Storage version), so there is no confirmed
-- defect to fix, and this migration intentionally stays scoped to the
-- proven failure. Worth a follow-up check if download authorization is
-- ever revisited.
--
-- This does not edit either already-applied migration above — it is a
-- new file, dropping and recreating only the two named policies (Postgres
-- policies must be dropped and recreated to change their definition;
-- unlike functions, there is no `create or replace policy`).

create or replace function private.can_upload_internal_project_file(
  target_project_id uuid,
  target_organization_id uuid,
  target_client_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    exists (
      select 1
      from public.projects as project
      where project.id = target_project_id
        and project.organization_id = target_organization_id
        and project.client_id = target_client_id
    )
    and (select private.can_manage_project(target_project_id));
$function$;

revoke all on function private.can_upload_internal_project_file(uuid, uuid, uuid)
  from public, anon, authenticated;

grant execute on function private.can_upload_internal_project_file(uuid, uuid, uuid)
  to authenticated;

create or replace function private.can_upload_client_project_file(
  target_project_id uuid,
  target_client_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    (select private.active_client_id()) = target_client_id
    and (select private.active_client_role()) in ('owner', 'manager')
    and exists (
      select 1
      from public.projects as project
      where project.id = target_project_id
        and project.client_id = target_client_id
    );
$function$;

revoke all on function private.can_upload_client_project_file(uuid, uuid)
  from public, anon, authenticated;

grant execute on function private.can_upload_client_project_file(uuid, uuid)
  to authenticated;

drop policy if exists project_files_storage_insert_internal on storage.objects;

create policy project_files_storage_insert_internal
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'project-files-private'
  and array_length(storage.foldername(name), 1) = 6
  and (storage.foldername(name))[1] = 'organization'
  and (storage.foldername(name))[3] = 'client'
  and (storage.foldername(name))[5] = 'project'
  and (
    select private.can_upload_internal_project_file(
      (storage.foldername(name))[6]::uuid,
      (storage.foldername(name))[2]::uuid,
      (storage.foldername(name))[4]::uuid
    )
  )
);

drop policy if exists project_files_storage_insert_client on storage.objects;

create policy project_files_storage_insert_client
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'project-files-private'
  and array_length(storage.foldername(name), 1) = 6
  and (storage.foldername(name))[1] = 'organization'
  and (storage.foldername(name))[3] = 'client'
  and (storage.foldername(name))[5] = 'project'
  and (
    select private.can_upload_client_project_file(
      (storage.foldername(name))[6]::uuid,
      (storage.foldername(name))[4]::uuid
    )
  )
);
