-- Phase 8: private project files and client revisions.
-- Adds project_files, revisions, and revision_activities (the last one is an
-- additional table, genuinely required for traceability — see the comment
-- above its definition). Invoices, payments, PayMongo, support tickets,
-- maintenance subscriptions, broader notifications infrastructure, and AI
-- generation remain out of scope. Does not modify any already-applied
-- migration.

-- ---------------------------------------------------------------------------
-- projects: one additive composite uniqueness guarantee.
--
-- Phase 5 already added `clients_id_organization_id_key unique (id,
-- organization_id)` on `clients` so that `projects.client_id` could be proven
-- to belong to the same organization as the project. Phase 8 needs the same
-- guarantee one level down: a project_files/revisions row's project_id,
-- organization_id, and client_id must always describe one real, consistent
-- project row. A single tri-column unique index on `projects` lets both new
-- tables enforce that with one composite foreign key each, instead of
-- chaining two separate composite foreign keys the way Phase 5 did.
-- ---------------------------------------------------------------------------

alter table public.projects
  add constraint projects_id_organization_id_client_id_key
  unique (id, organization_id, client_id);

-- ---------------------------------------------------------------------------
-- public.project_files
-- ---------------------------------------------------------------------------

create table public.project_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_id uuid not null,
  project_id uuid not null,
  uploaded_by uuid,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  file_size bigint,
  visibility text not null default 'internal',
  category text,
  created_at timestamptz not null default now(),

  constraint project_files_organization_id_fkey
    foreign key (organization_id)
    references public.organizations (id)
    on delete cascade,
  constraint project_files_client_id_fkey
    foreign key (client_id)
    references public.clients (id)
    on delete cascade,
  constraint project_files_project_id_fkey
    foreign key (project_id)
    references public.projects (id)
    on delete cascade,
  constraint project_files_uploaded_by_fkey
    foreign key (uploaded_by)
    references public.profiles (id)
    on delete set null,
  -- A project_file must never point to a project, client, and organization
  -- that do not belong together (see the composite key added above).
  constraint project_files_project_org_client_fkey
    foreign key (project_id, organization_id, client_id)
    references public.projects (id, organization_id, client_id),
  constraint project_files_storage_path_key
    unique (storage_path),
  -- The server-controlled path shape documented in ARCHITECTURE.md §36 and
  -- DATABASE.md §28:
  -- organization/{organization_id}/client/{client_id}/project/{project_id}/{uuid}-{safe_filename}
  -- This constraint is defense-in-depth, not the only enforcement — the
  -- application never accepts a browser-provided path, and the storage.objects
  -- policies below independently re-derive and check the same segments.
  constraint project_files_storage_path_format
    check (
      storage_path ~
      '^organization/[0-9a-fA-F-]{36}/client/[0-9a-fA-F-]{36}/project/[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}-.+$'
    ),
  constraint project_files_file_name_not_blank
    check (btrim(file_name) <> '' and char_length(file_name) <= 255),
  constraint project_files_mime_type_length
    check (mime_type is null or char_length(mime_type) <= 255),
  -- 26214400 bytes = 25 MiB. Mirrors MAX_FILE_SIZE_BYTES in
  -- src/features/files/constants.ts and the bucket's own file_size_limit
  -- below — all three must be changed together.
  constraint project_files_file_size_check
    check (file_size is null or (file_size > 0 and file_size <= 26214400)),
  constraint project_files_visibility_check
    check (visibility in ('internal', 'client')),
  constraint project_files_category_length
    check (category is null or char_length(category) <= 60)
);

create index project_files_organization_created_idx
  on public.project_files (organization_id, created_at desc);

create index project_files_project_created_idx
  on public.project_files (project_id, created_at desc);

create index project_files_client_idx
  on public.project_files (client_id);

create index project_files_project_visibility_idx
  on public.project_files (project_id, visibility);

-- ---------------------------------------------------------------------------
-- public.revisions
-- ---------------------------------------------------------------------------

