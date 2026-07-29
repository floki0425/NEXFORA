# Phase 6 proposal system setup

Phase 6 adds the cost estimator, proposal drafting, line items with
server-computed totals, official numbering, immutable version snapshots, and
a secure client-facing view with accept / request-changes / decline. This
implementation completes F-050 through F-058 at V0.2 scope.

It does not add Client Portal authentication, client invitations, a portal
dashboard, project file uploads, revision management, contracts, invoices,
payments, PayMongo, support tickets, maintenance subscriptions, or AI
generation.

## Prerequisites

- Complete Phases 1–5 (`docs/PHASE_1_SETUP.md`, `docs/PHASE_3_LEADS_SETUP.md`,
  `docs/PHASE_4_CLIENTS_SETUP.md`, `docs/PHASE_5_PROJECTS_SETUP.md`).
- Use an intended non-production Supabase project for migration and security
  verification.
- Keep the existing `.env.local` values private.

Phase 6 internal admin operations use the cookie-scoped Supabase SSR client
and RLS. They do not use `SUPABASE_SECRET_KEY` or the admin client. The
public secure proposal view uses the same cookie-scoped client (as an
unauthenticated `anon` request) calling narrowly scoped
`SECURITY DEFINER` functions — never the admin client.

## Apply the migration

The tracked migration is:

```text
supabase/migrations/20260801000000_phase_6_proposals.sql
```

It also extends the existing `lead_activities_type_check` constraint (adding
`proposal_changes_requested` and `proposal_declined`; `proposal_created`,
`proposal_sent`, `proposal_viewed`, and `proposal_accepted` already existed
from Phase 3). No already-applied migration file was edited — this is a new
migration that alters the constraint additively.

Review the linked project, then run:

```bash
npx supabase db push --include-all
```

If the CLI's platform login-role endpoint returns HTTP 403 (a known
account/token permission issue, not a code defect), connect with the
database password instead:

```bash
npx supabase db push --dry-run --include-all --password '<DB_PASSWORD>'
npx supabase db push --include-all --password '<DB_PASSWORD>'
```

Never paste the database password into source files, commits, or chat.

## Tables and functions created

- `public.proposals`
- `public.proposal_items`
- `public.proposal_versions`
- `public.proposal_access_tokens` — additional table, genuinely required
  (see "Secure client-access design" below)
- `private.proposal_number_counters` — additional table, genuinely required
  for race-safe official numbering (see below)
- `private.next_proposal_number(organization_id)` — internal helper, never
  granted directly to any role
- `public.send_proposal(proposal_id, token_hash, token_expires_at)` —
  the atomic send transaction
- `public.reissue_proposal_access_token(proposal_id, token_hash, token_expires_at)`
  — resend-email-only path (no version/number side effects)
- `public.view_proposal_by_token(token_hash)` — secure client view; records
  the first valid `viewed_at` transition
- `public.accept_proposal_by_token(token_hash)`
- `public.decline_proposal_by_token(token_hash)`
- `public.request_proposal_changes_by_token(token_hash, message)`

### Additional fields beyond DATABASE.md's suggested `proposals` schema

- `payment_terms_text` — this phase's admin form (and PRODUCT.md §16) list
  "Payment Terms" as a section distinct from general "Terms", but
  DATABASE.md's schema only defines `terms_text`. A dedicated column keeps
  payment terms from being conflated with general terms and conditions.
- `requested_changes_message` — stores the client's current requested-changes
  message directly on the proposal row, mirroring how `leads.lost_reason` is
  stored directly on the leads row rather than only in activity history.

