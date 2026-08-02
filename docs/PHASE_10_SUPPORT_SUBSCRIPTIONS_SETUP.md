# Phase 10 — Support and Maintenance Setup

## Current status

Phase 10 is **not complete and must not be marked complete yet**.

The handoff reports that the base migration was pasted manually into both
Supabase projects. Limited read-only PostgREST checks confirmed that all four
base table endpoints and the original eight RPC endpoints are present in TEST
and DEV. Those checks do **not** prove function signatures, RLS, grants,
private objects, triggers, indexes, constraints, or migration history. A
follow-up migration was then authored to close authorization and
tenant-integrity gaps. That follow-up has **not** been applied to either
project.

The configured projects are:

| Environment | Project ref | Current known state |
| --- | --- | --- |
| TEST | `akcxsmdodfgfqilavnlf` | Four base tables and eight base RPC endpoints observed; full catalog/history unverified; follow-up not applied |
| DEV | `qcuhdysqijrozhzasnbe` | Four base tables and eight base RPC endpoints observed; full catalog/history unverified; follow-up not applied |

The actual TEST ref is `akcxsmdodfgfqilavnlf`. The previous handoff used the
incorrect value `akcxmodfgfgilanvlf`; do not use that typo for CLI commands,
type generation, or environment configuration.

Database-level Supabase CLI commands and TEST type generation currently fail
with HTTP 403 for this CLI account. `src/types/database.ts` has therefore not
been regenerated. One live TEST integration run completed with 15 passing and
10 failing tests; the failures correspond to protections and RPCs supplied by
the unapplied follow-up. Successful Phase 10 validation remains blocked until:

1. Database-level access is available and the manually applied base schema and
   migration history are verified in both TEST and DEV.
2. The follow-up migration and all five preflights are reviewed, then only the
   follow-up is manually applied to TEST.
3. The final TEST catalog is verified, types are regenerated safely, and all
   required TEST validation passes.
4. Only then is the same reviewed follow-up applied to and verified in DEV.

Do not re-run the base migration blindly. Do not run `migration repair` until
the live schema is proven complete and the only mismatch is a missing history
record.

## Migration files

### Base migration — reported manually applied

```text
supabase/migrations/20260805000000_phase_10_support_maintenance.sql
```

This migration creates the four public tables, the original eight public RPCs,
ticket numbering, activity triggers, indexes, constraints, grants, and the
initial RLS policies.

### Authorization and integrity follow-up — authored, not applied

```text
supabase/migrations/20260805010000_fix_phase_10_authorization_integrity.sql
```

This follow-up must be treated as pending. It:

- Runs five preflight checks instead of guessing how to repair inconsistent
  data: ticket/client organization, subscription/client organization,
  activity/ticket organization, assigned tickets without an assignee, and
  currency values outside `^[A-Z]{3}$`.
- Adds client/organization, ticket/activity, and assigned-state constraints.
- Adds the internal ticket-creation RPC.
- Replaces the internal ticket transition function with the corrected
  transition graph and authorization rules.
- Adds client-scoped ticket and subscription detail RPCs so older records stay
  reachable without turning the bounded portal lists into unbounded reads.
- Replaces the client activity read so its 200-row window keeps the newest
  activity while still rendering chronologically.
- Narrows support and maintenance visibility to the documented role and
  project boundaries.
- Preserves client-only close and reopen actions.

It is additive except where it intentionally replaces affected policies,
`public.transition_ticket_status`, and
`public.get_client_ticket_activities`.

## Public tables

### `public.support_tickets`

Stores the client, optional project, server-generated ticket number, category,
priority, status, assignee, creator, resolution note, and lifecycle timestamps.

Important final constraints after the follow-up is applied:

- `(client_id, organization_id)` must identify a client in the same
  organization.
- `(project_id, organization_id, client_id)` must identify a project belonging
  to the same organization and client when a project is linked.
- Ticket numbers are unique within an organization and must match
  `NXF-TKT-YYYY-NNNN` with at least four sequence digits.
