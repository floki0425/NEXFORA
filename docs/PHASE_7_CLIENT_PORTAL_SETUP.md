# Phase 7 client portal setup

Phase 7 adds client invitations, client portal membership, portal
authentication, and a narrowly scoped read-only client-facing surface for
projects and milestones. This implementation covers F-059 through F-063 at
V0.2 scope.

It does not add project file uploads, file downloads, revision submission or
management, invoices, payments, PayMongo, support tickets, maintenance
subscriptions, notifications infrastructure beyond the invitation email, or
AI generation. Tasks are also never exposed to the client portal — no phase
has defined a client-visible boundary for them.

## Prerequisites

- Complete Phases 1–6 (`docs/PHASE_1_SETUP.md`, `docs/PHASE_4_CLIENTS_SETUP.md`,
  `docs/PHASE_5_PROJECTS_SETUP.md`, `docs/PHASE_6_PROPOSALS_SETUP.md`).
- Use an intended non-production Supabase project for migration and security
  verification.
- Keep the existing `.env.local` values private.

Phase 7 internal admin operations (inviting/resending/revoking) use the
cookie-scoped Supabase SSR client and RLS, same as every prior phase. The
client portal's own reads (dashboard, projects, project detail) also use the
cookie-scoped client, but never read `clients`/`projects`/`milestones`
directly — see "Client-safe access design" below. The one deliberately
narrow exception is onboarding a **brand-new** invited client Auth user,
which requires the admin (service-role) client — see "Auth onboarding
design" below.

## Apply the migration

The tracked migration is:

```text
supabase/migrations/20260802000000_phase_7_client_portal.sql
```

It does not edit any already-applied migration. Review the linked project,
then run:

```bash
npx supabase db push --include-all
```

If the CLI's platform login-role endpoint returns HTTP 403 (the same known
account/token permission issue documented in `PHASE_6_PROPOSALS_SETUP.md`,
not a code defect), connect with the database password instead:

```bash
npx supabase db push --dry-run --include-all --password '<DB_PASSWORD>'
npx supabase db push --include-all --password '<DB_PASSWORD>'
```

Never paste the database password into source files, commits, or chat.

## Tables and functions created

- `public.client_users`
- `public.client_invitations`
- `private.active_client_id()` — internal helper, never callable from the
  app directly (the `private` schema is not in `config.toml`'s exposed
  `schemas` list; used only from inside the `public.*` functions below).
- `public.get_active_client_membership()` — the sole "who is this portal
  user" gateway.
- `public.get_client_projects()` — bounded, client-safe project list.
- `public.get_client_project_detail(target_project_id)` — client-safe
  project detail + milestones.
- `public.create_or_resend_client_invitation(target_client_id, p_email,
  p_role, p_expires_at, p_token_hash)` — the atomic invite/resend
  transaction.
- `public.get_client_invitation_by_token(p_token_hash)` — secure,
  pre-authentication invitation preview.
- `public.accept_client_invitation(p_token_hash)` — the atomic acceptance
  transaction.
- `public.revoke_client_invitation(target_invitation_id)`.

### Additional fields/indexes beyond DATABASE.md's documented schema

- `client_invitations_pending_unique` — a partial unique index on
  `(client_id, email) where status = 'pending'`, not a column. This is what
  makes "at most one pending invitation per client+email" and safe,
  idempotent resend (`ON CONFLICT ... DO UPDATE`) possible without extra
  bookkeeping columns. No `organization_id` column was added to either
  table — isolation is enforced via the `client_id → clients.organization_id`
  join in RLS and inside the functions, exactly like `proposal_items`
  already does it.
- `token_hash` format check (`^[0-9a-f]{64}$`) and the email-format check on
  `client_invitations.email` mirror `proposal_access_tokens`/`clients`
  exactly.
- `client_invitations_accepted_at_check`: `(status = 'accepted') =
  (accepted_at is not null)` — the same paired-boolean-equivalence pattern
  `proposals_proposal_number_presence_check` already uses.

No other fields were invented. `client_users` is exactly `id, client_id,
user_id, role, status, created_at`; `client_invitations` is exactly `id,
client_id, email, role, token_hash, status, expires_at, accepted_at,
created_by, created_at`.

## Client roles and statuses

```text
owner, manager, viewer
```

`client_users.status`: `active | invited | suspended`. This phase's
`accept_client_invitation()` always inserts rows directly as `active` —
`invited` remains a valid, documented status value for schema completeness
and future use, not exercised by this phase (no code path pre-creates a row
before acceptance).

## Invitation statuses

```text
pending → accepted
pending → expired (lazily, by expires_at — no cron job flips this)
pending → revoked
```

