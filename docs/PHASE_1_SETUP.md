# Phase 1 setup

This guide provisions the authentication and authorization foundation for
NEXFORA OS.

Phase 1 includes only:

- Supabase email/password authentication
- The Nexfora organization
- Application profiles
- Internal organization memberships
- Internal roles
- Server-side authorization
- PostgreSQL Row Level Security (RLS)
- Protected `/admin` access

It does not include leads, CRM, clients, projects, proposals, invoices,
payments, Client Portal functionality, or AI. `/portal` remains unavailable or
placeholder-only until a later phase.

## Prerequisites

- A Supabase account with permission to create and administer a project
- Node.js and npm
- This repository checked out locally
- Access to the deployment environment's secret manager for production

Run commands from the repository root, `nexfora-os/`.

## 1. Create the Supabase project

1. Open the [Supabase Dashboard](https://supabase.com/dashboard).
2. Create a new project in the appropriate Supabase organization.
3. Choose a strong database password and store it in an approved password
   manager. Do not add it to this repository.
4. Choose the region closest to the application's expected users.
5. Wait for project provisioning to finish.
6. Copy the project reference from the project URL or project settings. It is
   used when linking the Supabase CLI.

Use separate Supabase projects for local/staging and production data when the
application moves beyond initial setup.

## 2. Configure Auth

In the Supabase Dashboard:

1. Open **Authentication** and confirm the Email provider is enabled.
2. Open **Authentication > URL Configuration**.
3. Set the development **Site URL** to:

   ```text
   http://localhost:3000
   ```

4. Add this development **Redirect URL**:

   ```text
   http://localhost:3000/auth/callback
   ```

5. For production, set the Site URL to the production application origin and
   add this Redirect URL, replacing the placeholder with the real domain:

   ```text
   https://YOUR_DOMAIN.com/auth/callback
   ```

6. Disable public user registration. In the Email provider settings, turn off
   the option that allows new users to sign up.

Public signup must remain disabled for Phase 1. Internal users are created by a
Supabase project administrator and receive an organization membership through
the privileged bootstrap process below.

Password recovery uses the PKCE flow:

```text
/auth/forgot-password
â†’
/auth/callback?next=/auth/update-password
â†’
/auth/update-password
```

The callback URL must be allow-listed exactly. Do not add a wildcard production
redirect. A successful callback also issues a short-lived, server-signed,
HttpOnly recovery marker. Both the update page and the password mutation
require the verified Supabase user session and this marker.

Supabase's hosted email service has a low development sending limit. A failed
request may return `over_email_send_rate_limit`; wait for the limit to reset or
configure a production SMTP provider under **Authentication > Email**. The
application logs the Supabase Auth status, code, and message to the development
terminal without logging the submitted email, credentials, tokens, keys, or
session. The browser continues to show the same neutral confirmation for every
well-formed email so delivery failures cannot be used to discover accounts.

Dashboard labels can change over time. If the signup toggle is not under the
Email provider, locate the equivalent **Allow new users to sign up** setting
under Authentication settings.

## 3. Add environment variables

From the project's **Connect** dialog or **Settings > API Keys**, copy:

- The Project URL
- A publishable key beginning with `sb_publishable_`
- A secret key beginning with `sb_secret_`

Create `.env.local` in the `nexfora-os/` repository root from `.env.example`,
then set exactly these four variables:

```dotenv
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
SUPABASE_SECRET_KEY=sb_secret_REPLACE_ME
```

Rules:

- Keep `NEXT_PUBLIC_APP_URL` an absolute URL. Use the deployed application URL
  outside local development.
- The publishable key is intentionally available to browser code. Database
  access is still protected by RLS and table privileges.
- `SUPABASE_SECRET_KEY` bypasses RLS. It must remain server-only.
- Never rename the secret with a `NEXT_PUBLIC_` prefix.
- Never paste the secret into client code, URLs, logs, screenshots, support
  messages, or committed files.
- Never commit `.env.local`.
- Restart the development server after changing environment variables.

Add the same variables to the deployment platform's environment settings.
Production and preview environments should use the correct project and URL for
that environment.

## 4. Apply the Phase 1 migration

The Phase 1 migration is:

```text
supabase/migrations/20260727000000_phase_1_identity_authorization.sql
```

### Preferred: Supabase CLI

Authenticate and link this checkout to the project:

```bash
npx supabase@latest login
npx supabase@latest link --project-ref <PROJECT_REF>
```

Review the linked project before applying anything, then push the migration:

```bash
npx supabase@latest db push
```

Confirm that the command targets the intended project before approving it.

### Alternative: Dashboard SQL Editor

If the CLI cannot be used:

1. Open the migration file locally.
2. Copy the entire SQL file without modifying it.
3. Open **SQL Editor** in the intended Supabase project.
4. Run the migration once.
5. Before later using `db push`, link the CLI and mark version
   `20260727000000` as applied with the CLI's migration-repair command. This
   keeps remote migration history aligned with the repository.

```bash
npx supabase@latest migration repair --status applied 20260727000000
```

Do not recreate individual tables manually with the Table Editor. The tracked
migration owns the schema, constraints, helper functions, triggers, grants,
RLS, and policies.

### Verify the schema

In SQL Editor, confirm that all three tables have RLS enabled:

```sql
select
  schemaname,
  tablename,
  rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'organizations',
    'profiles',
    'organization_members'
  )
order by tablename;
```

Every returned row must show `rowsecurity = true`.

Inspect the initial policies:

```sql
select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'organizations',
    'profiles',
    'organization_members'
  )
order by tablename, policyname;
```

The migration also creates private authorization and timestamp helpers. Do not
expose or replace them with editable Auth user metadata.

## 5. Create the first Auth user

Create the owner account from the Dashboard rather than enabling public signup:

1. Open **Authentication > Users**.
2. Choose **Add user** or **Create new user**.
3. Enter the owner's real email address and a strong, unique temporary
   password.
4. Mark the email as confirmed if the Dashboard offers that option and the
   owner has been verified.
5. Create the user.
6. Copy the user's UUID from the user details page.

Do not put the password in SQL, documentation, source control, or chat. Transfer
it through an approved secure channel and change temporary credentials
promptly.

Creating an Auth user does not grant `/admin` access. The user must also have a
profile and an active internal membership.

## 6. Bootstrap Nexfora and the owner membership

Run the following block in the Supabase SQL Editor as a project administrator.
Replace both placeholders before running it:

```sql
do $bootstrap$
declare
  owner_auth_user_id uuid := '<AUTH_USER_UUID>'::uuid;
  owner_profile_id uuid;
  nexfora_organization_id uuid;
begin
  if not exists (
    select 1
    from auth.users
    where id = owner_auth_user_id
  ) then
    raise exception 'The Auth user does not exist.';
  end if;

  insert into public.organizations (
    name,
    slug
  )
  values (
    'Nexfora Digital Innovation',
    'nexfora'
  )
  on conflict (slug) do update
  set name = excluded.name
  returning id into nexfora_organization_id;

  insert into public.profiles (
    auth_user_id,
    full_name
  )
  values (
    owner_auth_user_id,
    '<OWNER_FULL_NAME>'
  )
  on conflict (auth_user_id) do update
  set full_name = excluded.full_name
  returning id into owner_profile_id;

  insert into public.organization_members (
    organization_id,
    user_id,
    role,
    status
  )
  values (
    nexfora_organization_id,
    owner_profile_id,
    'super_admin',
    'active'
  )
  on conflict (organization_id, user_id) do update
  set
    role = excluded.role,
    status = excluded.status;
end
$bootstrap$;
```

This block is intentionally repeatable for the same organization and Auth user.
It must only be run through a privileged administrative database session. The
normal authenticated role has no policy that permits membership creation or
role assignment, so an application user cannot grant themselves a role.

Verify the bootstrap result:

```sql
select
  o.name as organization_name,
  o.slug as organization_slug,
  p.full_name,
  u.email,
  om.role,
  om.status
from public.organization_members as om
join public.organizations as o
  on o.id = om.organization_id
join public.profiles as p
  on p.id = om.user_id
join auth.users as u
  on u.id = p.auth_user_id
where o.slug = 'nexfora';
```

The owner must have role `super_admin` and status `active`.

## 7. Start and validate the application

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000/auth/login
```

Sign in with the owner account. A valid active internal member should reach
`/admin`. Logging out should clear the session and make `/admin` inaccessible.

Run the repository checks:

```bash
npm run lint
npm run typecheck
npm run build
```

All three commands must pass before Phase 1 is considered ready.

## 8. Security and RLS test checklist

Use a non-production Supabase project for destructive or role-boundary tests.
The SQL Editor normally runs with elevated privileges and bypasses RLS; a
successful SQL Editor query alone does not prove that an application user is
authorized.

Verify all of the following:

- [ ] An unauthenticated request to `/admin` redirects to `/auth/login`.
- [ ] Invalid credentials produce a generic authentication error without
      exposing Supabase or database details.
- [ ] A valid password-recovery request reaches the configured email inbox.
- [ ] An unknown recovery email receives the same neutral browser confirmation
      and does not reveal whether an account exists.
- [ ] Invalid and expired recovery links return safely to the forgot-password
      page.
- [ ] Opening `/auth/update-password` without a recovery session returns safely
      to the forgot-password page.
- [ ] A successful password update signs the browser out and shows the login
      confirmation at `/auth/login?password_updated=true`.
- [ ] The owner can sign in and access `/admin`.
- [ ] Logout clears the session, and a direct `/admin` request is denied
      afterward.
- [ ] An Auth user with no profile cannot access `/admin`.
- [ ] An Auth user with a profile but no active organization membership cannot
      access `/admin`.
- [ ] A member with status `suspended` cannot access `/admin`.
- [ ] A member can read only organizations allowed by their active membership.
- [ ] A user cannot read another unrelated organization's rows.
- [ ] Anonymous users cannot read the three Phase 1 tables.
- [ ] Authenticated users cannot insert, update, or delete
      `organization_members`.
- [ ] An authenticated user cannot assign or elevate their own role.
- [ ] The browser bundle and browser network responses never contain
      `SUPABASE_SECRET_KEY`.
- [ ] The application uses the publishable key for cookie-scoped user access,
      so RLS remains active.
- [ ] The secret-key admin client is not used for routine login, profile, or
      membership reads.

To test an authenticated database role from SQL Editor, use a transaction and
replace the UUID with the Auth user's UUID:

```sql
begin;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '<AUTH_USER_UUID>',
    'role', 'authenticated'
  )::text,
  true
);