- `assigned` requires a non-null assignee.
- `resolved` and `closed` require `resolved_at`; only `closed` has `closed_at`.
- Authenticated assignment changes authorize the selected assignee as an
  active member of the ticket's organization; this is an authorization rule,
  not a durable catalog constraint.

### `public.ticket_activities`

Provides immutable, chronological ticket history. It stores the activity type,
human-readable title and description, structured metadata, actor, and time.
The follow-up binds `(ticket_id, organization_id)` directly to the owning
ticket so an activity cannot be attributed to another organization.

### `public.subscriptions`

Stores the client, optional project, plan name, status, billing cycle, amount,
currency, included hours, internal notes, renewal data, creator, and lifecycle
timestamps.

Client and project association is fixed after creation by column-level grants.
The follow-up guarantees that the client belongs to the same organization even
when no project is linked.

### `public.subscription_usage`

Stores the append-only usage ledger: subscription, organization, description,
positive hours used, usage date, recorder, and creation time. A composite
foreign key prevents usage from being attributed across organizations.

There is no authenticated `UPDATE` or `DELETE` policy or grant for this table.
Corrections must be represented by a new traceable entry rather than a silent
rewrite or deletion.

## Public RPCs

The base migration defines these original eight public functions:

1. `public.create_client_support_ticket(...)`
2. `public.transition_ticket_status(...)`
3. `public.close_ticket_by_client(...)`
4. `public.reopen_ticket_by_client(...)`
5. `public.get_client_support_tickets()`
6. `public.get_client_ticket_activities(...)`
7. `public.get_client_subscriptions()`
8. `public.get_client_subscription_usage(...)`

The pending follow-up adds:

9. `public.create_internal_support_ticket(...)`
10. `public.get_client_support_ticket(...)`
11. `public.get_client_subscription(...)`

The follow-up also replaces, rather than duplicates,
`public.transition_ticket_status(...)` and
`public.get_client_ticket_activities(...)`.

All write RPCs resolve or verify tenant ownership and actor identity on the
server. The browser must never supply an organization ID, official ticket
number, creator ID, activity actor ID, or arbitrary status value.

## Private objects and helpers

Phase 10 creates:

- `private.ticket_number_counters`
- `private.next_ticket_number(uuid)`
- `private.record_ticket_created_activity()`
- `private.record_ticket_assignment_activity()`

It also uses trusted helpers created by earlier phases:

- `private.set_updated_at()`
- `private.active_client_id()`
- `private.active_client_role()`
- `private.current_profile_id()`
- `private.has_internal_role(...)`
- `private.can_manage_project(...)`

The counter table and private functions are revoked from `public`, `anon`, and
`authenticated`. They are reached only through trusted triggers or
`SECURITY DEFINER` functions with an empty `search_path`.

## Ticket-number strategy

Ticket numbers use an organization-and-year-scoped counter:

```text
NXF-TKT-2026-0001
```

`private.next_ticket_number` performs an atomic `INSERT ... ON CONFLICT DO
UPDATE ... RETURNING` against `(organization_id, number_year)`. This prevents
duplicate allocation during concurrent ticket creation. The counter restarts
for each organization and calendar year, while the ticket table also enforces
`(organization_id, ticket_number)` uniqueness.

Both client and internal ticket-creation RPCs call this server-side generator.
Official numbers are never generated in the browser.

## Corrected support workflow

After the follow-up is applied, the exact internal transition graph is:

```text
open -> assigned
assigned -> in_progress
in_progress -> waiting_for_client | resolved
waiting_for_client -> in_progress | resolved
```

Rules:

- A ticket must have an assignee before it can move to `assigned`.
- Moving to `resolved` requires a non-empty resolution note of at most 3,000
  characters.
- Internal users cannot directly set `closed`.
- Internal users cannot reopen `resolved` tickets through the transition RPC.
- The base migration's broader edges are superseded by the pending follow-up.

Client-only outcomes from `resolved` are:

```text
resolved -> closed
resolved -> in_progress
```

- `close_ticket_by_client` records client confirmation. Repeated close calls
  are idempotent and do not duplicate activity.