Same pattern proposals already use for `valid_until`: nothing eagerly
transitions a row to `expired`; every read path (`get_client_invitation_by_
token`, `accept_client_invitation`) independently checks `expires_at >
now()` so a stale row can never be accepted regardless of its stored status.

## Invitation-token design

Identical shape to the Phase 6 proposal access token, in a shared location
since both the admin-side and portal-side features need to hash identically:

1. On invite (and on resend), the server generates a 256-bit random token
   (`crypto.randomBytes(32)`, `src/lib/tokens/client-invitation-token.ts`),
   computes its SHA-256 hex hash, and passes only the hash to
   `create_or_resend_client_invitation`. The raw token is embedded in the
   emailed link (`{NEXT_PUBLIC_APP_URL}/portal/invitations/accept/{rawToken}`)
   and never persisted.
2. `client_invitations.token_hash` is unique and format-checked. The table
   has no grants to `anon` and no policy at all for `anon` — it is only ever
   read through `get_client_invitation_by_token`, a `SECURITY DEFINER`
   function, so raw token-hash scanning via broad table reads is impossible.
3. Resending calls the same `create_or_resend_client_invitation` function,
   which rotates `token_hash`/`expires_at` on the existing pending row via
   `ON CONFLICT (client_id, email) WHERE status = 'pending' DO UPDATE`. The
   previously emailed token stops matching the instant the row's hash
   changes — no separate revoke step is needed, and at most one pending
   invitation per client+email can ever exist.
4. Invalid, expired, and revoked tokens all return the exact same generic
   result from both `get_client_invitation_by_token` and
   `accept_client_invitation` — no distinguishing detail, matching the
   proposal token functions' precedent.

## Auth onboarding design

Public signup remains disabled (Phase 1). No new public self-registration
endpoint was added, and no Supabase-sent invite/confirmation email is used —
this phase's own Resend email is the only email a client ever receives.
Flow, driven entirely by the one `client_invitations` token:

1. **Invite** (`inviteClientUserAction`): validates input, calls
   `create_or_resend_client_invitation`, sends one Resend email containing
   the accept link.
2. **Open the link** (`/portal/invitations/accept/[token]`, public): the
   server component hashes the token and calls
   `get_client_invitation_by_token` — works with or without an existing
   session.
3. If a session already exists whose email matches the invitation, only a
   confirm button is shown; the plain form action
   (`confirmAcceptInvitationAction`) calls `accept_client_invitation`
   directly.
4. Otherwise a form asks for a password (+ full name, in "create" mode).
   `acceptInvitationAction` first tries `createAdminClient().auth.admin.
   createUser({ email, password, email_confirm: true })`:
   - **New account**: also inserts the `profiles` row via the same admin
     client (there is no `INSERT` grant on `profiles` for `authenticated` —
     never has been, since Phase 1), then signs in via the regular SSR
     client, then calls `accept_client_invitation`. `email_confirm: true` is
     set because clicking the secure, single-use invitation link already
     proves control of the email address — a second Supabase confirmation
     email would be redundant.
   - **Existing account** (`createUser` returns the `email_exists` error
     code): the action reports back so the form re-renders as "sign in"
     instead (password only), then proceeds identically once signed in.

   Both branches converge on the same `accept_client_invitation` call, so
   membership creation has exactly one, idempotent source of truth. The
   admin client is used **only** for this one provisioning step — never for
   ordinary portal reads, and every field passed to it is re-derived from
   the already-validated invitation row, never taken directly from
   arbitrary browser input.

## Internal invitation permissions

```text
super_admin, admin        — create, resend, and revoke client invitations
project_manager, team_member — read-only visibility (pending invitations
                               and portal members on the client detail page)
```

This mirrors `CLIENT_MANAGER_ROLES` already used for editing `clients`
(Phase 4) — no new permission tier was invented. Every mutation is
re-authorized inside its `SECURITY DEFINER` function independently of
whether the "Invite client" form is even rendered; navigation/UI visibility
is never treated as authorization.

## Client isolation path

```text
authenticated Auth user
→ profiles.auth_user_id
→ client_users.user_id (status = 'active')
→ client_users.client_id (clients.status = 'active')
→ requested resource.client_id
```

`private.active_client_id()` fails closed exactly like `requireInternalMember()`
does for internal membership: it only resolves a client when the caller has
**exactly one** active `client_users` row whose linked client is itself
active. A user with more than one active client membership (not a flow this
phase creates, but not schema-prevented either) is safely denied portal
access rather than an arbitrary one being guessed — the same documented
V0.2 limitation `organization_members` already has for internal users.
Internal organization membership and client membership are resolved by
completely independent code paths (`requireInternalMember()` vs
`requirePortalMember()`) — holding one never implies or grants the other.

