# Phase 5 project management foundation setup

Phase 5 adds organization-scoped projects, project team assignment,
milestones, and tasks. This implementation completes F-030 through F-042 at
foundation scope.

It does not add proposals, contracts, invoices, payments, file uploads,
client portal access, email/SMS automation, support tickets, maintenance
subscriptions, drag-and-drop milestone reordering, or AI. `project_activities`
is intentionally deferred — it is not part of the Phase 5 database list in
`ROADMAP.md`/`DATABASE.md`, and `DATABASE.md` §89 marks it an optional future
table.

## Prerequisites

- Complete `docs/PHASE_1_SETUP.md`, `docs/PHASE_3_LEADS_SETUP.md`, and the
  Phase 4 clients/conversion setup.
- Use an intended non-production Supabase project for migration and security
  verification.
- Confirm the project contains the tracked Phase 1, Phase 3, and Phase 4
  migrations.
- Keep the existing `.env.local` values private.

Phase 5 application operations use the cookie-scoped Supabase SSR client and
RLS. They do not use `SUPABASE_SECRET_KEY` or the admin client.

## Apply the migration

The tracked migration is:

```text
supabase/migrations/20260731000000_phase_5_projects_foundation.sql
```

Review the linked project, then run:

```bash
npx supabase db push --include-all
```

If the CLI's platform login-role endpoint returns HTTP 403 (a known account/
token permission issue, not a code defect), connect with the database
password instead:

```bash
npx supabase db push --dry-run --include-all --password '<DB_PASSWORD>'
npx supabase db push --include-all --password '<DB_PASSWORD>'
```

Never paste the database password into source files, commits, or chat. Do
not attempt to bypass the 403 by hardcoding credentials.

## Objects created

- `public.projects`
- `public.project_members`
- `public.milestones`
- `public.tasks`
- `private.project_organization_id(uuid)` — resolves a project's
  `organization_id` for reuse across milestone/task/member RLS policies
- `clients_id_organization_id_key` — a `(id, organization_id)` uniqueness
  guarantee added to the existing `public.clients` table so a composite
  foreign key can enforce tenant ownership (see below)
- `milestones_id_project_id_key` — the equivalent guarantee on
  `public.milestones` so tasks can be proven to belong to the same project as
  their milestone

Do not recreate these objects in the Supabase Table Editor. Do not run the
migration against production until it has passed non-production
verification.

### Project fields

Only the fields documented in `DATABASE.md` §18–22 were implemented:

```text
projects: id, organization_id, client_id, name, slug, description, status,
priority, start_date, target_date, completed_at, project_manager_id,
progress_percent, created_at, updated_at

project_members: id, project_id, user_id, role, created_at

milestones: id, project_id, title, description, status, due_date,
sort_order, completed_at, created_at, updated_at

tasks: id, project_id, milestone_id, title, description, status, priority,
assigned_to, due_date, sort_order, completed_at, created_at, updated_at
```

`created_by`, `project_type`, `target_end_date`, and `actual_end_date` are
**not** documented fields for `projects` and were deliberately not added.
`slug` exists in the schema (per `DATABASE.md` §19) but is not yet exposed in
the create/edit forms — it is reserved for future readable-URL work and is
never used as a security boundary.

### Statuses

```text
projects.status:   planning, design, development, integration, testing,
                    client_review, deployment, completed, on_hold, cancelled
projects.priority:  low, medium, high, urgent
milestones.status:  pending, in_progress, completed, blocked
tasks.status:        todo, in_progress, blocked, review, done
tasks.priority:      low, medium, high, urgent
project_members.role: project_manager, developer, designer, qa, content, member
```

`USER_FLOWS.md` §26 documents the project stage order as a *suggested* path
and explicitly allows skipping stages ("a simple website may skip
integration"). No rigid linear state machine is enforced beyond database
membership in the list above. The application sets `completed_at` when a
project's status becomes `completed` (and clears it if moved away from
`completed`), and equivalently for `milestones.completed_at` on `completed`
and `tasks.completed_at` on `done`.

## Client-to-project ownership

A project's `client_id` must belong to the same `organization_id` as the
project. This is enforced at the database level, not only in RLS or the
application layer, using a composite foreign key:

```sql
alter table public.clients
  add constraint clients_id_organization_id_key unique (id, organization_id);

alter table public.projects
  add constraint projects_client_organization_fkey
  foreign key (client_id, organization_id)
  references public.clients (id, organization_id);
```

The same technique binds a task's `milestone_id` to the same `project_id` as
the task (`tasks_milestone_project_fkey`, `MATCH SIMPLE` semantics — a task
with no milestone is exempt from the check).

`client_id` and `organization_id` are excluded from the `projects` table's
`UPDATE` column grant, so neither can ever be changed by the authenticated
role after creation — the client relationship is fixed at project creation.

## Role permissions