create table public.revisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_id uuid not null,
  project_id uuid not null,
  submitted_by uuid,
  page_name text,
  section_name text,
  title text not null,
  description text not null,
  priority text not null default 'medium',
  status text not null default 'submitted',
  assigned_to uuid,
  -- Additional field beyond DATABASE.md's suggested revisions schema.
  -- USER_FLOWS.md §40 and PRODUCT.md §27 both list a "Screenshot / Attachment"
  -- field for revision submission, and this phase's own requirements
  -- (section 8) require it to "use the private file system." A nullable
  -- reference to the already-existing project_files table is the natural,
  -- minimal way to model that relationship without duplicating file storage
  -- concerns onto revisions. `on delete restrict` guarantees a file still
  -- referenced by a revision can never be deleted out from under it.
  attachment_file_id uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint revisions_organization_id_fkey
    foreign key (organization_id)
    references public.organizations (id)
    on delete cascade,
  constraint revisions_client_id_fkey
    foreign key (client_id)
    references public.clients (id)
    on delete cascade,
  constraint revisions_project_id_fkey
    foreign key (project_id)
    references public.projects (id)
    on delete cascade,
  constraint revisions_submitted_by_fkey
    foreign key (submitted_by)
    references public.profiles (id)
    on delete set null,
  constraint revisions_assigned_to_fkey
    foreign key (assigned_to)
    references public.profiles (id)
    on delete set null,
  constraint revisions_attachment_file_id_fkey
    foreign key (attachment_file_id)
    references public.project_files (id)
    on delete restrict,
  constraint revisions_project_org_client_fkey
    foreign key (project_id, organization_id, client_id)
    references public.projects (id, organization_id, client_id),
  constraint revisions_title_not_blank
    check (btrim(title) <> '' and char_length(title) <= 200),
  constraint revisions_description_not_blank
    check (btrim(description) <> '' and char_length(description) <= 5000),
  constraint revisions_page_name_length
    check (page_name is null or char_length(page_name) <= 160),
  constraint revisions_section_name_length
    check (section_name is null or char_length(section_name) <= 160),
  constraint revisions_priority_check
    check (priority in ('low', 'medium', 'high', 'urgent')),
  constraint revisions_status_check
    check (
      status in (
        'submitted',
        'reviewing',
        'in_progress',
        'ready_for_review',
        'approved',
        'rejected',
        'closed'
      )
    )
);

create index revisions_organization_updated_idx
  on public.revisions (organization_id, updated_at desc);

create index revisions_project_created_idx
  on public.revisions (project_id, created_at desc);

create index revisions_client_idx
  on public.revisions (client_id);

create index revisions_organization_status_idx
  on public.revisions (organization_id, status);

create index revisions_organization_priority_idx
  on public.revisions (organization_id, priority);

create index revisions_assigned_idx
  on public.revisions (assigned_to);

create trigger revisions_set_updated_at
before update on public.revisions
for each row
execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- public.revision_activities
--
-- Additional table beyond the two named in this phase's official database
-- scope (project_files, revisions), added under the explicit "required for
-- ... traceability" exception: section 12 requires preserving previous
-- status, new status, actor, timestamp, the required client rejection
-- comment, and assignment changes, and requires that repeated client
-- rejections never silently overwrite the previous request. A single
-- `revisions` row cannot hold more than one point-in-time rejection comment,
-- so history requires an append-only table. `lead_activities` is the closest
-- existing activity model (per section 12's instruction to reuse one when
-- available), but it is foreign-keyed to leads specifically and cannot be
-- reused directly — this table mirrors its exact shape and conventions
-- (organization-scoped, activity_type + title + description + metadata jsonb
-- + created_by + created_at) applied to revisions instead of leads, rather
-- than inventing a new, broader audit system.
-- ---------------------------------------------------------------------------

create table public.revision_activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  revision_id uuid not null,
  activity_type text not null,
  title text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),

  constraint revision_activities_organization_id_fkey
    foreign key (organization_id)
    references public.organizations (id)
    on delete cascade,
  constraint revision_activities_revision_id_fkey
    foreign key (revision_id)
    references public.revisions (id)
    on delete cascade,
  constraint revision_activities_created_by_fkey
    foreign key (created_by)
    references public.profiles (id)
    on delete set null,
  constraint revision_activities_type_check
    check (
      activity_type in (
        'submitted',
        'status_changed',
        'assigned',
        'approved',
        'rejected'
      )
    ),
  constraint revision_activities_title_not_blank
    check (btrim(title) <> '' and char_length(title) <= 200),
  constraint revision_activities_description_length
    check (description is null or char_length(description) <= 3000)
);

create index revision_activities_revision_created_idx
  on public.revision_activities (revision_id, created_at desc);

create index revision_activities_organization_idx
  on public.revision_activities (organization_id);

-- ---------------------------------------------------------------------------
-- private.can_manage_project: shared "may this internal caller act on this
-- project's files/revisions" check, reused by the project_files RPC
-- functions below and by the storage.objects policies, so the role rule
-- documented in docs/PHASE_8_FILES_REVISIONS_SETUP.md exists in exactly one
-- place rather than being copy-pasted across SQL and storage policies.
--
-- super_admin/admin: any project in their organization.
-- project_manager: only a project they manage (project_manager_id) or are a
--   project_members row for.
-- team_member: only a project they are a project_members row for.
-- ---------------------------------------------------------------------------