## Portal routes

```text
/portal                                    (dashboard)
/portal/projects
/portal/projects/[projectId]
/portal/login
/portal/invitations/accept/[token]         (public, noindex)
```

`/portal`, `/portal/projects`, and `/portal/projects/[projectId]` live under
a `src/app/portal/(portal)/` route group whose `layout.tsx` calls
`requirePortalMember()`; `/portal/login` and
`/portal/invitations/accept/[token]` are siblings outside that group so they
never redirect-loop. No functional routes exist for `/portal/files`,
`/portal/revisions`, `/portal/invoices`, or `/portal/support` — those are
Phase 8+, and the portal navigation (`src/config/portal-navigation.ts`)
lists only Dashboard and Projects; logout is a topbar action, not a nav
link.

`src/proxy.ts` (via `src/lib/supabase/proxy.ts`) adds an `isProtectedPortal
Path` check parallel to the existing `isAdminPath`, excluding `/portal/login`
and `/portal/invitations/accept`, and redirects an unauthenticated request to
`/portal/login`. This is an early UX/session-refresh redirect only — the
real authorization boundary is `requirePortalMember()`, called independently
by the `(portal)` layout **and** by every nested page and query, matching
how every existing admin page already re-checks `requireInternalMember()`
itself rather than trusting the layout alone.

## Resend invitation-email setup

Centralized in `src/lib/email/`, reusing the existing Phase 6 infrastructure
unchanged:

- `templates/client-invitation-email.ts` — branded HTML template (same
  Nexfora black header / indigo accent as the proposal email), with all
  interpolated values HTML-escaped.
- `send-client-invitation-email.ts` — the only call site for Resend for
  invitations. Never throws; returns `{ ok: true } | { ok: false, reason:
  "not_configured" | "invalid_recipient" | "provider_error" }`, identical
  shape to `sendProposalEmail`.
- `resend-result.ts` gained one small additive change: `ResendLikeClient.
  emails.send` and `sendViaResendClient` now accept an optional `options?:
  { idempotencyKey?: string }` (the Resend SDK's own supported
  `Idempotency-Key` parameter), forwarded straight through. Existing Phase 6
  callers are unaffected since the parameter is optional and unused by them.
  `sendClientInvitationEmail` uses `client-invitation:{invitationId}:
  {tokenHash}` as the key — the same in-flight attempt retried twice cannot
  double-email, while a genuine resend (new token hash) always sends a
  fresh one.

### Environment variables

No new variables — reuses the existing `RESEND_API_KEY`, `EMAIL_FROM`, and
`NEXT_PUBLIC_APP_URL` from Phase 6.

## Supabase Auth redirect configuration

No new redirect URL configuration is required. Client onboarding never uses
`supabase.auth.signInWithOtp`/`resetPasswordForEmail`-style redirect flows —
`createUser`/`signInWithPassword` are direct, non-redirect Admin/GoTrue
calls. Existing internal password recovery (`/auth/forgot-password` →
`/auth/callback` → `/auth/update-password`) continues to work unchanged and
is reused as-is for client accounts too (it is not internal-role-specific).
One known, accepted rough edge: a client who resets their password through
that shared flow lands on `/auth/login?password_updated=true` (the internal
login page) rather than `/portal/login`, since making that redirect
role-aware would require modifying Phase 1's tested recovery flow. Their
password is still updated correctly; `login()` already rejects a
client-only account from the internal workspace, so they are only
inconvenienced into a second click, not given internal access.

## RLS boundaries

- `client_users`: `SELECT` for the row's own owner
  (`user_id = private.current_profile_id()`) and for any active internal
  member of the owning organization (via a join through `clients`). No
  `INSERT`/`UPDATE`/`DELETE` grant to `authenticated` at all — every
  mutation happens exclusively through `accept_client_invitation`, which
  bypasses RLS as the table owner.
- `client_invitations`: `SELECT` for any active internal member of the
  owning organization; no grant to `anon` at all; no `INSERT`/`UPDATE` grant
  to `authenticated` — mutations only through
  `create_or_resend_client_invitation`/`revoke_client_invitation`.
- **No new client-facing RLS policy was added to `clients`, `projects`, or
  `milestones`.** Table-level `SELECT` grants in this schema are not
  column-limited per Postgres role (Supabase has one `authenticated` role
  for everyone), so any new permissive policy on those tables would also let
  a client user query them directly and see internal-only columns
  (`notes`, `billing_address`, `project_manager_id`, `organization_id`, …).
  Instead, every client-portal read of those tables goes through a
  `SECURITY DEFINER` function that verifies membership internally and
  returns only curated fields — the same pattern `view_proposal_by_token`
  already proved for anonymous access, applied here to authenticated client
  users. `tasks` has no client-facing access path at all in this phase.

