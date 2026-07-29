-- Phase 5: project management foundation.
-- Adds projects, project team assignment, milestones, and tasks scoped to an
-- organization and owning client. Proposals, invoices, files, revisions,
-- client portal access, and later-phase functionality remain out of scope.

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_id uuid not null,
  name text not null,
  slug text,
  description text,
  status text not null default 'planning',
  priority text not null default 'medium',
  start_date date,
  target_date date,
  completed_at timestamptz,
  project_manager_id uuid,
  progress_percent integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint projects_organization_id_fkey
    foreign key (organization_id)
    references public.organizations (id)
    on delete cascade,
  constraint projects_client_id_fkey
    foreign key (client_id)
    references public.clients (id)
    on delete restrict,
  constraint projects_project_manager_id_fkey
    foreign key (project_manager_id)
    references public.profiles (id)
    on delete set null,
  constraint projects_organization_slug_key
    unique (organization_id, slug),
  constraint projects_name_not_blank
    check (btrim(name) <> '' and char_length(name) <= 160),
  constraint projects_slug_format
    check (slug is null or slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint projects_description_length
    check (description is null or char_length(description) <= 5000),
  constraint projects_status_check
    check (
      status in (
        'planning',
        'design',
        'development',
        'integration',
        'testing',
        'client_review',
        'deployment',
        'completed',
        'on_hold',
        'cancelled'
      )
    ),
  constraint projects_priority_check
    check (priority in ('low', 'medium', 'high', 'urgent')),
  constraint projects_progress_percent_check
    check (progress_percent between 0 and 100),
  constraint projects_dates_check
    check (
      start_date is null
      or target_date is null
      or target_date >= start_date
    )
);

-- A project's client must belong to the same organization as the project.
-- A composite foreign key against a (id, organization_id) uniqueness
-- guarantee enforces this at the database level, not only in RLS or the
-- application layer.
alter table public.clients
  add constraint clients_id_organization_id_key
  unique (id, organization_id);

alter table public.projects
  add constraint projects_client_organization_fkey
  foreign key (client_id, organization_id)
  references public.clients (id, organization_id);

create index projects_organization_updated_idx
  on public.projects (organization_id, updated_at desc);

create index projects_organization_status_idx
  on public.projects (organization_id, status);

create index projects_client_created_idx
  on public.projects (client_id, created_at desc);

create index projects_project_manager_idx
  on public.projects (project_manager_id);

create index projects_target_date_idx
  on public.projects (target_date);

create trigger projects_set_updated_at
before update on public.projects
for each row
execute function private.set_updated_at();

create table public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  user_id uuid not null,
  role text not null default 'member',
  created_at timestamptz not null default now(),

  constraint project_members_project_id_fkey
    foreign key (project_id)
    references public.projects (id)
    on delete cascade,
  constraint project_members_user_id_fkey
    foreign key (user_id)
    references public.profiles (id)
    on delete cascade,
  constraint project_members_project_user_key
    unique (project_id, user_id),
  constraint project_members_role_check
    check (
      role in (
        'project_manager',
        'developer',
        'designer',
        'qa',
        'content',
        'member'
      )
    )
);

create index project_members_project_idx
  on public.project_members (project_id);

create index project_members_user_idx
  on public.project_members (user_id);

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  title text not null,
  description text,
  status text not null default 'pending',
  due_date date,
  sort_order integer not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint milestones_project_id_fkey
    foreign key (project_id)
    references public.projects (id)
    on delete cascade,
  constraint milestones_title_not_blank
    check (btrim(title) <> '' and char_length(title) <= 160),
  constraint milestones_description_length
    check (description is null or char_length(description) <= 5000),
  constraint milestones_status_check
    check (status in ('pending', 'in_progress', 'completed', 'blocked')),
  constraint milestones_sort_order_check
    check (sort_order >= 0)
);

-- Referenced by tasks below so a task's milestone can be proven to belong to
-- the same project as the task itself.
alter table public.milestones
  add constraint milestones_id_project_id_key
  unique (id, project_id);

