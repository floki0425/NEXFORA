-- Fixes project_files_storage_select_client (defined in
-- 20260803000000_phase_8_files_revisions.sql), confirmed broken by running
-- the client-owner and client-viewer E2E flows against a real Supabase
-- project: a signed-in client owner's own file download fails with
-- "We couldn't prepare this download. Please try again." — the
-- getPortalFileDownloadUrlAction server action's DOWNLOAD_ERROR path,
-- meaning supabase.storage.createSignedUrl() itself failed.
--
-- Same root cause as 20260803020000_fix_phase_8_storage_insert_policy_rls.sql:
-- this policy's `using` clause includes a plain
-- `exists (select 1 from public.project_files as file where ...)` — a
-- direct, non-SECURITY DEFINER subquery on public.project_files, evaluated
-- under the calling client's own row-level visibility. Portal clients have
-- no direct RLS SELECT on public.project_files at all, by design (see
-- get_client_project_files()'s comment: "there is deliberately no
-- client-facing RLS policy on project_files itself"), so that subquery can
-- never return true for a client session regardless of real ownership.
-- (The 20260803020000 migration's comment flagged this exact policy as
-- "same theoretical shape" but left it unfixed because integration testing
-- had not yet shown a real download failure at the time — the E2E suite,
-- run through the actual server action and browser download flow rather
-- than a direct API call, did.)
--
-- Fix: same pattern as the insert-policy fix — move the ownership/
-- visibility check into a SECURITY DEFINER helper
-- (private.can_download_client_project_file), so the policy body never
-- directly queries an RLS-protected table under the caller's own
-- restricted visibility.
--
-- This does not edit any already-applied migration — it is a new file,
-- dropping and recreating only this one named policy.

create or replace function private.can_download_client_project_file(
  target_storage_path text,
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
    and exists (
      select 1
      from public.project_files as file
      where file.storage_path = target_storage_path
        and file.visibility = 'client'
        and file.client_id = target_client_id
    );
$function$;

revoke all on function private.can_download_client_project_file(text, uuid)
  from public, anon, authenticated;

grant execute on function private.can_download_client_project_file(text, uuid)
  to authenticated;

drop policy if exists project_files_storage_select_client on storage.objects;

create policy project_files_storage_select_client
on storage.objects
for select
to authenticated
using (
  bucket_id = 'project-files-private'
  and array_length(storage.foldername(name), 1) = 6
  and (
    select private.can_download_client_project_file(
      name,
      (storage.foldername(name))[4]::uuid
    )
  )
);