## Client-safe access design

`get_client_projects()`/`get_client_project_detail()` are narrow
`SECURITY DEFINER` functions (not a view, not a direct RLS-protected query)
returning only: `id, name, status, priority, progress_percent, start_date,
target_date, updated_at` for the list, plus `description` and a `milestones`
array (`id, title, description, status, due_date, sort_order`) for the
detail. `organization_id`, `project_manager_id`, and all task data are never
returned. A modified/foreign project id and a nonexistent project id both
resolve to the exact same `null` result, so a client can never distinguish
"doesn't exist" from "belongs to someone else."

## Type-generation instructions

```bash
npx supabase gen types typescript --linked --schema public > src/types/database.ts
```

Run this only after the migration above has actually been applied. If this
also returns HTTP 403, it is the same account/token permission issue, not a
schema or code issue. Do not hand-edit `src/types/database.ts`. The
generated file must include:

- `Database["public"]["Tables"]["client_users"]`
- `Database["public"]["Tables"]["client_invitations"]`
- `Database["public"]["Functions"]["get_active_client_membership"]`,
  `get_client_projects`, `get_client_project_detail`,
  `create_or_resend_client_invitation`, `get_client_invitation_by_token`,
  `accept_client_invitation`, `revoke_client_invitation`

Until this is run, `npm run typecheck`/`npm run build` will fail on exactly
these new table/function names — every other check (`npm test`, `npm run
lint`) is unaffected. This is the same, unavoidable constraint Phase 6 hit;
this phase's code is written against the target schema so it type-checks
cleanly the moment types are regenerated.

**Status: done.** The migration has been applied and types regenerated.
One follow-up fix was required after regeneration:
`get_active_client_membership` and `get_client_projects` take no
parameters, so the generated `Args` type for both is `never` — calling
`supabase.rpc(name, {})` doesn't type-check (`{}` isn't assignable to
`never`), even though it works at runtime. The three call sites
(`src/lib/auth/portal.ts`, `src/features/portal/auth/actions.ts`,
`src/features/portal/projects/queries.ts`) now call `supabase.rpc(name)`
with the second argument omitted entirely, rather than any cast. `npm
run typecheck` and `npm run build` are both clean.

## Manual testing checklist

- [ ] Logged-out requests to `/portal*` (except `/portal/login` and
      `/portal/invitations/accept/*`) redirect to `/portal/login`.
- [ ] An internal-only account (no `client_users` row) cannot reach `/portal`
      — safe access-denied state, not a crash.
- [ ] A client-only account cannot reach `/admin` even after signing in
      successfully at `/portal/login`.
- [ ] `project_manager`/`team_member` can see pending invitations and portal
      members on the client detail page but cannot invite, resend, or
      revoke.
- [ ] Inviting the same client+email twice while a pending invitation exists
      rotates the existing row instead of creating a second one.
- [ ] Revoking a pending invitation immediately invalidates its emailed
      link; accepting it afterward shows the generic invalid/expired state.
- [ ] An expired invitation cannot be accepted, even if its status column is
      still `pending`.
- [ ] Accepting with a new email creates exactly one `profiles` row, one
      `client_users` row, and marks the invitation accepted exactly once.
- [ ] Clicking an already-accepted invitation link again (same
      authenticated user) succeeds idempotently rather than erroring.
- [ ] An invitation cannot be accepted by a signed-in user whose email
      doesn't match it.
- [ ] Client A's dashboard/projects never include Client B's data, and a
      guessed/foreign project UUID in the URL renders "Project not found,"
      not Client B's project.
- [ ] Calling `get_client_projects`/`get_client_project_detail` directly
      with a client's own valid token never returns another client's rows,
      and never returns `organization_id`/`project_manager_id`/task data.
- [ ] No browser bundle, response, or log contains `SUPABASE_SECRET_KEY`,
      `RESEND_API_KEY`, raw invitation tokens, complete invitation URLs,
      sessions, cookies, or raw Supabase/SQL errors.

Run the repository checks:

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

## Deferred Phase 8+ functionality

Project file uploads, file downloads, revision submission and management,
invoices, payments, PayMongo, support tickets, maintenance subscriptions,
broader notifications infrastructure, and AI generation. Do not proceed to
Phase 8 while any authorization, RLS, ownership, or isolation check above is
failing.