create or replace function private.can_manage_project(
  target_project_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.projects as project
    inner join public.organization_members as membership
      on membership.organization_id = project.organization_id
    inner join public.profiles as profile
      on profile.id = membership.user_id
    where project.id = target_project_id
      and profile.auth_user_id = (select auth.uid())
      and membership.status = 'active'
      and (
        membership.role in ('super_admin', 'admin')
        or (
          membership.role = 'project_manager'
          and (
            project.project_manager_id = membership.user_id
            or exists (
              select 1
              from public.project_members as pm
              where pm.project_id = project.id
                and pm.user_id = membership.user_id
            )
          )
        )
        or (
          membership.role = 'team_member'
          and exists (
            select 1
            from public.project_members as pm
            where pm.project_id = project.id
              and pm.user_id = membership.user_id
          )
        )
      )
  );
$function$;

revoke all on function private.can_manage_project(uuid)
  from public, anon, authenticated;

grant execute on function private.can_manage_project(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- private.active_client_role: the role half of Phase 7's
-- private.active_client_id(), reused by the write-side client functions and
-- storage policies below to enforce "owner and manager may upload/submit;
-- viewer remains read-only" (this phase's documented decision for
-- unspecified client write permissions).
-- ---------------------------------------------------------------------------

create or replace function private.active_client_role()
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select min(membership.role::text)
  from public.client_users as membership
  inner join public.profiles as profile
    on profile.id = membership.user_id
  inner join public.clients as client
    on client.id = membership.client_id
  where profile.auth_user_id = (select auth.uid())
    and membership.client_id = (select private.active_client_id())
    and membership.status = 'active'
    and client.status = 'active';
$function$;

revoke all on function private.active_client_role()
  from public, anon, authenticated;

grant execute on function private.active_client_role() to authenticated;

-- ---------------------------------------------------------------------------
-- Revision activity triggers: the two activity events that are simple
-- row-level facts (created, assignment changed) are recorded automatically.
-- The three status-changing events (status_changed, approved, rejected) are
-- recorded explicitly inside their own RPC functions further below instead,
-- because "rejected" requires carrying the client's comment text, which does
-- not live in any column on `revisions` — see that table's comment.
-- ---------------------------------------------------------------------------

create or replace function private.record_revision_submitted_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.revision_activities (
    organization_id, revision_id, activity_type, title, created_by
  )
  values (
    new.organization_id, new.id, 'submitted', 'Revision submitted', new.submitted_by
  );

  return new;
end;
$function$;

revoke all on function private.record_revision_submitted_activity()
  from public, anon, authenticated;

create trigger revisions_record_submitted_activity
after insert on public.revisions
for each row
execute function private.record_revision_submitted_activity();

create or replace function private.record_revision_assignment_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.revision_activities (
    organization_id, revision_id, activity_type, title, metadata, created_by
  )
  values (
    new.organization_id,
    new.id,
    'assigned',
    case
      when new.assigned_to is null then 'Assignment removed'
      else 'Revision assigned'
    end,
    pg_catalog.jsonb_build_object(
      'from_assignee', old.assigned_to,
      'to_assignee', new.assigned_to
    ),
    (select private.current_profile_id())
  );

  return new;
end;
$function$;

revoke all on function private.record_revision_assignment_activity()
  from public, anon, authenticated;

create trigger revisions_record_assignment_activity
after update of assigned_to on public.revisions
for each row
when (old.assigned_to is distinct from new.assigned_to)
execute function private.record_revision_assignment_activity();

-- ---------------------------------------------------------------------------
-- public.create_internal_project_file: the only way an internal actor's
-- upload metadata row is created. Re-derives organization_id/client_id from
-- the project itself — organization_id and client_id are never accepted as
-- parameters, so the browser can never submit them. The storage object at
-- p_storage_path is uploaded separately by the caller (see
-- src/features/files/actions.ts); this function only records metadata for a
-- path the caller has already written to (and storage.objects' own INSERT
-- policy independently re-checks the same project-access rule).
-- ---------------------------------------------------------------------------

