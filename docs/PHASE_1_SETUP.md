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
   http://localhost:3001
   ```

4. Add this development **Redirect URL**:

   ```text
   http://localhost:3001/auth/callback
   ```

5. For production, set the Site URL to the production application origin and
   add this Redirect URL, replacing the placeholder with the real domain:

   ```text
   https://YOUR_DOMAIN.com/auth/callback
   ```

> **The Site URL, the Redirect URL, and `NEXT_PUBLIC_APP_URL` must all be the
> same origin, including the port.** The recommended reset template below
> builds its link from `{{ .SiteURL }}`, so a Site URL pointing at a port the
> application is not serving sends every recovery link to the wrong place —
> the link either fails to load or lands on a different app. `npm run dev`
> pins this application to port 3001 for exactly this reason (port 3000 is
> left free for the public website and the Playwright E2E servers). If you
> change the port, change all three values together.

> **Supabase reports a rejected recovery link in the URL _fragment_**
> (`#error=access_denied&error_code=otp_expired`). Browsers never send a
> fragment to the server, so an expired, already-consumed, or wrong-flow
> link reaches `/auth/callback` with no parameters at all and is
> indistinguishable from a hand-typed URL. Every recovery dead end
> deliberately ends on the same `?error=invalid_reset_link` page, so in
> development the server log is the only way to tell them apart — look for
> `[auth] password recovery stopped: stage=... reason=...`.

6. Disable public user registration. In the Email provider settings, turn off
   the option that allows new users to sign up.

Public signup must remain disabled for Phase 1. Internal users are created by a
Supabase project administrator and receive an organization membership through
the privileged bootstrap process below.

Password recovery supports two callback handoffs, both routed through the
same `/auth/callback` endpoint:

```text
/auth/forgot-password
->
/auth/callback?token_hash=<hash>&type=recovery&next=/auth/update-password
   (or ?code=<auth_code>&next=/auth/update-password for the PKCE default)
->
/auth/update-password
```

The `next=/auth/update-password` parameter shown in both handoffs above is
accepted but not authoritative: after a successful verification the callback
always continues to `/auth/update-password`, regardless of the `next` value
supplied. A recovery link can never be redirected into `/admin`, `/portal`,
or any other internal route this way.

Set the **Authentication > Email Templates > Reset Password** link to the
`token_hash` handoff below. This is the recommended template: it does not
depend on a `code_verifier` cookie from the browser that requested the
reset, so the recovery link also works when opened in a different browser,
device, or profile.

```html
<h2>Reset your Nexfora password</h2>
<p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=/auth/update-password">Reset password</a></p>
```

The Supabase-default `{{ .ConfirmationURL }}` template (PKCE `?code=`
handoff) is also supported by the callback route, but it only completes
successfully when the reset link is opened in the same browser that
submitted the forgot-password form, because the PKCE exchange needs the
`code_verifier` cookie set at request time. Prefer the `token_hash` template
above unless there is a specific reason to keep the default.

**Trade-off: the direct `token_hash` link can be consumed before the user
clicks it.** Because the recommended template is a plain GET link, anything
that fetches the URL spends the one-time token — not only the user's own
click. Email security scanners and link-prefetching proxies (corporate mail
gateways, some antivirus products, certain webmail "link protection"
features) may issue their own request to a link as soon as the email is
delivered or opened, before the user ever clicks it. If that happens, the
token is already spent and the user's real click lands on the failure path
instead of the update-password page.

- Disable email tracking/click-rewriting for the Reset Password template if
  the mail provider offers it. Rewritten/tracked links are the most common
  source of automated prefetching.
- Before relying on this flow in production, send a real reset email through
  the production mail path and confirm the first human click still succeeds.
  Do not assume a local test proves the production mail path is scanner-free.
- If the target mail environment is known to use aggressive link scanning
  (common with some corporate email gateways), do not treat this direct
  `token_hash` callback as production-ready as-is. Add a user-initiated
  confirmation interstitial (a page that requires a click before the token is
  verified) or move to an OTP-code-entry flow instead of a bare GET link.