- `reopen_ticket_by_client` requires a non-empty explanation of what still
  fails. It clears `resolved_at`, preserves the earlier resolution note, and
  records the new comment in activity history.
- `closed` is terminal in Phase 10.

Ticket statuses:

```text
open
assigned
in_progress
waiting_for_client
resolved
closed
```

Priorities:

```text
low
medium
high
urgent
```

Category is optional free text with a 60-character maximum. The application
offers client-friendly categories but the database does not use a category
enum.

## Support permissions

These are the intended final permissions after the follow-up is applied.

### Internal users

- `super_admin` and `admin` can create internal tickets for clients in their
  organization, read all organization tickets, assign them, and perform valid
  internal transitions.
- `project_manager` can read, assign, and transition a ticket only when it is
  self-assigned or linked to a project the manager can manage.
- `team_member` can read and transition only a self-assigned ticket and cannot
  assign tickets.
- Assignment can target only an active member of the same organization.
- Internal creation uses `create_internal_support_ticket`; there is no direct
  authenticated table insert grant.

### Client portal users

- Active `owner` and `manager` members can create a ticket for their own client
  and optionally link one of that client's projects.
- Active `owner` and `manager` members can close or reopen their own resolved
  ticket.
- Active `viewer` members are read-only.
- Portal users cannot assign tickets or choose arbitrary statuses.
- Cross-client IDs return no usable record and do not reveal another client's
  data.

## Ticket activity behavior

Allowed activity types are:

```text
created
status_changed
assigned
resolved
reopened
closed
```

- Ticket creation is recorded by an `AFTER INSERT` trigger.
- Assignment changes are recorded by an `AFTER UPDATE OF assigned_to` trigger.
- Status changes, resolution, client reopen, and client close are recorded in
  their respective RPC transaction.
- Ticket detail retains the newest 200 activity rows and presents that retained
  window from oldest to newest.
- Status metadata records `from_status` and `to_status`.
- Assignment metadata records previous and new assignees.
- Portal activity reads expose only client-safe text and timestamps, not actor
  IDs or metadata containing internal identifiers.

## Maintenance subscription behavior

Subscription statuses:

```text
trial
active
past_due
paused
cancelled
expired
```

Billing cycles:

```text
monthly
quarterly
yearly
custom
```

Money is stored as `numeric(14,2)`, never floating-point database storage.
Amounts must be non-negative. Currency defaults to `PHP`. The application
schema and, after the follow-up, the database constraint both require exactly
three uppercase ASCII letters (`^[A-Z]{3}$`). This validates format, not
membership in an ISO currency registry. The base migration only rejects blank
currency values.

Included hours are nullable `numeric(8,2)` values and cannot be negative:

- `null` means no tracked allowance.
- Used hours are calculated live from the usage ledger.
- Remaining hours are `included_hours - used_hours`.
- Remaining hours may be negative and must be displayed as an overage, not
  silently clamped to zero.

Usage hours are positive `numeric(8,2)` values with a database maximum of
1,000 hours per entry. Usage records are append-only and are never silently
edited or removed.

Changing a subscription to `cancelled` must set `cancelled_at` in the same
update. Moving away from `cancelled` clears it. Renewal dates are tracking
information only and do not initiate a charge.

## Maintenance permissions

After the follow-up is applied:

- `super_admin` and `admin` can read, create, and edit subscriptions in their
  organization.
- `project_manager` can read a subscription and append usage only when it is
  linked to a project the manager can manage.
- `team_member` has no base-table subscription or usage access.
- Subscription client/project/organization association cannot be changed
  after creation.
- Portal users can read only their own client's curated subscription and usage
  results and cannot create, edit, cancel, or record usage.
- Internal notes and recorder identity never appear in portal RPC output.

## Client-safe RPC fields

`get_client_support_tickets()` returns only:

```text
id
ticket_number
title
description
category
priority
status
project_id
resolution_note
resolved_at
closed_at
created_at
updated_at
```

`get_client_support_ticket(...)` returns the same curated fields for one
owned ticket. It returns no row for another client and is the portal detail and
write-precheck boundary; the bounded list RPC is not expanded to find old IDs.