create or replace function public.create_internal_project_file(
  target_project_id uuid,
  p_file_name text,
  p_storage_path text,
  p_mime_type text,
  p_file_size bigint,
  p_visibility text,
  p_category text
)
returns table (id uuid, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_organization_id uuid;
  actor_profile_id uuid;
  active_membership_count integer;
  target_project public.projects%rowtype;
  normalized_file_name text := btrim(coalesce(p_file_name, ''));
  new_file_id uuid;
  new_created_at timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception using
      errcode = 'P0001',
      message = 'Authentication is required.';
  end if;

  select
    min(membership.organization_id::text)::uuid,
    min(membership.user_id::text)::uuid,
    count(*)::integer
  into actor_organization_id, actor_profile_id, active_membership_count
  from public.organization_members as membership
  inner join public.profiles as profile
    on profile.id = membership.user_id
  inner join public.organizations as organization
    on organization.id = membership.organization_id
  where profile.auth_user_id = (select auth.uid())
    and membership.status = 'active'
    and organization.status = 'active';

  if active_membership_count <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'You do not have permission to upload files.';
  end if;

  select project.*
  into target_project
  from public.projects as project
  where project.id = target_project_id
    and project.organization_id = actor_organization_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'This project could not be found.';
  end if;

  if not (select private.can_manage_project(target_project_id)) then
    raise exception using
      errcode = 'P0001',
      message = 'You do not have permission to upload files to this project.';
  end if;

  if normalized_file_name = '' or char_length(normalized_file_name) > 255 then
    raise exception using
      errcode = 'P0001',
      message = 'A valid file name is required.';
  end if;

  if p_visibility not in ('internal', 'client') then
    raise exception using
      errcode = 'P0001',
      message = 'Choose a valid file visibility.';
  end if;

  if p_file_size is null or p_file_size <= 0 or p_file_size > 26214400 then
    raise exception using
      errcode = 'P0001',
      message = 'This file is too large.';
  end if;

  insert into public.project_files (
    organization_id,
    client_id,
    project_id,
    uploaded_by,
    file_name,
    storage_path,
    mime_type,
    file_size,
    visibility,
    category
  )
  values (
    actor_organization_id,
    target_project.client_id,
    target_project_id,
    actor_profile_id,
    normalized_file_name,
    p_storage_path,
    p_mime_type,
    p_file_size,
    p_visibility,
    nullif(btrim(coalesce(p_category, '')), '')
  )
  returning project_files.id, project_files.created_at
  into new_file_id, new_created_at;

  return query select new_file_id, new_created_at;
end;
$function$;

revoke all on function public.create_internal_project_file(
  uuid, text, text, text, bigint, text, text
) from public, anon, authenticated;

grant execute on function public.create_internal_project_file(
  uuid, text, text, text, bigint, text, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- public.create_client_project_file: visibility is hard-coded to 'client' —
-- never accepted as a parameter — so a client can never choose unrestricted
-- internal visibility. Only 'owner'/'manager' client roles may call this;
-- 'viewer' remains read-only (this phase's documented decision).
-- ---------------------------------------------------------------------------

create or replace function public.create_client_project_file(
  target_project_id uuid,
  p_file_name text,
  p_storage_path text,
  p_mime_type text,
  p_file_size bigint,
  p_category text
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
  normalized_file_name text := btrim(coalesce(p_file_name, ''));
  new_file_id uuid;
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
      message = 'You do not have permission to upload files.';
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

  if normalized_file_name = '' or char_length(normalized_file_name) > 255 then
    raise exception using
      errcode = 'P0001',
      message = 'A valid file name is required.';
  end if;

  if p_file_size is null or p_file_size <= 0 or p_file_size > 26214400 then
    raise exception using
      errcode = 'P0001',
      message = 'This file is too large.';
  end if;

  insert into public.project_files (
    organization_id,
    client_id,
    project_id,
    uploaded_by,
    file_name,
    storage_path,
    mime_type,
    file_size,
    visibility,
    category
  )
  values (
    target_project.organization_id,
    resolved_client_id,
    target_project_id,
    actor_profile_id,
    normalized_file_name,
    p_storage_path,
    p_mime_type,
    p_file_size,
    'client',
    nullif(btrim(coalesce(p_category, '')), '')
  )
  returning project_files.id, project_files.created_at
  into new_file_id, new_created_at;

  return query select new_file_id, new_created_at;
end;
$function$;

revoke all on function public.create_client_project_file(
  uuid, text, text, text, bigint, text
) from public, anon, authenticated;

grant execute on function public.create_client_project_file(
  uuid, text, text, text, bigint, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- public.get_client_project_organization_id: a narrow, purpose-built lookup
-- so the portal upload action can construct the server-controlled storage
-- path (which embeds organization_id) *before* calling
-- create_client_project_file. This is deliberately separate from
-- get_client_projects()/get_client_project_detail(), which intentionally
-- never return organization_id — an organization id on its own identifies
-- nothing sensitive (Nexfora is the only organization in this system), and
-- returning it only from this single-purpose function keeps that Phase 7
-- exclusion intact everywhere else. Returns null uniformly for a
-- nonexistent project or a foreign client's project.
-- ---------------------------------------------------------------------------

create or replace function public.get_client_project_organization_id(
  target_project_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $function$
  select project.organization_id
  from public.projects as project
  where project.id = target_project_id
    and project.client_id = (select private.active_client_id());
$function$;

revoke all on function public.get_client_project_organization_id(uuid)
  from public, anon, authenticated;

grant execute on function public.get_client_project_organization_id(uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- public.get_client_project_files: the only client-facing read path for
-- project_files. Returns visibility='client' files only, and never returns
-- storage_path or uploaded_by — internal metadata and raw paths are never
-- exposed to portal users. Mirrors get_client_projects()'s "no client-facing
-- RLS policy on the base table" design from Phase 7.
-- ---------------------------------------------------------------------------

create or replace function public.get_client_project_files(
  target_project_id uuid
)
returns table (
  id uuid,
  file_name text,
  mime_type text,
  file_size bigint,
  category text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    file.id, file.file_name, file.mime_type, file.file_size, file.category,
    file.created_at
  from public.project_files as file
  where file.project_id = target_project_id
    and file.client_id = (select private.active_client_id())
    and file.visibility = 'client'
  order by file.created_at desc
  limit 100;
$function$;

revoke all on function public.get_client_project_files(uuid)
  from public, anon, authenticated;

grant execute on function public.get_client_project_files(uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- public.get_client_file_for_download: authorizes and resolves a single
-- file's storage_path for the portal signed-download flow. Returns no rows
-- (never an error) for a nonexistent file, a foreign client's file, or an
-- internal-only file — the same "no distinguishing detail" pattern already
-- used by Phase 6/7's token functions, so a modified file id cannot be used
-- to probe whether it exists.
-- ---------------------------------------------------------------------------

create or replace function public.get_client_file_for_download(
  target_file_id uuid
)
returns table (storage_path text, file_name text)
language sql
stable
security definer
set search_path = ''
as $function$
  select file.storage_path, file.file_name
  from public.project_files as file
  where file.id = target_file_id
    and file.client_id = (select private.active_client_id())
    and file.visibility = 'client';
$function$;

revoke all on function public.get_client_file_for_download(uuid)
  from public, anon, authenticated;

grant execute on function public.get_client_file_for_download(uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- public.create_client_revision: organization_id, client_id, project_id, and
-- submitted_by are all server-resolved here, never accepted from the
-- browser. Only 'owner'/'manager' may submit; 'viewer' remains read-only.
-- An optional attachment must already be the client's own visibility='client'
-- file uploaded to this same project — never another client's file, and
-- never an internal-only file.
-- ---------------------------------------------------------------------------

create or replace function public.create_client_revision(
  target_project_id uuid,
  p_page_name text,
  p_section_name text,
  p_title text,
  p_description text,
  p_priority text,
  p_attachment_file_id uuid
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

revoke all on function public.create_client_revision(
  uuid, text, text, text, text, text, uuid
) from public, anon, authenticated;

grant execute on function public.create_client_revision(
  uuid, text, text, text, text, text, uuid
) to authenticated;

-- ---------------------------------------------------------------------------
-- public.get_client_revisions / public.get_client_revision_activities: the
-- portal's read paths, mirroring get_client_project_files' "no client-facing
-- RLS policy on the base table" design.
-- ---------------------------------------------------------------------------

create or replace function public.get_client_revisions(
  target_project_id uuid
)
returns table (
  id uuid,
  page_name text,
  section_name text,
  title text,
  description text,
  priority text,
  status text,
  attachment_file_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  resolved_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    revision.id, revision.page_name, revision.section_name, revision.title,
    revision.description, revision.priority, revision.status,
    revision.attachment_file_id, revision.created_at, revision.updated_at,
    revision.resolved_at
  from public.revisions as revision
  where revision.project_id = target_project_id
    and revision.client_id = (select private.active_client_id())
  order by revision.created_at desc
  limit 100;
$function$;

revoke all on function public.get_client_revisions(uuid)
  from public, anon, authenticated;

grant execute on function public.get_client_revisions(uuid) to authenticated;

create or replace function public.get_client_revision_activities(
  target_revision_id uuid
)
returns table (
  activity_type text,
  title text,
  description text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select activity.activity_type, activity.title, activity.description,
    activity.created_at
  from public.revision_activities as activity
  inner join public.revisions as revision
    on revision.id = activity.revision_id
  where activity.revision_id = target_revision_id
    and revision.client_id = (select private.active_client_id())
  order by activity.created_at asc
  limit 200;
$function$;

revoke all on function public.get_client_revision_activities(uuid)
  from public, anon, authenticated;

grant execute on function public.get_client_revision_activities(uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- public.transition_revision_status: the only way the internal-driven part
-- of the workflow moves forward. Only the five documented forward/reopen
-- edges are allowed; ready_for_review -> approved/rejected are deliberately
-- excluded here (client-only, via the two functions below).
--
-- super_admin/admin: any revision in their organization.
-- project_manager: only for a project they manage/are assigned to.
-- team_member: only a revision currently assigned to them.
-- ---------------------------------------------------------------------------

create or replace function public.transition_revision_status(
  target_revision_id uuid,
  p_new_status text
)
returns table (status text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_organization_id uuid;
  actor_profile_id uuid;
  actor_role text;
  active_membership_count integer;
  target_revision public.revisions%rowtype;
  is_authorized boolean;
  is_allowed_transition boolean;
begin
  if (select auth.uid()) is null then
    raise exception using
      errcode = 'P0001',
      message = 'Authentication is required.';
  end if;

  if p_new_status not in (
    'reviewing', 'in_progress', 'ready_for_review', 'closed'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'This status cannot be set directly.';
  end if;

  select
    min(membership.organization_id::text)::uuid,
    min(membership.user_id::text)::uuid,
    min(membership.role),
    count(*)::integer
  into
    actor_organization_id, actor_profile_id, actor_role,
    active_membership_count
  from public.organization_members as membership
  inner join public.profiles as profile
    on profile.id = membership.user_id
  inner join public.organizations as organization
    on organization.id = membership.organization_id
  where profile.auth_user_id = (select auth.uid())
    and membership.status = 'active'
    and organization.status = 'active';

  if active_membership_count <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'You do not have permission to update this revision.';
  end if;

  select revision.*
  into target_revision
  from public.revisions as revision
  where revision.id = target_revision_id
    and revision.organization_id = actor_organization_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'This revision could not be found.';
  end if;

  is_authorized := (
    actor_role in ('super_admin', 'admin')
    or (
      actor_role in ('project_manager', 'team_member')
      and (select private.can_manage_project(target_revision.project_id))
      and (
        actor_role = 'project_manager'
        or target_revision.assigned_to = actor_profile_id
      )
    )
  );

  if not is_authorized then
    raise exception using
      errcode = 'P0001',
      message = 'You do not have permission to update this revision.';
  end if;

  is_allowed_transition := (
    (target_revision.status = 'submitted' and p_new_status = 'reviewing')
    or (target_revision.status = 'reviewing' and p_new_status = 'in_progress')
    or (
      target_revision.status = 'in_progress'
      and p_new_status = 'ready_for_review'
    )
    or (target_revision.status = 'rejected' and p_new_status = 'in_progress')
    or (target_revision.status = 'approved' and p_new_status = 'closed')
  );

  if not is_allowed_transition then
    raise exception using
      errcode = 'P0001',
      message = 'That status change is not allowed from the current status.';
  end if;

  update public.revisions
  set
    status = p_new_status,
    resolved_at = case
      when p_new_status = 'closed' then pg_catalog.now()
      else resolved_at
    end
  where id = target_revision_id;

  insert into public.revision_activities (
    organization_id, revision_id, activity_type, title, metadata, created_by
  )
  values (
    actor_organization_id,
    target_revision_id,
    'status_changed',
    'Status changed to ' || replace(p_new_status, '_', ' '),
    pg_catalog.jsonb_build_object(
      'from_status', target_revision.status,
      'to_status', p_new_status
    ),
    actor_profile_id
  );

  return query select p_new_status;
end;
$function$;

revoke all on function public.transition_revision_status(uuid, text)
  from public, anon, authenticated;

grant execute on function public.transition_revision_status(uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- public.approve_revision: client-only. Idempotent — an already-approved
-- revision returns success with already_approved = true instead of erroring
-- or creating a duplicate activity.
-- ---------------------------------------------------------------------------

create or replace function public.approve_revision(
  target_revision_id uuid
)
returns table (status text, already_approved boolean)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  resolved_client_id uuid := private.active_client_id();
  resolved_role text := private.active_client_role();
  actor_profile_id uuid := private.current_profile_id();
  target_revision public.revisions%rowtype;
begin
  if resolved_client_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'An active client membership is required.';
  end if;

  if resolved_role not in ('owner', 'manager') then
    raise exception using
      errcode = 'P0001',
      message = 'You do not have permission to review this revision.';
  end if;

  select revision.*
  into target_revision
  from public.revisions as revision
  where revision.id = target_revision_id
    and revision.client_id = resolved_client_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'This revision could not be found.';
  end if;

  if target_revision.status = 'approved' then
    return query select 'approved'::text, true;
    return;
  end if;

  if target_revision.status <> 'ready_for_review' then
    raise exception using
      errcode = 'P0001',
      message = 'Only a revision that is ready for review can be approved.';
  end if;

  update public.revisions
  set status = 'approved', resolved_at = pg_catalog.now()
  where id = target_revision_id;

  insert into public.revision_activities (
    organization_id, revision_id, activity_type, title, metadata, created_by
  )
  values (
    target_revision.organization_id,
    target_revision_id,
    'approved',
    'Client approved the revision',
    pg_catalog.jsonb_build_object(
      'from_status', target_revision.status,
      'to_status', 'approved'
    ),
    actor_profile_id
  );

  return query select 'approved'::text, false;
end;
$function$;

revoke all on function public.approve_revision(uuid)
  from public, anon, authenticated;

grant execute on function public.approve_revision(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- public.request_revision_changes: client-only. A non-empty comment is
-- required and is stored only in revision_activities.description — never on
-- the revisions row itself — so an earlier rejection's comment is never
-- overwritten by a later one; both remain in the activity history.
-- ---------------------------------------------------------------------------

create or replace function public.request_revision_changes(
  target_revision_id uuid,
  p_comment text
)
returns table (status text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  resolved_client_id uuid := private.active_client_id();
  resolved_role text := private.active_client_role();
  actor_profile_id uuid := private.current_profile_id();
  target_revision public.revisions%rowtype;
  normalized_comment text := btrim(coalesce(p_comment, ''));
begin
  if resolved_client_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'An active client membership is required.';
  end if;

  if resolved_role not in ('owner', 'manager') then
    raise exception using
      errcode = 'P0001',
      message = 'You do not have permission to review this revision.';
  end if;

  if normalized_comment = '' or char_length(normalized_comment) > 3000 then
    raise exception using
      errcode = 'P0001',
      message = 'Please describe the changes you would like to request.';
  end if;

  select revision.*
  into target_revision
  from public.revisions as revision
  where revision.id = target_revision_id
    and revision.client_id = resolved_client_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'This revision could not be found.';
  end if;

  if target_revision.status <> 'ready_for_review' then
    raise exception using
      errcode = 'P0001',
      message =
        'Only a revision that is ready for review can be sent back for changes.';
  end if;

  update public.revisions
  set status = 'rejected'
  where id = target_revision_id;

  insert into public.revision_activities (
    organization_id, revision_id, activity_type, title, description,
    metadata, created_by
  )
  values (
    target_revision.organization_id,
    target_revision_id,
    'rejected',
    'Client requested changes',
    normalized_comment,
    pg_catalog.jsonb_build_object(
      'from_status', target_revision.status,
      'to_status', 'rejected'
    ),
    actor_profile_id
  );

  return query select 'rejected'::text;
end;
$function$;

revoke all on function public.request_revision_changes(uuid, text)
  from public, anon, authenticated;

grant execute on function public.request_revision_changes(uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.project_files enable row level security;
alter table public.revisions enable row level security;
alter table public.revision_activities enable row level security;

-- project_files: internal members of the owning organization may read both
-- internal and client-visible files (section 5). Portal users never get a
-- policy here at all — every client-portal read/write goes through the
-- SECURITY DEFINER functions above, which is what makes "portal users must
-- never discover internal metadata" true regardless of how the row is
-- queried.
create policy project_files_select_internal_members
on public.project_files
for select
to authenticated
using (
  (select private.is_internal_member(project_files.organization_id))
);

-- No INSERT/UPDATE/DELETE grant/policy exists for `authenticated` on
-- project_files: every mutation happens exclusively through
-- create_internal_project_file / create_client_project_file, which bypass
-- RLS as the table owner. This phase does not implement file deletion or
-- visibility editing (see docs/PHASE_8_FILES_REVISIONS_SETUP.md).

revoke all privileges on table public.project_files
  from public, anon, authenticated;

grant select on table public.project_files to authenticated;

grant all privileges on table public.project_files to service_role;

-- revisions: internal members of the owning organization may read every
-- revision. Only `assigned_to` is ever directly updatable by the
-- authenticated role — status changes always go through the three RPC
-- functions above, which is what makes "browser cannot update revision
-- status directly outside allowed actions" true. team_member is
-- deliberately excluded from this policy: they may update the status of a
-- revision assigned to them (via transition_revision_status), but may not
-- reassign it.
create policy revisions_select_internal_members
on public.revisions
for select
to authenticated
using (
  (select private.is_internal_member(revisions.organization_id))
);

create policy revisions_update_assignment
on public.revisions
for update
to authenticated
using (
  (
    select private.has_internal_role(
      revisions.organization_id,
      array['super_admin', 'admin']
    )
  )
  or (
    (
      select private.has_internal_role(
        revisions.organization_id,
        array['project_manager']
      )
    )
    and exists (
      select 1
      from public.projects as project
      where project.id = revisions.project_id
        and (
          project.project_manager_id = (select private.current_profile_id())
          or exists (
            select 1
            from public.project_members as pm
            where pm.project_id = project.id
              and pm.user_id = (select private.current_profile_id())
          )
        )
    )
  )
)
with check (
  (
    (
      select private.has_internal_role(
        revisions.organization_id,
        array['super_admin', 'admin']
      )
    )
    or (
      (
        select private.has_internal_role(
          revisions.organization_id,
          array['project_manager']
        )
      )
      and exists (
        select 1
        from public.projects as project
        where project.id = revisions.project_id
          and (
            project.project_manager_id
              = (select private.current_profile_id())
            or exists (
              select 1
              from public.project_members as pm
              where pm.project_id = project.id
                and pm.user_id = (select private.current_profile_id())
            )
          )
      )
    )
  )
  and (
    revisions.assigned_to is null
    or exists (
      select 1
      from public.organization_members as assignee_membership
      where assignee_membership.organization_id = revisions.organization_id
        and assignee_membership.user_id = revisions.assigned_to
        and assignee_membership.status = 'active'
    )
  )
);

revoke all privileges on table public.revisions
  from public, anon, authenticated;

grant select on table public.revisions to authenticated;
grant update (assigned_to) on public.revisions to authenticated;

grant all privileges on table public.revisions to service_role;

-- revision_activities: read-only for internal organization members. No
-- portal-facing policy — client reads go through
-- get_client_revision_activities(). No INSERT/UPDATE/DELETE grant to
-- authenticated at all: only the triggers and RPC functions above (all
-- SECURITY DEFINER, running as the table owner) ever write to this table,
-- which is what keeps it append-only in practice.
create policy revision_activities_select_internal_members
on public.revision_activities
for select
to authenticated
using (
  (select private.is_internal_member(revision_activities.organization_id))
);

revoke all privileges on table public.revision_activities
  from public, anon, authenticated;

grant select on table public.revision_activities to authenticated;

grant all privileges on table public.revision_activities to service_role;

-- ---------------------------------------------------------------------------
-- Private storage bucket
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-files-private',
  'project-files-private',
  false,
  26214400,
  array[
    'image/png', 'image/jpeg', 'image/webp', 'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'application/zip'
  ]::text[]
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- storage.objects policies.
--
-- The object path is always
-- organization/{organization_id}/client/{client_id}/project/{project_id}/{uuid}-{filename}
-- (6 folder segments via storage.foldername(name)). Every policy below
-- re-derives the embedded ids and cross-checks them against a real
-- `projects` row and the caller's actual database-level access — folder
-- naming alone is never trusted as the security boundary.
-- ---------------------------------------------------------------------------

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
  and exists (
    select 1
    from public.projects as project
    where project.id = (storage.foldername(name))[6]::uuid
      and project.organization_id = (storage.foldername(name))[2]::uuid
      and project.client_id = (storage.foldername(name))[4]::uuid
  )
  and (
    select private.can_manage_project((storage.foldername(name))[6]::uuid)
  )
);

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
  and (storage.foldername(name))[4]::uuid = (select private.active_client_id())
  and (select private.active_client_role()) in ('owner', 'manager')
  and exists (
    select 1
    from public.projects as project
    where project.id = (storage.foldername(name))[6]::uuid
      and project.client_id = (storage.foldername(name))[4]::uuid
  )
);

create policy project_files_storage_select_internal
on storage.objects
for select
to authenticated
using (
  bucket_id = 'project-files-private'
  and array_length(storage.foldername(name), 1) = 6
  and (select private.is_internal_member((storage.foldername(name))[2]::uuid))
);

create policy project_files_storage_select_client
on storage.objects
for select
to authenticated
using (
  bucket_id = 'project-files-private'
  and array_length(storage.foldername(name), 1) = 6
  and (storage.foldername(name))[4]::uuid = (select private.active_client_id())
  and exists (
    select 1
    from public.project_files as file
    where file.storage_path = storage.objects.name
      and file.visibility = 'client'
      and file.client_id = (select private.active_client_id())
  )
);

-- Delete policies exist only to support the "storage upload succeeded but
-- metadata insert failed" cleanup path (see
-- src/features/files/actions.ts) — this phase does not build a general
-- file-deletion feature or UI (section 13).
create policy project_files_storage_delete_internal
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'project-files-private'
  and array_length(storage.foldername(name), 1) = 6
  and (
    select private.can_manage_project((storage.foldername(name))[6]::uuid)
  )
);

create policy project_files_storage_delete_client
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'project-files-private'
  and array_length(storage.foldername(name), 1) = 6
  and (storage.foldername(name))[4]::uuid = (select private.active_client_id())
  and (select private.active_client_role()) in ('owner', 'manager')
);
