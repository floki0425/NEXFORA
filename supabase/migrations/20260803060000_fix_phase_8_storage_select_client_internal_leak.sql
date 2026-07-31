-- Fixes a security regression introduced by
-- 20260803050000_fix_phase_8_storage_select_client_upload_gap.sql, caught
-- by the existing integration test suite immediately after that migration
-- was applied: "a client cannot obtain a signed URL for an
-- internal-visibility file" started failing — a client could now read an
-- internal-only file that already has a public.project_files row, which
-- must never happen.
--
-- Root cause: 20260803050000's fix let
-- private.can_download_client_project_file succeed whenever the caller
-- could independently have uploaded to that exact path
-- (private.can_upload_client_project_file), to close the gap where a
-- brand-new object has no project_files row yet at upload time. But
-- can_upload_client_project_file only checks "is this caller an
-- owner/manager of the project this path encodes" — it does not know or
-- care about any SPECIFIC file's visibility, because for a genuinely new
-- upload there is no file row to check yet. That is exactly right for a
-- brand-new path, but wrong once a project_files row already exists for
-- that exact storage_path with visibility = 'internal': the write-
-- authorization branch does not distinguish "no metadata row exists yet"
-- from "a metadata row exists and says this is not mine to see."
--
-- Fix: only allow the write-authorization branch to grant visibility when
-- literally no public.project_files row exists yet for that exact
-- storage_path (a true, momentary, in-flight upload). The moment any row
-- exists for that path — client-visible or internal — visibility is
-- decided solely by that row's own visibility/client_id, never by
-- can_upload_client_project_file. This preserves the
-- 20260803050000 fix for the upload-time gap while closing the leak: an
-- existing internal-visibility row now always fails the
-- "not exists (select 1 from project_files where storage_path = ...)"
-- check, so it can never fall through to the write-authorization branch.
--
-- This does not edit either already-applied migration above — only the
-- function body changes (create or replace, same 3-argument signature, so
-- no policy/grant changes are needed).

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
      or (
        not exists (
          select 1
          from public.project_files as file
          where file.storage_path = target_storage_path
        )
        and private.can_upload_client_project_file(target_project_id, target_client_id)
      )
    );
$function$;