create index milestones_project_sort_idx
  on public.milestones (project_id, sort_order);

create index milestones_project_status_idx
  on public.milestones (project_id, status);

create trigger milestones_set_updated_at
before update on public.milestones
for each row
execute function private.set_updated_at();

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  milestone_id uuid,
  title text not null,
  description text,
  status text not null default 'todo',
  priority text not null default 'medium',
  assigned_to uuid,
  due_date date,
  sort_order integer not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint tasks_project_id_fkey
    foreign key (project_id)
    references public.projects (id)
    on delete cascade,
  constraint tasks_assigned_to_fkey
    foreign key (assigned_to)
    references public.profiles (id)
    on delete set null,
  constraint tasks_title_not_blank
    check (btrim(title) <> '' and char_length(title) <= 160),
  constraint tasks_description_length
    check (description is null or char_length(description) <= 5000),
  constraint tasks_status_check
    check (status in ('todo', 'in_progress', 'blocked', 'review', 'done')),
  constraint tasks_priority_check
    check (priority in ('low', 'medium', 'high', 'urgent')),
  constraint tasks_sort_order_check
    check (sort_order >= 0)
);

-- A task's milestone (when set) must belong to the same project as the task.
-- MATCH SIMPLE semantics mean a null milestone_id is exempt from the check.
alter table public.tasks
  add constraint tasks_milestone_project_fkey
  foreign key (milestone_id, project_id)
  references public.milestones (id, project_id);

create index tasks_project_sort_idx
  on public.tasks (project_id, sort_order);

create index tasks_project_status_idx
  on public.tasks (project_id, status);

create index tasks_milestone_idx
  on public.tasks (milestone_id);

create index tasks_assigned_idx
  on public.tasks (assigned_to);

create index tasks_due_date_idx
  on public.tasks (due_date);

create trigger tasks_set_updated_at
before update on public.tasks
for each row
execute function private.set_updated_at();