```text
super_admin, admin        — create/update projects, milestones, tasks;
                             assign/remove team members and project managers
project_manager, team_member — read-only for projects, milestones, tasks,
                                 and team assignments in Phase 5
```

`ROADMAP.md`/`FEATURES.md` do not specify a more granular per-assignment
permission model for V0.1 ("Basic Project Creation... Basic Milestones...
Basic Tasks"). This mirrors the existing Phase 3 (`leads`) and Phase 4
(`clients`) precedent — `super_admin`/`admin` manage the core business
object; other internal roles have read access. Every Server Action
independently re-authorizes; navigation visibility is never treated as
authorization.

## RLS boundaries

- `projects`: `SELECT` for any active internal member of the owning
  organization. `INSERT`/`UPDATE` require `super_admin`/`admin`, plus (a) the
  referenced client belongs to the same organization, and (b) an assigned
  `project_manager_id` (if any) is an active member of that organization.
- `project_members`, `milestones`, `tasks`: scoped through
  `private.project_organization_id(project_id)` — `SELECT` for internal
  members of that organization; write operations require
  `super_admin`/`admin` of that organization. Assigned users
  (`project_members.user_id`, `tasks.assigned_to`) must be active members of
  the same organization.
- Anonymous and unauthenticated requests are denied on all four tables (no
  grants to `anon`).

## Regenerate database types

After applying the migration to the linked project, regenerate the checked
Supabase types:

```bash
npx supabase gen types typescript --linked --schema public > src/types/database.ts
```

If this also returns HTTP 403, the Supabase Personal Access Token or account
permissions need to be fixed manually (Dashboard → Access Tokens / org member
role) — this is an account/token issue, not a schema or code issue. Do not
hand-edit `src/types/database.ts` and do not create a blank or partial file
as a workaround. Review the diff before committing it. The generated file
must include:

- `Database["public"]["Tables"]["projects"]`
- `Database["public"]["Tables"]["project_members"]`
- `Database["public"]["Tables"]["milestones"]`
- `Database["public"]["Tables"]["tasks"]`
- the composite-FK relationships on `projects`, `milestones`, and `tasks`

## Application routes

```text
/admin/projects
/admin/projects/new
/admin/projects/[projectId]
/admin/projects/[projectId]/edit
```

A "Create project" action also appears on `/admin/clients/[clientId]` for
`super_admin`/`admin`, pre-selecting that client — the server action still
independently re-verifies the client belongs to the actor's organization and
never accepts organization ownership from the browser.

Milestones and tasks do not have dedicated routes; they are managed inline on
the project detail page, matching `AGENTS.md`'s documented admin route list
(which has no nested milestone/task routes).

## Milestone and task implementation

Both are implemented per Phase 5 scope (ROADMAP.md explicitly lists
`milestones` and `tasks` under Phase 5's database section, and F-035–F-041):

- Create milestone, update milestone status (F-035, F-036)
- Create task, update task status, task assignment (F-038, F-039, F-040)

Deferred within milestones/tasks:

- Drag-and-drop / manual milestone reordering (F-037, P2) — `sort_order`
  exists in the schema and defaults to append-order, but no reorder UI was
  built.
- Task filters beyond the project detail list (F-041, P2).

Project progress (F-042) is computed at read time as
`done tasks ÷ total tasks` (shown as "No tasks yet" instead of dividing by
zero), not persisted into the cached `progress_percent` column — consistent
with `DATABASE.md` §23's preference for structured-data-driven progress over
manual percentages. The column remains reserved for future caching.

`project_activities` is deferred entirely (see the note at the top of this
document).

## Verification checklist

Use separate users and organizations in a non-production project.

- [ ] Logged-out requests to project routes redirect to login.
- [ ] A user without one active internal membership cannot access projects.
- [ ] Active members can read projects only in their organization.
- [ ] Anonymous table reads are denied on all four tables.
- [ ] `super_admin` and `admin` can create a project for a client in their
      organization.
- [ ] `project_manager` and `team_member` cannot create or edit projects,
      milestones, or tasks.
- [ ] A project cannot be created for another organization's client (rejected
      by both the server action and the composite foreign key).
- [ ] `organization_id` and `client_id` cannot be changed through the edit
      form or a direct update.
- [ ] Cross-organization project reads and updates are rejected.
- [ ] An assigned project manager, task assignee, or project member must be
      an active member of the same organization; cross-organization
      assignment is rejected.
- [ ] A task's milestone (when set) must belong to the same project.
- [ ] Invalid project, milestone, task, and member input is rejected.
- [ ] Project list search, status/client/manager filters, pagination,
      mobile layout, empty, loading, and safe error states work.
- [ ] Project detail, milestones, tasks, team assignment, edit, not-found,
      and success states work.
- [ ] No browser bundle, response, or log contains `SUPABASE_SECRET_KEY`,
      sessions, or raw Supabase/SQL errors.

Run the repository checks:

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

Do not proceed to Phase 6 while any authorization, RLS, ownership,
validation, or build check is failing.
