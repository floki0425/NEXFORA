# Phase 3 leads foundation setup

Phase 3 adds public project inquiry intake and the organization-scoped lead
workspace. It does not add a pipeline board, discovery scheduling, client
conversion, projects, proposals, invoices, payments, file management, the
client portal, AI, email, or SMS.

## Prerequisites

- Complete `docs/PHASE_1_SETUP.md`, including the active `nexfora`
  organization and owner membership.
- Configure the existing `.env.local` values.
- Link the Supabase CLI to the intended non-production project before applying
  or testing migrations.

Never expose `SUPABASE_SECRET_KEY` in a browser bundle or use it for routine
lead operations. Phase 3 uses the cookie-scoped SSR client and RLS.

## Apply the migration

The tracked migration is:

```text
supabase/migrations/20260729000000_phase_3_leads_crm.sql
```

Review the linked project, then run:

```bash
npx supabase db push
```

The migration owns both tables, constraints, indexes, the `updated_at` trigger,
grants, RLS policies, colleague-read policies, and the narrowly scoped public
inquiry function. Do not recreate these objects in the Table Editor.

The public function resolves only the active organization whose slug is
`nexfora`. It does not accept an organization ID, status, assignee, score, or
other privileged field from the browser.

## Regenerate database types

After the migration is applied to the linked project, regenerate the checked
database types:

```bash
npx supabase gen types typescript --linked --schema public > src/types/database.ts
```

Review the diff before committing it. The generated file must include `leads`,
`lead_activities`, and `submit_project_inquiry`.

## Application routes

Public:

```text
/start-a-project
```

Protected:

```text
/admin/leads
/admin/leads/new
/admin/leads/[leadId]
/admin/leads/[leadId]/edit
```

All active internal roles may read leads in their organization.
`super_admin` and `admin` may create, update, assign, change status, and add
notes. Hidden controls are only a usability measure; every mutation
reauthorizes on the server and remains subject to RLS.

## Verification checklist

Use a non-production project and separate test users for each role and
organization.

- [ ] A logged-out request to `/admin/leads` is redirected to login.
- [ ] An inactive member cannot enter the admin workspace.
- [ ] An active member can read leads from their organization.
- [ ] A member cannot read a lead from another organization by changing the
      URL UUID.
- [ ] `project_manager` and `team_member` can read but cannot create, edit,
      assign, change status, or add notes.
- [ ] `super_admin` and `admin` can create and update valid leads.
- [ ] Invalid email, budget range, score, assignee, status, and empty notes are
      rejected.
- [ ] A direct database write cannot assign a profile outside the lead's
      organization.
- [ ] Activity is newest first and cannot be updated or deleted through the
      authenticated role.
- [ ] Public submission creates one `new` website lead and one inquiry
      activity.
- [ ] Public users cannot choose or discover an organization ID, assignee,
      score, or status.
- [ ] Repeated public submissions receive a neutral response and the database
      rate limit prevents unbounded intake for the same normalized email.
- [ ] Search, status, source, assignee, pagination, empty, loading, and error
      states work at mobile and desktop sizes.
- [ ] No browser bundle or response contains `SUPABASE_SECRET_KEY`.

Run the repository checks:

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

Do not proceed to Phase 4 while any authorization, RLS, or validation check is
failing.
