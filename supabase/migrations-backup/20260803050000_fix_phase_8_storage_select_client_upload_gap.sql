-- Fixes a fourth storage.objects defect, found after
-- 20260803020000 (insert), 20260803030000 (select), and 20260803040000
-- (update) were all applied and confirmed present, yet a real client
-- upload (upsert: true) still failed with "new row violates row-level
-- security policy" — reproduced directly, isolated to the client role only
-- (the equivalent internal upload with upsert: true succeeds).
--
-- Root cause: proven directly — an object uploaded (via the admin client,
-- bypassing RLS) with no matching public.project_files row at all is
-- invisible to the client owner via createSignedUrl(), which returns
-- "Object not found" even though the object physically exists. That is
-- exactly the state of every object between "storage write succeeds" and
-- "create_client_project_file RPC creates its metadata row" in the real
-- upload actions — the two steps are sequential, not atomic. Supabase
-- Storage's upsert-upload path evaluates the SELECT policy to determine
-- whether a conflicting object already exists before deciding whether to
-- insert or update; for a client session this SELECT can never succeed for
-- an as-yet-untracked object, so the upsert path fails structurally,
-- regardless of how correct the INSERT/UPDATE policies are (confirmed:
-- 20260803020000/20260803040000 alone did not fix this). The internal
-- SELECT policy (project_files_storage_select_internal) has no such gap
-- because it only checks org membership, never project_files existence —
-- which is exactly why internal upserts already worked and client ones did
-- not.
--
-- Fix: extend private.can_download_client_project_file to also succeed
-- when the caller could independently have uploaded to this exact path
-- (private.can_upload_client_project_file — the same check the INSERT/
-- UPDATE policies already use), not only when a confirmed
-- visibility='client' project_files row already exists. This does not
-- meaningfully widen access: anyone who can satisfy
-- can_upload_client_project_file for a path already has write access to
-- that exact path and could simply overwrite it with their own content and
-- then read that back, so being able to read/sign it directly is not a new
-- capability, only a removal of an accidental ordering dependency between
-- the storage write and the metadata insert.
--
-- This does not edit any already-applied migration. The policy must be
-- dropped before the function signature can change (adding a
-- target_project_id parameter), and the old two-argument function is
-- dropped afterward so no obsolete overload is left behind.

drop policy if exists project_files_storage_select_client on storage.objects;

drop function if exists private.can_download_client_project_file(text, uuid);

create or replace function private.can_download_client_project_file(
  target_storage_path text,
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
    and (
      exists (
        select 1
        from public.project_files as file
        where file.storage_path = target_storage_path
          and file.visibility = 'client'
          and file.client_id = target_client_id
      )
      or private.can_upload_client_project_file(target_project_id, target_client_id)
    );
$function$;

revoke all on function private.can_download_client_project_file(text, uuid, uuid)
  from public, anon, authenticated;

grant execute on function private.can_download_client_project_file(text, uuid, uuid)
  to authenticated;

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
      (storage.foldername(name))[6]::uuid,
      (storage.foldername(name))[4]::uuid
    )
  )
);