set local role authenticated;

select id, auth_user_id, full_name
from public.profiles;

select id, name, slug, status
from public.organizations;

select id, organization_id, user_id, role, status
from public.organization_members;

rollback;
```

The result set must be limited by that user's RLS policies. Test users from two
separate organizations to verify cross-organization isolation.

Test the membership write denial in a separate transaction. The statement must
fail with a permission or RLS error:

```sql
begin;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '<AUTH_USER_UUID>',
    'role', 'authenticated'
  )::text,
  true
);

set local role authenticated;

insert into public.organization_members (
  organization_id,
  user_id,
  role,
  status
)
values (
  '<ORGANIZATION_UUID>'::uuid,
  '<PROFILE_UUID>'::uuid,
  'super_admin',
  'active'
);

rollback;
```

If the insert succeeds, do not deploy. Review table grants and RLS policies
before continuing.

## 9. Optional: generate database types

After the CLI is linked and the migration has been applied, generated Supabase
types can replace untyped database access:

```bash
npx supabase@latest gen types typescript --linked --schema public > src/types/database.ts
```

Regenerate the file after every applied schema change. Generated types improve
TypeScript safety, but they do not replace server authorization or RLS.

## Phase 1 security boundaries

- Proxy performs session refresh and optimistic redirects only.
- Protected layouts perform authoritative internal membership checks.
- Every protected Server Action and Route Handler must authorize again.
- Roles come from `organization_members`, not editable user metadata.
- RLS remains the final database boundary for publishable-key requests.
- The secret key bypasses RLS and is reserved for explicitly authorized,
  server-only administrative operations.
- Internal role assignment remains a privileged manual operation in Phase 1.

Do not begin Phase 2 while any authentication, authorization, secret-handling,
or RLS test above is failing.
