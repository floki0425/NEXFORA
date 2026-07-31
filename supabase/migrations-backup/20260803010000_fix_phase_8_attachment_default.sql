-- Phase 8 follow-up fix: give create_client_revision's trailing
-- p_attachment_file_id parameter a default of null.
--
-- Root cause: the original Phase 8 migration declared this parameter with no
-- default, so Supabase's generated Args type marks it required
-- (`p_attachment_file_id: string`) with no `| null`/`?`. Postgres itself has
-- always accepted NULL for this parameter (the function body already checks
-- `p_attachment_file_id is not null`), but the client could not express "no
-- attachment" without either sending an empty string (which fails uuid
-- casting — "" is not a valid uuid literal) or a null value (which the
-- generated type rejects). Adding a default here — legal via `create or
-- replace function` because p_attachment_file_id is already the function's
-- last/trailing parameter, so no reordering is required and no other
-- parameter's position or type changes — makes the property optional in the
-- next regenerated Args type, so the application layer can omit the
-- argument entirely for "no attachment" instead of sending an invalid or
-- untyped value. This does not change behavior for any existing caller that
-- already supplies a value.
--
-- This migration does not edit the already-applied Phase 8 migration file;
-- it only replaces this one function with an identical body plus the new
-- default, mirroring the existing
-- 20260801010000_fix_send_proposal_version_ambiguity.sql precedent for a
-- small, targeted follow-up fix.

create or replace function public.create_client_revision(
  target_project_id uuid,
  p_page_name text,
  p_section_name text,
  p_title text,
  p_description text,
  p_priority text,
  p_attachment_file_id uuid default null
)
returns table (id uuid, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  resolved_client_id uuid := private.active_client_id();
  resolved_role text := private.active_client_role();
  actor_profile_id uuid := private.current_profile_id();
  target_project public.projects%rowtype;
  normalized_title text := btrim(coalesce(p_title, ''));
  normalized_description text := btrim(coalesce(p_description, ''));
  new_revision_id uuid;
  new_created_at timestamptz;
begin
  if resolved_client_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'An active client membership is required.';
  end if;

  if resolved_role not in ('owner', 'manager') then
    raise exception using
      errcode = 'P0001',
      message = 'You do not have permission to submit revisions.';
  end if;

  if normalized_title = '' or char_length(normalized_title) > 200 then
    raise exception using
      errcode = 'P0001',
      message = 'A title is required.';
  end if;

  if normalized_description = '' or char_length(normalized_description) > 5000
  then
    raise exception using
      errcode = 'P0001',
      message = 'A description is required.';
  end if;

  if p_priority not in ('low', 'medium', 'high', 'urgent') then
    raise exception using
      errcode = 'P0001',
      message = 'Choose a valid priority.';
  end if;

  select project.*
  into target_project
  from public.projects as project
  where project.id = target_project_id
    and project.client_id = resolved_client_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'This project could not be found.';
  end if;

  if p_attachment_file_id is not null and not exists (
    select 1
    from public.project_files as file
    where file.id = p_attachment_file_id
      and file.project_id = target_project_id
      and file.client_id = resolved_client_id
      and file.visibility = 'client'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'The selected attachment is not available.';
  end if;

  insert into public.revisions (
    organization_id,
    client_id,
    project_id,
    submitted_by,
    page_name,
    section_name,
    title,
    description,
    priority,
    status,
    attachment_file_id
  )
  values (
    target_project.organization_id,
    resolved_client_id,
    target_project_id,
    actor_profile_id,
    nullif(btrim(coalesce(p_page_name, '')), ''),
    nullif(btrim(coalesce(p_section_name, '')), ''),
    normalized_title,
    normalized_description,
    p_priority,
    'submitted',
    p_attachment_file_id
  )
  returning revisions.id, revisions.created_at
  into new_revision_id, new_created_at;

  return query select new_revision_id, new_created_at;
end;
$function$;

-- Signature (argument types, in order) is unchanged by adding a default, so
-- the existing revoke/grant below still targets the same function and does
-- not need to be repeated — re-stated here only so this migration is fully
-- self-contained and re-runnable on its own.
revoke all on function public.create_client_revision(
  uuid, text, text, text, text, text, uuid
) from public, anon, authenticated;

grant execute on function public.create_client_revision(
  uuid, text, text, text, text, text, uuid
) to authenticated;