This is a known, accepted trade-off for Phase 1, not a resolved issue. Treat
this callback design as unverified for production until prefetch behavior has
actually been tested against the target mail environment.

### Troubleshooting a recovery link that lands on `?error=invalid_reset_link`

In development the server log names the exact dead end. Match it here:

| Logged code / reason | What actually happened | Fix |
| --- | --- | --- |
| `code=pkce_code_verifier_not_found` | The link was opened in a **different browser, profile, or an email client's in-app browser** than the one that submitted the forgot-password form. The PKCE handoff stores a `code_verifier` cookie in that browser and the exchange cannot complete without it. | Open the link in the same browser, or switch to the `token_hash` template above, which has no cookie dependency. |
| `code=bad_code_verifier` | A verifier cookie exists but belongs to a **newer** reset request than the link being clicked. `resetPasswordForEmail` overwrites the single verifier cookie every time, so requesting a second reset silently invalidates the first email. | Request one reset, then click that email. Do not request again while testing an older link. |
| `reason=provider_reported_error` (`error_code=otp_expired`) | Supabase rejected the token: expired, or already spent — including by an email scanner that fetched the link first. | Request a new link; see the prefetch trade-off above. |
| `reason=missing_callback_parameters` | The callback was reached with no query parameters. Usually the fragment case above (`#error=...`), which the server cannot see. | Look at the address bar after the `#` for the real reason. |
| `reason=no_recovery_user_session` | `/auth/update-password` was reached without a verified session — the callback never completed. | Start from a fresh link. |
| `reason=no_recovery_marker` | A session exists but not the signed marker. The marker is HMAC-signed with `SUPABASE_SECRET_KEY`, so **changing that key invalidates every outstanding marker**. | Request a fresh link after any key rotation. |

**The PKCE handoff is same-browser-only by design.** That is not a bug in
this application: `@supabase/ssr` pins `flowType: "pkce"` and cannot be
configured otherwise, so the default `{{ .ConfirmationURL }}` template
(`?code=`) always requires the verifier cookie. If recovery links must work
from any device — which is the normal expectation for password reset —
use the `token_hash` template above instead.
The callback URL must be allow-listed exactly. Do not add a wildcard production
redirect. A successful callback also issues a short-lived, server-signed,
HttpOnly recovery marker. Both the update page and the password mutation
require the verified Supabase user session and this marker.

A successful password update signs out every session for that user (Supabase
`signOut({ scope: "global" })`), not just the browser that performed the
reset — so an attacker who is silently signed in elsewhere is also signed
out. This revokes refresh tokens; it does not instantly invalidate an
already-issued access token before its own short expiry. Session lifetime
configuration in the Supabase Dashboard is what bounds that residual window,
not this application.

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
NEXT_PUBLIC_APP_URL=http://localhost:3001
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
http://localhost:3001/auth/login
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
- [ ] Requesting a reset and opening the link in the same browser completes
      the update and lands on `/auth/login?password_updated=true`.
- [ ] Requesting a reset and opening the link in a different browser, device,
      or profile also completes the update successfully.
- [ ] Invalid and expired recovery links return safely to the forgot-password
      page.
- [ ] Opening `/auth/update-password` without a recovery session returns safely
      to the forgot-password page.
- [ ] A successful password update signs the browser out and shows the login
      confirmation at `/auth/login?password_updated=true`.
- [ ] A successful password update also signs out an unrelated, already-active
      session for that same user on a second device/browser (global
      sign-out). Note that a session's already-issued access token can remain
      valid until its own configured expiry even after this.
- [ ] Opening a real password-recovery email link is the actual first
      consumer of the token in the target mail environment: send a reset
      email through the real production/staging mail path and confirm the
      first human click succeeds, with no prior automated hit having already
      spent the token (a same-day scanner hit surfaces as an unexpected
      `invalid_reset_link` failure on the first real click).
- [ ] Opening a recovery link in a browser that is already signed in as a
      different user results in the session becoming the recovery link's
      verified user, not a merged or mismatched identity, and the flow
      cannot be used to update the previously signed-in user's password.
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