`get_client_ticket_activities(...)` returns only:

```text
activity_type
title
description
created_at
```

`get_client_subscriptions()` returns only:

```text
id
plan_name
status
billing_cycle
amount
currency
included_hours
used_hours
remaining_hours
project_id
started_at
renewal_at
cancelled_at
created_at
```

`get_client_subscription(...)` returns the same curated fields and live usage
totals for one owned subscription. It returns no row for another client and
keeps subscription detail independent of the bounded list RPC.

`get_client_subscription_usage(...)` returns only:

```text
id
description
hours_used
usage_date
created_at
```

The application resolves client-safe project names and does not render raw
project UUIDs. These functions exclude organization IDs, client IDs, assignee
IDs, creator/recorder IDs, internal notes, and internal activity metadata.

## RLS and grants

RLS is enabled on all four public tables.

- Portal users have no base-table policies for these modules; curated
  `SECURITY DEFINER` RPCs are the portal read/write boundary.
- `support_tickets` grants authenticated users `SELECT` and column-limited
  `UPDATE (assigned_to)` only. Creation and status changes use RPCs.
- `ticket_activities` grants authenticated users `SELECT` only; activities are
  created by trusted triggers and RPCs.
- `subscriptions` uses column-limited authenticated `INSERT` and `UPDATE`
  grants. Tenant IDs and creator are checked by RLS; association columns are
  not updateable.
- `subscription_usage` grants authenticated users `SELECT` and column-limited
  `INSERT`. It has no authenticated update/delete grant or policy.
- Anonymous access is revoked.
- Service-role access exists for trusted server/administrative operations but
  must never be exposed to the browser.

The pending follow-up must be present before these final authorization claims
can be validated against TEST or DEV.

## Application routes

Internal routes:

```text
/admin/support
/admin/support/new
/admin/support/[ticketId]

/admin/subscriptions
/admin/subscriptions/new
/admin/subscriptions/[subscriptionId]
```

Client portal routes:

```text
/portal/support
/portal/support/new
/portal/support/[ticketId]

/portal/subscriptions
/portal/subscriptions/[subscriptionId]
```

The routes include mobile-safe layouts and module-appropriate loading, empty,
error, and not-found states. Every server query and action must independently
resolve the active internal or portal membership; navigation visibility is not
authorization.

## Generated database types

Do not hand-edit `src/types/database.ts`.

The attempted generation against the correct TEST ref failed with HTTP 403,
so `src/types/database.ts` has **not** been regenerated. Only after the
follow-up is applied to TEST and the final TEST catalog is verified, regenerate
from the correct TEST project. Capture stdout in memory and replace the file
only after a successful, non-empty result so a failed CLI command cannot
truncate the checked-in types:

```powershell
$generatedTypes = npx supabase@latest gen types typescript --project-id akcxsmdodfgfqilavnlf --schema public
if ($LASTEXITCODE -ne 0) { throw "Supabase type generation failed; database.ts was not changed." }

$generatedTypesText = $generatedTypes -join [Environment]::NewLine
if ([string]::IsNullOrWhiteSpace($generatedTypesText)) { throw "Generated types were empty; database.ts was not changed." }

$requiredPhase10Symbols = @(
  "support_tickets",
  "ticket_activities",
  "subscriptions",
  "subscription_usage",
  "create_client_support_ticket",
  "create_internal_support_ticket",
  "get_client_support_ticket",
  "transition_ticket_status",
  "close_ticket_by_client",
  "reopen_ticket_by_client",
  "get_client_support_tickets",
  "get_client_ticket_activities",
  "get_client_subscriptions",
  "get_client_subscription",
  "get_client_subscription_usage"
)
foreach ($symbol in $requiredPhase10Symbols) {
  if (-not $generatedTypesText.Contains($symbol)) { throw "Generated types are missing $symbol; database.ts was not changed." }
}

Set-Content -LiteralPath "src/types/database.ts" -Value $generatedTypesText -Encoding utf8
```

Review the generated diff. It must include every table below and both `Args`
and `Returns` for every function below, not merely function-name keys:

```text
Database["public"]["Tables"]["support_tickets"]
Database["public"]["Tables"]["ticket_activities"]
Database["public"]["Tables"]["subscriptions"]
Database["public"]["Tables"]["subscription_usage"]

Database["public"]["Functions"]["create_client_support_ticket"]
Database["public"]["Functions"]["create_internal_support_ticket"]
Database["public"]["Functions"]["get_client_support_ticket"]
Database["public"]["Functions"]["transition_ticket_status"]
Database["public"]["Functions"]["close_ticket_by_client"]
Database["public"]["Functions"]["reopen_ticket_by_client"]
Database["public"]["Functions"]["get_client_support_tickets"]
Database["public"]["Functions"]["get_client_ticket_activities"]
Database["public"]["Functions"]["get_client_subscriptions"]
Database["public"]["Functions"]["get_client_subscription"]
Database["public"]["Functions"]["get_client_subscription_usage"]
```

Until that succeeds, the local server-only narrow type bridges are temporary.
They may describe the already-authored contract, but they are not evidence
that the live schema is correct and must not be treated as generated types.

## Test commands

Static/unit checks can run against local source and migration files. Live
integration and E2E checks require the corrected TEST schema and the existing
safe `.env.test.local` configuration. Do not point Phase 10 tests at DEV.

Focused commands:

```powershell
npm run test:phase10:unit
npm run test:phase10:integration
npm run test:phase10
npm run test:e2e:phase10
```

Each E2E alias uses the shared repository launcher to run `next build` and
then `next start` against TEST. It does not reuse an existing server, and all
three Playwright configurations use zero retries. Isolated build output keeps
the suites from colliding with a normal development server:

```text
.next/e2e-phase-8-e2e
.next/e2e-phase-9-e2e
.next/e2e-phase-10-e2e
```

If port 3000 is occupied, use a distinct local port for each suite:

```powershell
$env:TEST_APP_URL = "http://127.0.0.1:3108"
npm run test:e2e:phase8

$env:TEST_APP_URL = "http://127.0.0.1:3109"
npm run test:e2e:phase9

$env:TEST_APP_URL = "http://127.0.0.1:3110"
npm run test:e2e:phase10
npm run test:e2e:phase10

Remove-Item Env:TEST_APP_URL -ErrorAction SilentlyContinue
```

Phase 10 integration tests are intentionally serialized. Once TEST is ready,
run both suites twice to prove fixture cleanup and idempotency:

```powershell
npm run test:phase10
npm run test:phase10
npm run test:e2e:phase10
npm run test:e2e:phase10
```

Required regression and build validation:

```powershell
npm run test:phase8
npm run test:e2e:phase8
npm run test:phase9
npm run test:e2e:phase9
npm test
npm run lint
npm run typecheck
npm run build
```

Before relying on an npm alias, confirm it enumerates the current files under
`tests/phase10/`. Do not hide failures with retries, skipped tests, removed
assertions, weaker authorization, or inflated timeouts.

## Manual verification checklist

Do not record a check as passed without live evidence.

### Project identity and base verification

- [ ] Confirm the TEST project is `akcxsmdodfgfqilavnlf` before any command.
- [ ] Confirm the DEV project is `qcuhdysqijrozhzasnbe` before any command.
- [ ] Obtain database-level access before applying any additional migration.
- [ ] Run `npx supabase@latest migration list` for correctly linked TEST and
      DEV projects.
- [ ] Run `npx supabase@latest db push --dry-run` against each correctly linked
      project; do not execute the push.
- [ ] In both live catalogs, compare the immutable base migration with all four
      tables and the original eight functions, including exact signatures and
      grants.
- [ ] In both projects, verify RLS, base policies, column grants, the private
      ticket-number counter and helpers, updated-at/activity triggers, indexes,
      tenant relationships, and all base constraints.
- [ ] Determine whether `20260805000000_phase_10_support_maintenance.sql` is
      represented in each migration history. Manual SQL execution does not
      prove that a history row exists.
- [ ] Do not run `migration repair` unless the complete base catalog is proven
      and the only mismatch is the missing history record.