create or replace function private.project_organization_id(
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
  where project.id = target_project_id;
$function$;

revoke all on function private.project_organization_id(uuid)
  from public, anon, authenticated;

grant execute on function private.project_organization_id(uuid)
  to authenticated;

alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.milestones enable row level security;
alter table public.tasks enable row level security;

create policy projects_select_internal_members
on public.projects
for select
to authenticated
using (
  (select private.is_internal_member(projects.organization_id))
);

create policy projects_insert_project_managers
on public.projects
for insert
to authenticated
with check (
  (
    select private.has_internal_role(
      projects.organization_id,
      array['super_admin', 'admin']
    )
  )
  and exists (
    select 1
    from public.clients as client
    where client.id = projects.client_id
      and client.organization_id = projects.organization_id
  )
  and (
    projects.project_manager_id is null
    or exists (
      select 1
      from public.organization_members as manager_membership
      where manager_membership.organization_id = projects.organization_id
        and manager_membership.user_id = projects.project_manager_id
        and manager_membership.status = 'active'
    )
  )
);

create policy projects_update_project_managers
on public.projects
for update
to authenticated
using (
  (
    select private.has_internal_role(
      projects.organization_id,
      array['super_admin', 'admin']
    )
  )
)
with check (
  (
    select private.has_internal_role(
      projects.organization_id,
      array['super_admin', 'admin']
    )
  )
  and (
    projects.project_manager_id is null
    or exists (
      select 1
      from public.organization_members as manager_membership
      where manager_membership.organization_id = projects.organization_id
        and manager_membership.user_id = projects.project_manager_id
        and manager_membership.status = 'active'
    )
  )
);

create policy project_members_select_internal_members
on public.project_members
for select
to authenticated
using (
  (
    select private.is_internal_member(
      private.project_organization_id(project_members.project_id)
    )
  )
);

create policy project_members_insert_project_managers
on public.project_members
for insert
to authenticated
with check (
  (
    select private.has_internal_role(
      private.project_organization_id(project_members.project_id),
      array['super_admin', 'admin']
    )
  )
  and exists (
    select 1
    from public.organization_members as assignee_membership
    where assignee_membership.organization_id
        = private.project_organization_id(project_members.project_id)
      and assignee_membership.user_id = project_members.user_id
      and assignee_membership.status = 'active'
  )
);

create policy project_members_delete_project_managers
on public.project_members
for delete
to authenticated
using (
  (
    select private.has_internal_role(
      private.project_organization_id(project_members.project_id),
      array['super_admin', 'admin']
    )
  )
);

create policy milestones_select_internal_members
on public.milestones
for select
to authenticated
using (
  (
    select private.is_internal_member(
      private.project_organization_id(milestones.project_id)
    )
  )
);

create policy milestones_insert_project_managers
on public.milestones
for insert
to authenticated
with check (
  (
    select private.has_internal_role(
      private.project_organization_id(milestones.project_id),
      array['super_admin', 'admin']
    )
  )
);

create policy milestones_update_project_managers
on public.milestones
for update
to authenticated
using (
  (
    select private.has_internal_role(
      private.project_organization_id(milestones.project_id),
      array['super_admin', 'admin']
    )
  )
)
with check (
  (
    select private.has_internal_role(
      private.project_organization_id(milestones.project_id),
      array['super_admin', 'admin']
    )
  )
);

create policy tasks_select_internal_members
on public.tasks
for select
to authenticated
using (
  (
    select private.is_internal_member(
      private.project_organization_id(tasks.project_id)
    )
  )
);

create policy tasks_insert_project_managers
on public.tasks
for insert
to authenticated
with check (
  (
    select private.has_internal_role(
      private.project_organization_id(tasks.project_id),
      array['super_admin', 'admin']
    )
  )
  and (
    tasks.assigned_to is null
    or exists (
      select 1
      from public.organization_members as assignee_membership
      where assignee_membership.organization_id
          = private.project_organization_id(tasks.project_id)
        and assignee_membership.user_id = tasks.assigned_to
        and assignee_membership.status = 'active'
    )
  )
);

create policy tasks_update_project_managers
on public.tasks
for update
to authenticated
using (
  (
    select private.has_internal_role(
      private.project_organization_id(tasks.project_id),
      array['super_admin', 'admin']
    )
  )
)
with check (
  (
    select private.has_internal_role(
      private.project_organization_id(tasks.project_id),
      array['super_admin', 'admin']
    )
  )
  and (
    tasks.assigned_to is null
    or exists (
      select 1
      from public.organization_members as assignee_membership
      where assignee_membership.organization_id
          = private.project_organization_id(tasks.project_id)
        and assignee_membership.user_id = tasks.assigned_to
        and assignee_membership.status = 'active'
    )
  )
);

revoke all privileges
  on table
    public.projects,
    public.project_members,
    public.milestones,
    public.tasks
  from public, anon, authenticated;

grant select on table public.projects to authenticated;
grant insert (
  organization_id,
  client_id,
  name,
  slug,
  description,
  status,
  priority,
  start_date,
  target_date,
  project_manager_id
) on public.projects to authenticated;
grant update (
  name,
  slug,
  description,
  status,
  priority,
  start_date,
  target_date,
  completed_at,
  project_manager_id
) on public.projects to authenticated;

grant select on table public.project_members to authenticated;
grant insert (project_id, user_id, role) on public.project_members
  to authenticated;
grant delete on public.project_members to authenticated;

grant select on table public.milestones to authenticated;
grant insert (
  project_id,
  title,
  description,
  due_date,
  sort_order
) on public.milestones to authenticated;
grant update (
  title,
  description,
  status,
  due_date,
  sort_order,
  completed_at
) on public.milestones to authenticated;

grant select on table public.tasks to authenticated;
grant insert (
  project_id,
  milestone_id,
  title,
  description,
  priority,
  assigned_to,
  due_date,
  sort_order
) on public.tasks to authenticated;
grant update (
  milestone_id,
  title,
  description,
  status,
  priority,
  assigned_to,
  due_date,
  sort_order,
  completed_at
) on public.tasks to authenticated;

grant all privileges
  on table
    public.projects,
    public.project_members,
    public.milestones,
    public.tasks
  to service_role;