No other fields were added. `created_by`, `project_type`-style fields, and
similar were **not** invented — the schema otherwise matches DATABASE.md
§24–26 exactly. "Problem" and "Solution" (mentioned in USER_FLOWS.md §15 and
this phase's own admin-form list) are **not** separate columns — DATABASE.md
only provides `summary` and `scope`. The admin/preview UI labels these
"Overview" (covers Overview + Problem context) and "Scope and solution"
(covers Solution + Scope) rather than inventing new columns.

`currency` intentionally has **no** `= 'PHP'` check constraint — DATABASE.md
§46 explicitly preserves future multi-currency capability; only `default
'PHP'` is enforced, matching the documented schema.

## Proposal statuses

```text
draft → sent → viewed → accepted
                       → changes_requested → (revise) → sent
                       → declined
```

`expired` remains a valid documented status value, but no automatic cron
transitions a proposal to `expired` in this phase (not requested). Instead,
`accept_proposal_by_token` independently checks `valid_until < current_date`
so an expired-by-date proposal can never be accepted regardless of its
stored status column — this satisfies "expired proposals cannot be accepted"
without inventing a scheduled job.

## Proposal number format

```text
NXF-PROP-2026-0001
```

Generated only when a proposal is first sent (`send_proposal`), via
`private.next_proposal_number`: an atomic `INSERT ... ON CONFLICT (organization_id,
number_year) DO UPDATE SET last_value = last_value + 1 RETURNING last_value`
against `private.proposal_number_counters`. This is race-safe under
concurrent sends because the unique `(organization_id, number_year)` key
serializes concurrent upserts at the row-lock level — no two sends can ever
receive the same number. A resend after `changes_requested` reuses the
existing number; the CHECK constraint `(status = 'draft') = (proposal_number
IS NULL)` enforces that a number exists for every non-draft status and only
for non-draft statuses.

## Role permissions

```text
super_admin, admin        — create/edit/send/version proposals
project_manager, team_member — read-only, matching the existing Leads/Clients/
                               Projects precedent (PRODUCT.md does not list
                               Proposals under Project Manager's typical
                               access)
```

Every Server Action re-authorizes independently; navigation visibility is
never treated as authorization. Client-facing actions require a valid,
unexpired, unrevoked access token — never an authenticated session.

## Secure client-access design

Phase 7 client authentication does not exist yet, so Phase 6 uses a
token-based secure link:

1. On send, the server (Node) generates a 256-bit random token
   (`crypto.randomBytes(32)`), computes its SHA-256 hex hash, and passes only
   the **hash** to `send_proposal`. The raw token is embedded in the emailed
   link (`{NEXT_PUBLIC_APP_URL}/proposal/{rawToken}`) and is never persisted
   anywhere.
2. `public.proposal_access_tokens` stores only `token_hash` (unique,
   `^[0-9a-f]{64}$`), `expires_at` (30 days from send —
   `PROPOSAL_ACCESS_TOKEN_TTL_DAYS`, independent of the business-validity
   `valid_until` field), and `revoked_at`.
3. The table has **no** RLS policies and **no** grants to `anon` or
   `authenticated` — it is reachable only through the `SECURITY DEFINER`
   functions above, which run as the table owner and bypass RLS.
4. `/proposal/[token]` (a standalone route, not under `/admin` or `(public)`,
   with `robots: noindex`) hashes the token server-side and calls
   `view_proposal_by_token`, which returns client-safe fields only —
   `lead_id`, `client_id`, `created_by`, and `organization_id` are never
   included in the returned JSON.
5. Invalid, expired, and revoked tokens all return the same generic "invalid
   or expired" response — no distinguishing detail, reducing token-enumeration
   value beyond what 256 bits of entropy already provides. No additional
   IP-based rate limiting was added; none exists elsewhere in this codebase
   to hook into, and token entropy is the primary defense. This is a
   documented, deliberate scope decision.
6. Resending after `changes_requested` revokes the prior active token(s) and
   issues a new one inside the same `send_proposal` call.

## Resend setup

Centralized in `src/lib/email/`:

- `resend-client.ts` — lazily instantiates the Resend client only when
  `RESEND_API_KEY` is set; otherwise returns `null`.
- `send-proposal-email.ts` — the only call site for Resend. Never throws;
  returns `{ ok: true }` or `{ ok: false, reason: "not_configured" |
  "provider_error" }`. Raw provider errors are logged server-side only
  (name/message), never surfaced to the browser.
- `templates/proposal-email.ts` — branded HTML template (Nexfora black
  header, indigo accent), with all interpolated values HTML-escaped.

### Environment variables

```env
RESEND_API_KEY=
EMAIL_FROM=
NEXT_PUBLIC_APP_URL=   # already required; used to build the secure link
```

`RESEND_API_KEY` and `EMAIL_FROM` are optional in `src/config/env.server.ts`
— when unset, `sendProposalAction` still performs the atomic database send
(number, version, token) and reports a safe setup message instead of
crashing or claiming the email was delivered. `resendProposalEmailAction`
lets an admin retry delivery (or retry after configuring Resend) without
creating a duplicate version or number.

## Regenerate database types

```bash
npx supabase gen types typescript --linked --schema public > src/types/database.ts
```

If this also returns HTTP 403, the Supabase Personal Access Token or account
permissions need to be fixed manually — this is an account/token issue, not
a schema or code issue. Do not hand-edit `src/types/database.ts`. The
generated file must include:

- `Database["public"]["Tables"]["proposals"]`
- `Database["public"]["Tables"]["proposal_items"]`
- `Database["public"]["Tables"]["proposal_versions"]`
- `Database["public"]["Functions"]["send_proposal"]`,
  `reissue_proposal_access_token`, `view_proposal_by_token`,
  `accept_proposal_by_token`, `decline_proposal_by_token`,
  `request_proposal_changes_by_token`

`public.proposal_access_tokens` and `private.proposal_number_counters` are
intentionally never queried directly by application code (only through the
functions above), so their absence from generated `Tables` usage is expected.

## Application routes

```text
/admin/proposals
/admin/proposals/new
/admin/proposals/[proposalId]
/admin/proposals/[proposalId]/edit
/admin/proposals/[proposalId]/preview
/admin/proposals/[proposalId]/versions
/proposal/[token]                          (public, secure, noindex)
/estimate                                  (public cost estimator)
```

A "Create proposal" action appears on `/admin/leads/[leadId]` only when the
lead's status is `qualified` and the actor can manage proposals.

## Cost estimator (F-050)

`src/features/estimator/` implements Project Type → Features → Details →
Estimate Range → Contact, reusing the **existing** `SERVICE_INTERESTS` and
`REQUESTED_FEATURES` taxonomies from `src/features/leads/constants.ts`
instead of inventing a parallel one. A Timeline selector is folded into the
Contact step (F-050's flow has no separate timeline step, but
`submit_project_inquiry` requires one) — documented here as a deliberate,
minimal addition, not a contradiction of the flow.

Pricing rules live in one place, `src/features/estimator/pricing.ts`, and are
never duplicated across UI files. The displayed range is computed
server-side via `estimateProjectCostAction` and is always labeled
"Non-final estimate." Lead capture calls `submitEstimatorLeadAction`, which
reuses the **same** `submit_project_inquiry` RPC as `/start-a-project` —
same anti-abuse rate limiting, same lead creation path, same `website`
source — so no duplicate lead pipeline or duplicate-prevention logic exists.

## RLS boundaries

- `proposals`: `SELECT` for internal members of the organization.
  `INSERT`/`UPDATE` require `super_admin`/`admin`; insert additionally
  requires `created_by` to match the caller's own profile and the
  referenced lead/client to belong to the same organization. `UPDATE`'s
  `USING` clause requires the current status to be `draft` or
  `changes_requested` — sent/viewed/accepted/declined/expired proposals are
  not directly updatable by the authenticated role at all (only by the
  `SECURITY DEFINER` functions, which bypass RLS as the table owner).
- `proposal_items`: same organization/role scoping via a join to `proposals`;
  insert/update/delete additionally require the parent proposal's status to
  be `draft` or `changes_requested` — accepted/sent line items are
  immutable at the RLS level.
- `proposal_versions`: `SELECT` only for internal organization members. No
  `INSERT`/`UPDATE`/`DELETE` grant exists for `authenticated` at all —
  versions are created exclusively by `send_proposal`.
- `proposal_access_tokens`: no policies, no grants to `anon` or
  `authenticated` — reachable only through the `SECURITY DEFINER` functions.
- `organization_id`, `created_by`, `proposal_number`, `subtotal`, `total`,
  `status`, `sent_at`, `viewed_at`, `accepted_at`, `declined_at`, and
  `requested_changes_message` are all excluded from the authenticated
  `UPDATE` column grant — none of them can ever be set directly by the
  browser.

## Manual testing checklist

- [ ] Logged-out requests to `/admin/proposals*` redirect to login.
- [ ] A user without one active internal membership cannot access proposals.
- [ ] Active members read proposals only in their organization.
- [ ] `project_manager`/`team_member` cannot create, edit, send, or version
      proposals.
- [ ] Only a `qualified` lead can start a proposal; other statuses are
      rejected server-side even if the browser is tampered with.
- [ ] Line items reject non-positive quantity and negative unit price.
- [ ] Editing subtotal/total directly via a crafted request has no effect —
      the database recomputes them.
- [ ] Sending assigns a number only the first time; resending after
      `changes_requested` reuses it and creates a new version.
- [ ] Concurrently sending many draft proposals in the same organization/year
      never produces duplicate numbers.
- [ ] An invalid, expired, or revoked `/proposal/[token]` shows the same
      generic message.
- [ ] The first client view records `viewed_at` once; refreshing does not
      change it again; other statuses are untouched by viewing.
- [ ] Internal preview never marks a proposal viewed.
- [ ] Accept/decline/request-changes each revalidate the token server-side;
      repeating accept or decline is idempotent and creates no duplicate
      activity.
- [ ] An expired (`valid_until` passed) proposal cannot be accepted.
- [ ] Accepted proposals and their line items cannot be edited through any
      authenticated-role path.
- [ ] Historical and accepted proposal versions are never overwritten.
- [ ] The cost estimator always labels its result "Non-final estimate" and
      never auto-creates a proposal.
- [ ] No browser bundle, response, or log contains `SUPABASE_SECRET_KEY`,
      `RESEND_API_KEY`, raw access tokens, sessions, or raw Supabase/SQL
      errors.

Run the repository checks:

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

## Deferred Phase 7+ functionality

Client Portal authentication, client invitations, portal dashboard, project
file uploads, revision management, contracts, invoices, payments, PayMongo,
support tickets, maintenance subscriptions, and AI generation. Do not
proceed to Phase 7 while any authorization, RLS, ownership, totals, or
versioning check above is failing.
