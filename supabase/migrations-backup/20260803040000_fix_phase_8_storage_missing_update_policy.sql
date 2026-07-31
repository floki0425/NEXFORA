-- Fixes a third storage.objects defect in the original Phase 8 migration,
-- confirmed by running the client-owner E2E flow against a real Supabase
-- project after the previous two storage-policy fixes
-- (20260803020000, 20260803030000) were already applied and confirmed
-- working: a real upload through the actual app
-- (uploadPortalProjectFileAction / the internal equivalent) still failed
-- with "new row violates row-level security policy", even for a brand-new
-- object that had never existed before.
--
-- Root cause: both upload actions call
-- `supabase.storage.from(...).upload(path, buffer, { upsert: true, ... })`
-- — `upsert: true` so a client-generated-idempotency-key retry safely
-- reuses the same path. Supabase Storage implements an upsert upload as an
-- INSERT ... ON CONFLICT DO UPDATE, which requires the UPDATE policy (not
-- just INSERT) to also permit the operation, regardless of whether the
-- object already exists. The original migration defined
-- project_files_storage_insert_internal/_client and
-- project_files_storage_select_internal/_client and
-- project_files_storage_delete_internal/_client, but no
-- project_files_storage_update_* policy at all — so every upsert=true
-- upload was denied by RLS with no UPDATE policy to satisfy, confirmed
-- directly: the identical upload succeeds with upsert omitted (a plain
-- INSERT) and fails only when upsert: true is passed.
--
-- Fix: add UPDATE policies mirroring the INSERT policies exactly, reusing
-- the same SECURITY DEFINER helpers
-- (private.can_upload_internal_project_file /
-- private.can_upload_client_project_file) added in 20260803020000 — the
-- authorization rule for "may overwrite this object" is identical to "may
-- create this object" here, since the path's org/client/project segments
-- never change on an upsert-retry, only the object's content.
--
-- This does not edit any already-applied migration — it only adds two new
-- policies that did not exist before.

create policy project_files_storage_update_internal
on storage.objects
for update
to authenticated
using (
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
)
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

create policy project_files_storage_update_client
on storage.objects
for update
to authenticated
using (
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
)
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