### TEST follow-up and final catalog

- [ ] Review all five preflight queries and prove they pass without modifying
      data.
- [ ] Apply only
      `20260805010000_fix_phase_10_authorization_integrity.sql` to TEST; do not
      reapply the base migration.
- [ ] Verify the final TEST schema exposes the original eight function
      identities plus three added functions (11 total). The follow-up replaces
      two originals in place: `transition_ticket_status` and
      `get_client_ticket_activities`.
- [ ] Verify both Phase 10 filenames are represented correctly in TEST
      migration history. Manually executing the follow-up does not inherently
      create its history row.
- [ ] Verify `private.ticket_number_counters` and all Phase 10 private helpers
      exist and are not executable/readable by ordinary roles.
- [ ] Verify RLS is enabled on all four public tables and final policies match
      the follow-up, not the broader base policies.
- [ ] Verify column-level grants prevent direct ticket status mutation,
      subscription association changes, and usage update/delete.
- [ ] Verify updated-at and ticket activity triggers exist and are enabled.
- [ ] Verify numbering, tenant, project/client, activity/ticket, timestamp,
      status, currency, amount, and hours constraints exist.
- [ ] Verify expected indexes exist for organization, status, priority,
      assignee, client, project, renewal, ticket activity, and usage queries.

### Support behavior

- [ ] Admin and super admin can create an internal ticket; PM/team member
      cannot.
- [ ] Portal owner and manager can create a ticket; viewer cannot.
- [ ] A linked project must belong to the selected/active client.
- [ ] Official ticket numbers are server-generated and remain unique under
      concurrent creation.
- [ ] Only corrected transition edges are accepted.
- [ ] `assigned` without an assignee is rejected.
- [ ] Resolution without a meaningful note is rejected.
- [ ] PM access is limited to manageable linked projects or self-assigned
      tickets; team member access is limited to self-assigned tickets.
- [ ] Client close is idempotent.
- [ ] Client reopen requires a comment, preserves the prior resolution note,
      and records activity.
- [ ] Cross-organization and cross-client ticket access is denied without data
      leakage.

### Maintenance behavior

- [ ] Admin and super admin can create/edit a valid subscription.
- [ ] Cross-organization clients and mismatched client/project pairs are
      rejected.
- [ ] Project managers see and append usage only for manageable linked
      projects; team members have no subscription access.
- [ ] Invalid status, billing cycle, malformed currency, negative amount,
      negative included hours, and non-positive usage are rejected.
- [ ] Cancelling sets `cancelled_at` atomically; reactivation clears it.
- [ ] Usage is append-only and remains traceable.
- [ ] Used and remaining hours equal the ledger sum, including negative
      overage and null-allowance cases.
- [ ] Portal users see only their own client subscriptions and usage.
- [ ] Portal output never exposes internal notes, recorder IDs, tenant IDs, or
      raw database errors.
- [ ] Suspended internal and portal memberships are denied.

### Types and application validation

- [ ] Regenerate `src/types/database.ts` from corrected TEST.
- [ ] Confirm all four tables and eleven public Phase 10 functions are typed.
- [ ] Run Phase 10 integration and E2E suites twice.
- [ ] Run Phase 8/9 regressions, full tests, lint, typecheck, and build.
- [ ] Perform mobile and keyboard checks for list, form, detail, empty,
      loading, error, permission-denied, and not-found states.
- [ ] Apply the reviewed follow-up to DEV only after TEST is fully verified,
      then repeat the final DEV catalog and both-file migration-history checks.

## Deferred functionality

The following is deliberately deferred and must not be added while closing
Phase 10 validation:

- Phase 11 in-app notifications and email automation.
- Ticket attachments and attachment storage rules.
- Automated renewal reminders.
- Automatic subscription charging or renewal billing.
- PayMongo subscription billing for maintenance plans.
- Accounting integrations, tax filing, payroll, or SaaS billing for NEXFORA
  itself.
- AI support classification or other Phase 12 intelligence.

Activity history provides traceability in Phase 10; it is not a replacement
for the deferred notification system.
