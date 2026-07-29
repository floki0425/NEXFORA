# Phase 4 lead conversion and clients setup

Phase 4 adds atomic won-lead conversion and the organization-scoped client
workspace. This implementation completes F-025, F-026, and F-027.

It does not add manual client creation, a dedicated archive confirmation
workflow, projects, tasks, milestones, proposals, billing, files, client
invitations, client portal access, email/SMS automation, or AI.

## Prerequisites

- Complete `docs/PHASE_1_SETUP.md` and
  `docs/PHASE_3_LEADS_SETUP.md`.
- Use an intended non-production Supabase project for migration and security
  verification.
- Confirm the project contains the tracked Phase 1 and Phase 3 migrations.
- Keep the existing `.env.local` values private.

Phase 4 application operations use the cookie-scoped Supabase SSR client and
RLS. They do not use `SUPABASE_SECRET_KEY` or the admin client.

## Apply the migration

The tracked migration is:

```text
supabase/migrations/20260730000000_phase_4_clients_conversion.sql
```

Review the linked project, then run:

```bash
npx supabase db push
```

The migration creates:

- `public.clients`
- the `leads.converted_client_id` foreign key
- documented client constraints and indexes
- the client `updated_at` trigger
- organization-scoped client RLS
- column-limited authenticated update privileges
- `public.convert_lead_to_client(uuid)`

Do not recreate these objects in the Supabase Table Editor. Do not run the
migration against production until it has passed non-production verification.

`client_users` is not created in this phase because client portal
authentication and access are explicitly deferred.

## Conversion transaction

Only an authenticated active `super_admin` or `admin` with exactly one active
internal organization membership can execute the conversion.

The database function:

1. Resolves the actor profile, organization, and role from the authenticated
   session.
2. Locks the source lead row.
3. Confirms the lead belongs to the actor's organization.
4. Returns the existing client when the lead has already been converted.
5. Rejects a lead whose status is not `won`.
6. Creates one client with explicit field mapping.
7. Links `leads.converted_client_id` and sets `converted_at`.
8. Adds the `client_created` lead activity.
9. Returns the client ID and whether it was newly created.

All writes occur inside one PostgreSQL function call. An unhandled failure
rolls back the client insert, lead update, and activity insert together.

The unique `clients.source_lead_id` constraint and lead row lock provide the
database duplicate boundary. Repeated requests return the already-linked
client and cannot create a second one.

## Lead-to-client mapping

| Client field | Lead source |
| --- | --- |
| `organization_id` | Authenticated active membership |
| `source_lead_id` | `leads.id` |
| `business_name` | `leads.business_name`, falling back to `full_name` |
| `contact_name` | `leads.full_name` |
| `email` | Normalized `leads.email` |
| `phone` | `leads.phone` |
| `industry` | `leads.industry` |
| `status` | `active` |

Website, billing address, and internal notes remain empty until an authorized
manager edits the client. The original lead is preserved.

## Regenerate database types

After applying the migration to the linked project, regenerate the checked
Supabase types:

```bash
npx supabase gen types typescript --linked --schema public > src/types/database.ts
```

Review the diff before committing it. The generated file must include:

- `Database["public"]["Tables"]["clients"]`
- the client relationships on `clients` and `leads`
- `Database["public"]["Functions"]["convert_lead_to_client"]`

## Application routes

Protected client routes:

```text
/admin/clients
/admin/clients/[clientId]
/admin/clients/[clientId]/edit
```

Protected conversion confirmation:

```text
/admin/leads/[leadId]/convert
```

All active internal roles may read clients in their organization.
`super_admin` and `admin` may convert eligible leads and edit clients.
`project_manager` and `team_member` have read-only client access.

Every mutation reauthorizes on the server. RLS and restricted table grants
remain the final boundary. Browser-submitted organization and source-lead
ownership fields are never accepted.

## Verification checklist

Use separate users and organizations in a non-production project.

- [ ] Logged-out requests to client routes redirect to login.
- [ ] A user without one active internal membership cannot access clients.
- [ ] Active members can read clients only in their organization.
- [ ] Anonymous table reads are denied.
- [ ] `super_admin` and `admin` can convert a won, unconverted lead.
- [ ] `project_manager` and `team_member` cannot convert a lead.
- [ ] Leads outside the actor's organization cannot be converted or
      discovered.
- [ ] A lead not in `won` status cannot be converted.
- [ ] Conversion creates one client with the documented field mapping.
- [ ] Conversion links the source lead and records `converted_at`.
- [ ] Conversion creates one `client_created` lead activity.
- [ ] Repeating conversion opens the existing client without a duplicate.
- [ ] A forced failure rolls back the client, lead link, and activity writes.
- [ ] Authorized client edits succeed.
- [ ] Client edits cannot change `organization_id` or `source_lead_id`.
- [ ] Direct cross-organization updates are rejected.
- [ ] Invalid email, URL, required text, and status input are rejected.
- [ ] Client list search, status filter, pagination, mobile layout, empty,
      loading, and safe error states work.
- [ ] Client detail, source-lead link, edit, not-found, and success states
      work.
- [ ] No browser bundle, response, or log contains `SUPABASE_SECRET_KEY`,
      sessions, or raw Supabase/SQL errors.

Run the repository checks:

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

Do not proceed to Phase 5 while any authorization, RLS, conversion integrity,
validation, or build check is failing.
