# Phase 11 — Notifications, Audit Log, and Scheduled Reminders Setup

## Current status

Phase 11's database layer, application layer, unit tests, and integration
tests are **complete and verified against TEST**. DEV has **not** been
touched — per the approved migration rules, DEV is only updated after an
explicit, separate approval. The E2E tier's code (config, launcher, fixture
setup, four specs) is complete but has never been executed: it requires six
`TEST_P11_*` fixture-account variables in `.env.test.local` that do not exist
yet (see "Environment variables" below).

Successive post-handoff reviews found and this setup closed **four** release
blockers before any deploy:

1. The cron route only accepted `POST`, but Vercel Cron invokes with `GET`
   (route side: `src/app/api/cron/reminders/route.ts`).
2. `private.emit_event`'s notification-fan-out failures were silently
   discarded rather than durably recorded
   (`20260806010000_fix_phase_11_event_atomicity.sql`).
3. `claim_pending_email_deliveries` never revisited a row once it moved to
   `'sending'`, so a crashed or timed-out runner left that row stuck forever
   (`20260806020000_fix_phase_11_delivery_lease.sql`).
4. `mark_email_delivery_result` identified its target by
   `(id, status = 'sending')` alone, which cannot distinguish *which* claim is
   in flight — so a worker stalled past its lease could return later and
   overwrite a newer worker's claim
   (`20260806030000_fix_phase_11_claim_identity.sql`).

See "Event atomicity", "Cron route", and "Delivery lease and claim identity"
below for exact behavior before/after.

| Environment | Project ref | State |
| --- | --- | --- |
| TEST | `akcxsmdodfgfqilavnlf` | **All four migrations applied and catalog-verified; types regenerated against all four.** Unit 107/107, integration 65/65, E2E 5/5, all green on repeated runs |
| DEV | `qcuhdysqijrozhzasnbe` | Not touched. Apply all four, in order, only after the migrations are reviewed and this doc's TEST checklist is independently re-confirmed |

Unlike Phase 10, this migration was applied via `supabase db query --linked
-f <file>` (direct SQL execution against TEST through the Management API),
**not** `supabase db push`. `supabase_migrations.schema_migrations` does not
exist on TEST at all (confirmed empty/absent before this migration ran) —
every prior phase's migration was also applied by direct/manual SQL, not
`db push`, so there is no CLI-tracked migration history to reconcile. Do not
run `migration repair`: there is no history gap to repair, only an
untracked-by-design application model this repo has used since Phase 1.

## Migration files

Apply in exactly this order. Each follow-up is forward-only and refuses to run
if its prerequisite is missing (every one opens with a `do $preflight$` block
that aborts loudly rather than guessing) and refuses to run twice.

```text
1. supabase/migrations/20260806000000_phase_11_notifications_audit.sql
2. supabase/migrations/20260806010000_fix_phase_11_event_atomicity.sql
3. supabase/migrations/20260806020000_fix_phase_11_delivery_lease.sql
4. supabase/migrations/20260806030000_fix_phase_11_claim_identity.sql
```

The same order applies to TEST and to DEV. Migrations 1-3 are already applied
to TEST; migration 4 is not (verified live — see "Applying the claim-identity
migration"). DEV has none of them.

None of migrations 1-3 may be edited: all three are applied to TEST, so every
subsequent correction must be a new file. `tests/phase11/unit/claim-identity.test.mjs`
and `tests/phase11/unit/delivery-lease.test.mjs` both statically assert that
the earlier files still contain their original definitions, so editing one in
place fails the unit suite rather than silently diverging TEST from the repo.

The base migration is additive: 5 new tables (4 `public`, 1 `private`), RLS +
grants, 3 private helpers, 6 `authenticated`-facing RPCs, 5
`service_role`-only RPCs, and 14 `AFTER` triggers across 14 existing tables.
It does not alter any existing table's columns, drop anything, or change any
existing function's signature, grants, or authorization logic. Its own header
comment documents 8 reconciliation notes — places where the approved handoff
had an internal inconsistency that had to be resolved one way; read those
before changing any event-type name, trigger column list, or
recipient-resolution rule.

Migration 2 (applied on top, never edited into the base file since the base
file was already applied to TEST) adds one table
(`private.notification_dispatch_failures`), replaces `private.emit_event`
with a version that records fan-out failures instead of discarding them, and
adds one `service_role`-only read RPC
(`list_notification_dispatch_failures`). See "Event atomicity" below.

Migrations 3 and 4 both act only on the email outbox — two columns, four
CHECK constraints, one partial index, and the two `service_role`-only
delivery RPCs. Neither touches any other table, policy, grant, or trigger.
See "Delivery lease and claim identity" below.

## Public tables

### `public.audit_logs`

Append-only. `organization_id`, `actor_user_id` (nullable, `on delete set
null`), `actor_type` (`internal` / `client` / `system`), `action`,
`entity_type`, `entity_id` (nullable, no FK — polymorphic reference,
survives deletion of the entity), `metadata` (jsonb object), `created_at`.
No `updated_at`. No policy of any kind exists for `insert`/`update`/`delete`
on any role — absence of a policy denies outright once RLS is enabled. All
writes go through `private.emit_event`, which owns unconditional
`insert`-only access as the function's definer.

### `public.notifications`

`organization_id`, `user_id` (`not null references profiles(id)`),
`event_type`, `title`, `message` (nullable), `entity_type`/`entity_id`
(nullable), `dedupe_key`, `read_at` (nullable), `created_at`. Unique on
`(user_id, event_type, entity_id, dedupe_key)` — this is the primary
duplicate-prevention mechanism (`on conflict do nothing` in
`private.emit_event`). `authenticated` gets `select` only; all writes go
through the RPCs below.

### `public.notification_preferences`

`profile_id`, `event_type`, `in_app` (default `true`), `email` (default
`true`). Unique on `(profile_id, event_type)`. Absent row = both channels
enabled (opt-out model) — enforced both in `private.emit_event`'s lookup
(`if not found then ... := true`) and in
`src/features/notifications/queries.ts`'s `getMyNotificationPreferences()`.
`authenticated` gets `select` only; writes go through
`set_notification_preference`.

### `public.notification_deliveries`

The email outbox. `notification_id` (`not null references
notifications(id)`), `channel` (`'email'` only this phase), `recipient_email`,
`status` (`pending` / `sending` / `sent` / `failed`), `attempt_count` (0-5),
`last_error_code`, `provider_reference`, `next_attempt_at`, `sent_at`.
`authenticated` has **no** grant at all — not even `select`. Only
`service_role` can touch this table, via `claim_pending_email_deliveries` and
`mark_email_delivery_result`.

## Private object

### `private.reminder_runs`

`reminder_type` (`invoice_reminder` / `renewal_reminder` / `lead_follow_up`),
`entity_id`, `window_key`. Unique on `(reminder_type, entity_id, window_key)`
— a given reminder can be raised once, ever, per window. Revoked from
`anon`, `authenticated`, **and** `service_role` (the three reminder-raising
RPCs write to it as their own definer, not via a table grant to
`service_role`). Not in `public` — not PostgREST-reachable under any
circumstance.

## Private helpers

- `private.resolve_event_actor(organization_id, client_id)` — resolves the
  calling profile plus `actor_type` (`internal` / `client` / `system`; `null`
  profile → `system`, matching service-role/webhook/cron callers with no
  session).
- `private.notification_title(action)` — maps every event type to a short,
  human-readable title. Falls back to `initcap(replace(action, '.', ' '))`
  for any value not explicitly listed (defensive; every current value is
  listed).
- `private.resolve_notification_recipients(event_type, entity_type,
  entity_id, organization_id)` — the recipient-resolution table from
  AGENTS.md/the handoff, implemented as one `union`-ed SQL query. Every
  branch re-derives tenant scope from the entity's own row (not merely the
  passed `organization_id`), so cross-tenant resolution fails even if a
  caller passed mismatched arguments.
- `private.emit_event(...)` — the single instrumentation point. Inserts one
  `audit_logs` row unconditionally, then in a **separate, nested exception
  block** resolves recipients and fans out `notifications`/
  `notification_deliveries`. A failure in the nested block can never roll
  back the audit row or the business mutation that triggered it. See "Event
  atomicity" below for the exact failure-handling behavior (changed by the
  `20260806010000` follow-up).

## Event atomicity

A post-handoff review found a real contradiction between two claims that
had both been made about this design: (a) "a notification fan-out failure
can never roll back the business mutation" and (b) "a committed event can
never be missing its notifications." Both cannot hold at the same time
under any design that also guarantees (a) — and the **original** base
migration's `private.emit_event` did not actually guarantee (b).

**Before the follow-up** (base migration only): the fan-out block's
exception handler was `exception when others then null;` — a bare swallow.
If `resolve_notification_recipients()` or any insert inside the loop
raised, Postgres rolled back everything since that block's implicit
savepoint (including any notifications already inserted for earlier
recipients in the same loop) and the handler discarded the error with no
log, no record, and no way to know it had happened. Claim (a) held; claim
(b) was false and unrecoverable — a committed lead/invoice/etc. could
silently end up with zero notifications, invisibly, forever.

**After the follow-up**: claim (a) still holds exactly as before (verified
live and in `tests/phase11/integration/event-atomicity.test.mjs`) — a
fan-out failure still cannot roll back the audit row or the business
mutation. What changed: the exception handler now persists a durable
record — `organization_id`, `actor_user_id`, `actor_type`, `action`,
`entity_type`, `entity_id`, `metadata`, `dedupe_key`, the real audit row's
id, `sqlstate`, and a length-capped `sqlerrm` — into
`private.notification_dispatch_failures` instead of discarding it. That
insert is itself wrapped in one more last-resort `exception when others
then null;`, so even a pathological failure recording the failure record
still cannot propagate up and break the business mutation — but every
field written into that table was already proven valid earlier in the same
call (the `audit_logs` insert already succeeded with the same
`organization_id`/`actor_type`/`action`/`entity_type`; `metadata` was
already coalesced), so this inner fallback is a defensive last resort, not
the expected path.

This is a **repair of a real gap**, not a broad redesign: it does not
change what triggers fire on, what gets audited, who receives
notifications, or any RLS/grant. The smallest-safe-design choice made here
(see the migration's own header comment for the full reasoning) was:
persist an observable, retryable failure record rather than either (i)
making the whole design strictly transactional (which would mean a
notification-subsystem bug could block core business operations like
creating a lead or sending an invoice — a much larger blast-radius
increase than this gap), or (ii) leaving the swallow in place.

One known, intentionally out-of-scope limitation: the fan-out loop still
shares one savepoint across all recipients of a single event. If recipient
2 of 3 fails, recipients 1's already-inserted notification is rolled back
too (proven in
`tests/phase11/integration/event-atomicity.test.mjs`'s "no partial/corrupt
notification" test) — there is currently no per-recipient isolation. Adding
that would mean a nested `begin/exception` per loop iteration, which is a
larger change than this fix's scope; note it here for a future pass if
partial-recipient-success ever becomes a real requirement.

`private.notification_dispatch_failures` is not exposed to any admin UI.
The only reader is the new `list_notification_dispatch_failures()`
RPC (`service_role` only, clamped to 100 rows, ordered newest-first) — added
specifically so the failure record is genuinely observable (by an ops
script, a future retry consumer, or a test) rather than reachable only via
direct database access. No automatic retry consumer exists yet; building
one is a legitimate follow-up, not part of this fix.

## Public RPCs

Granted to `authenticated`:

1. `list_my_notifications(p_limit, p_before)` — clamped to 50, own rows only.
2. `get_my_unread_notification_count()`
3. `mark_notification_read(p_notification_id)`
4. `mark_all_notifications_read()`
5. `set_notification_preference(p_event_type, p_in_app, p_email)` — upserts
   on `(profile_id, event_type)`.
6. `list_audit_logs(p_limit, p_offset, p_entity_type, p_action, p_from,
   p_to)` — clamped to 100. Re-checks `super_admin`/`admin` membership
   itself (not just RLS) and raises a plain error otherwise — defense in
   depth, verified live in
   `tests/phase11/integration/rls-notifications-and-audit.test.mjs`.

Granted to `service_role` only:

7. `raise_due_invoice_reminders()` — see "Reminder windows" below. Also
   performs the cross-organization overdue sweep itself; it does **not**
   call `public.refresh_overdue_invoices()` (that function is scoped to the
   caller's own session organization via `auth.uid()` and silently no-ops
   under a service-role connection — see migration reconciliation note 7).
8. `raise_due_renewal_reminders()`
9. `raise_due_lead_follow_ups()`
10. `claim_pending_email_deliveries(p_limit)` — `for update skip locked`,
    flips `pending` → `sending`. Returns raw notification fields (`title`,
    `message`, `event_type`, `entity_type`, `entity_id`), not a pre-built
    `subject`/`body_html` — HTML templating happens in
    `src/lib/email/templates/notification-email.ts` (escaped via
    `escape-html.ts`), matching how every other transactional email in this
    repo is built, rather than duplicating escaping logic in SQL.
11. `mark_email_delivery_result(p_delivery_id, p_status, p_error_code,
    p_provider_reference)` — `sent` sets `sent_at`; `failed` increments
    `attempt_count` and either backs off (`1m, 5m, 30m, 2h, 6h`) or, at
    attempt 5, becomes terminal (`status = 'failed'`, never reclaimed again).
12. `list_notification_dispatch_failures(p_limit)` — added by the
    `20260806010000` follow-up. Clamped to 100, newest first. See "Event
    atomicity" above.

## Trigger-first instrumentation

14 `AFTER` triggers, all named `<table>_emit_events`, all calling
`private.emit_event`. 11 are from the approved handoff's trigger table
(`leads`, `clients`, `client_invitations`, `projects`, `milestones`,
`proposals`, `invoices`, `payments`, `revisions`, `support_tickets`,
`subscriptions`). 3 more (`project_members`, `subscription_usage`,
`project_files`) were added because the handoff's own "must create an audit
record" action list requires `project_member.added/removed`,
`subscription.usage_recorded`, and `file.uploaded_internal/client`, none of
which had a table in the original 11 — see reconciliation note 3 in the
migration header.

Two triggers deliberately fire on more columns than the handoff's literal
table specified, because the handoff's own recipient/action requirements
were otherwise unreachable:

- `leads_emit_events` fires on `UPDATE OF status, converted_client_id` (not
  just `status`) — `convert_lead_to_client()` sets `converted_client_id`
  without touching `status` in the same `UPDATE`, so `lead.converted` would
  never fire otherwise.
- `revisions_emit_events` fires on `UPDATE OF status, assigned_to` (not just
  `status`) — `revision.assigned` has no other reachable trigger surface.

## Event types

46 values, defined once in SQL (three identical `check` constraints:
`audit_logs.action`, `notifications.event_type`,
`notification_preferences.event_type`) and mirrored exactly in
`src/features/notifications/constants.ts`'s `NOTIFICATION_EVENT_TYPES`.
`tests/phase11/unit/event-types.test.mjs` asserts both directions — a
mismatch fails the unit suite, not just at runtime.

Reminder actions use the handoff's recipient-table names
(`invoice.reminder_due`, `subscription.renewal_due`, `lead.follow_up_due`),
not its separate audit-action-table names
(`invoice.reminder_sent`/etc.) — `audit_logs.action` and
`notifications.event_type` are the same string per emission
(`private.emit_event` takes one `p_action`), so one name had to win; see
reconciliation note 2.

`role.changed` and `proposal.access_token_reissued` are defined in the check
constraints but never emitted this phase — no role-management UI exists yet,
and no trigger surface reaches `proposal_access_tokens`. Wiring them is a
follow-up, not a Phase 11 gap.

## Reminder windows

| Reminder | Eligible base filter | Windows |
| --- | --- | --- |
| Invoice | `status in (sent, partial, overdue)`, `due_date` not null, balance > 0 | `due-3`, `due-0`, `overdue+7` |
| Renewal | `status = active`, `renewal_at` not null | `renewal-14`, `renewal-3` |
| Lead follow-up | `status in (contacted, discovery, proposal, negotiation)` | ISO date of the 7-day-since-last-activity threshold crossing (`greatest(updated_at, coalesce(max(lead_activities.created_at), created_at)) + 7 days`) |

Each reminder is raised at most once per `(reminder_type, entity_id,
window_key)` — enforced by `private.reminder_runs`'s unique constraint, not
merely by application logic. Cron cadence (hourly assumed, see `vercel.json`)
is therefore a tuning knob, not a correctness dependency: running the full
cron path any number of times, any number of times concurrently, raises each
reminder exactly once.

## Delivery lease and claim identity

The email outbox (`public.notification_deliveries`) is a leased work queue.
Two follow-up migrations built it: `20260806020000` added the lease,
`20260806030000` gave each lease an identity.

### Lease columns

| Column | Meaning |
| --- | --- |
| `claimed_at` | When the current claim was taken. Since migration 4 this doubles as the claim's **identity**. `null` unless `status = 'sending'`. |
| `lease_expires_at` | `claimed_at + 10 minutes`. Past this, the row is reclaimable by any runner. `null` unless `status = 'sending'`. |

Four CHECK constraints make illegal lease states unrepresentable rather than
merely unwritten. The first three are mutually exclusive and exhaustive over
`notification_deliveries_status_check`'s four values, so together they fully
define lease-field presence for every possible row:

```text
notification_deliveries_pending_has_no_lease      status='pending'        -> both null
notification_deliveries_sending_requires_lease    status='sending'        -> both not null
notification_deliveries_terminal_has_no_lease     status in (sent,failed) -> both null
notification_deliveries_lease_expires_after_claimed                       -> lease > claimed
```

`notification_deliveries_expired_lease_idx` is a partial index on
`(lease_expires_at) where status = 'sending'`, supporting the reclaim branch;
the pre-existing `notification_deliveries_pending_idx` covers the pending
branch.

### The 10-minute lease

Long enough for one real Resend call to complete; short enough that a
genuinely crashed runner's rows become reclaimable well inside one hourly
cron cycle. It is deliberately longer than the Vercel function timeout
(300 s default), so a *live* runner is killed before its own lease can
expire — a live worker and a reclaim of its row cannot coexist on Vercel with
default settings.

### Expired-lease reclaim

`claim_pending_email_deliveries` selects from two branches under one shared
`p_limit` budget, ordered oldest-first, both under `for update skip locked`:

```text
status='pending'  and next_attempt_at  <= now()     -- fresh work
status='sending'  and lease_expires_at <= now()     -- reclaim a dead runner's row
```

Both branches require `attempt_count < 5`, and every claim increments
`attempt_count` by exactly one. **`attempt_count` is incremented at claim time
and nowhere else** — `mark_email_delivery_result` never touches it, so a
crashed attempt (counted at claim) and a reported failure (previously counted
again at mark) can no longer both consume the same attempt.

### `claim_lease_exhausted` — terminal handling

A row whose lease expired *and* whose attempt budget is already spent
(`attempt_count >= 5`) can never be claimed again, so it would sit in
`'sending'` forever. Before selecting any new work, every
`claim_pending_email_deliveries` call unconditionally retires such rows:

```text
status -> 'failed', last_error_code -> 'claim_lease_exhausted',
claimed_at -> null, lease_expires_at -> null
```

This is a plain `UPDATE`, not `for update skip locked`: there is no limited
batch being fairly distributed, only rows retired the moment any caller
reaches them. A second concurrent caller simply matches zero rows once the
first commits. Combined with `sending_requires_lease`, this means **no row can
remain in `'sending'` permanently**.

### `claimed_at` compare-and-set (the claim identity)

Migration 3 bounded a claim but left `mark_email_delivery_result` identifying
its target by `(id, status = 'sending')` alone. That predicate can tell *that*
a claim is in flight, not *which* — and the lease design's own premise is that
a stalled worker outlives its lease. The reachable failure:

```text
1. Worker A claims          -> attempt_count=1, status='sending', lease L1
2. Worker A stalls past L1
3. Worker B reclaims        -> attempt_count=2, status='sending', lease L2
4. Worker B reports failure -> status='pending', next_attempt_at=+5m
5. Backoff elapses; Worker C claims
                            -> attempt_count=3, status='sending', lease L3
6. Worker A finally reports its stale attempt-1 result
   -> old predicate MATCHES Worker C's live claim
```

Steps 1-5 alone were already safe: at step 5 the row is `'pending'` or
terminal, so the old predicate rejected A. Only the re-claim at step 5
reopened the window.

Migration 4 closes it. `claim_pending_email_deliveries` now returns
`claimed_at` for every claimed row, and `mark_email_delivery_result` requires
that value back as `p_claimed_at`. Every statement it executes is guarded by
all three predicates:

```sql
where id = p_delivery_id
  and status = 'sending'
  and claimed_at = p_claimed_at
```

Two claims of one row are necessarily at least one lease apart (a reclaim
requires lease expiry), so `claimed_at` uniquely identifies a claim — no extra
column, index, or constraint was needed.

The runner (`src/lib/reminders/run-reminders.ts`) threads the value straight
through to both the success and failure calls. It passes the **raw string**
PostgREST returned and must never wrap it in `new Date(...)`: JavaScript
`Date` truncates PostgreSQL's microsecond precision to milliseconds, and the
comparison would miss.

### Stale worker results are safe no-ops

A result whose `p_claimed_at` is not the row's current `claimed_at` matches
zero rows and returns without error — a late arrival is legitimate, not a
caller bug. Concretely, a stale claimant can never:

- revert `sent` to `pending`, or overwrite any newer `failed`/`sent` state
- clear a newer worker's lease
- schedule another retry, or alter `next_attempt_at`
- change `last_error_code`, `sent_at`, or `provider_reference`
- overwrite a `claim_lease_exhausted` retirement
- produce inconsistent `attempt_count` state

A **null** `p_claimed_at` is different: that is a caller that forgot to thread
the identity through, so it raises rather than silently resolving nothing.

`tests/phase11/integration/stale-worker-result.test.mjs` reproduces the exact
six-step sequence above against live TEST and asserts the row is byte-for-byte
unchanged from the third claim, then that the third claim still settles
normally.

### Function identities

Migration 4 **drops** both old identities rather than replacing them:

| RPC | Before | After |
| --- | --- | --- |
| `claim_pending_email_deliveries` | `(integer)` returning 7 columns | `(integer)` returning 8 columns (adds `claimed_at`) |
| `mark_email_delivery_result` | `(uuid, text, text, text)` | `(uuid, text, timestamptz, text, text)` |

Both drops are mandatory, for different reasons. `claim`'s `RETURNS TABLE`
shape changes, and `CREATE OR REPLACE` cannot change a function's return type.
`mark` *gains a parameter*, which in PostgreSQL creates a **second overload**
rather than replacing the first — leaving the old 4-argument identity callable
and still able to accept a stale result. `p_claimed_at` sits third because
PostgreSQL requires every parameter after a defaulted one to also have a
default, and it is mandatory; callers use named arguments, so position is not
a compatibility concern.

The migration ends with a `do $postcheck$` block asserting exactly one
identity exists per RPC and that the legacy signature is gone, then issues
`notify pgrst, 'reload schema'` so PostgREST stops resolving the dropped
overload from cache.

## Duplicate-prevention layers (all DB-enforced, not application-level)

1. `private.reminder_runs` unique constraint — a reminder is raised once,
   ever, per window.
2. `notifications` unique dedupe index — `on conflict do nothing` in
   `private.emit_event`.
3. `claim_pending_email_deliveries`'s `for update skip locked` — two
   concurrent cron/manual runs can never claim the same outbox row.
4. The `claimed_at` compare-and-set in `mark_email_delivery_result` — a
   superseded claim cannot return a row to `pending` and so cannot cause a
   redundant re-send.
5. Resend's `idempotencyKey` (`ResendSendOptions`), set to the delivery row's
   id in `sendNotificationEmail()` — provider-side dedup on top of all four
   DB-side layers. The row id is stable across reclaims (asserted by
   `delivery-lease.test.mjs`), and the maximum cumulative backoff
   (1m+5m+30m+2h+6h = 8h36m) sits inside Resend's 24-hour idempotency window,
   so every retry of one delivery shares one key.

## Environment variables

New: `CRON_SECRET` (`src/config/env.server.ts`, optional, `z.string().trim().min(32)`).
Optional so local dev/tests boot without it; the cron route (`POST
/api/cron/reminders`) fails closed with `401` when it's unset, comparing
`Authorization: Bearer <secret>` in constant time
(`src/lib/reminders/cron-secret.ts`). Never prefix with `NEXT_PUBLIC_`. Set
the same value in Vercel's env (Production + Preview) — Vercel Cron
automatically sends `Authorization: Bearer $CRON_SECRET` when a project env
var is named exactly `CRON_SECRET`.

New, E2E-only, **not yet set** (six variables, `.env.test.local`, gitignored,
documented in `.env.example`):

```text
TEST_P11_INTERNAL_ADMIN_EMAIL
TEST_P11_INTERNAL_ADMIN_PASSWORD
TEST_P11_TEAM_MEMBER_EMAIL
TEST_P11_TEAM_MEMBER_PASSWORD
TEST_P11_CLIENT_OWNER_EMAIL
TEST_P11_CLIENT_OWNER_PASSWORD
```

Deliberately separate from every earlier phase's fixture accounts (same
multi-organization-membership reasoning documented next to `TEST_P9_*` in
`.env.example`), and specifically needs `TEST_P11_INTERNAL_ADMIN` to be
`super_admin` (audit log + "Run reminders now" both require it) — no earlier
phase's fixed admin account is `super_admin`. `tests/phase11/e2e/global-setup.ts`
idempotently creates/repairs these three accounts (and their organization,
membership, client) the first time `npm run test:e2e:phase11` runs with real
values present; running it again is safe.

Existing, now operationally required in production (already optional in the
schema, unchanged): `RESEND_API_KEY`, `EMAIL_FROM`.

## Application routes

```text
/admin/notifications
/admin/notifications/preferences
/admin/settings/audit-log
```

Every one has `loading.tsx` and `error.tsx`. `/admin/notifications` and its
`preferences` child are visible to all four internal roles (every role reads
their own feed and manages their own preferences). `/admin/settings/audit-log`
reuses `requireSettingsAccess()` — extracted from
`src/app/admin/settings/page.tsx` into `src/lib/auth/settings-access.ts` for
this reuse — so it shares the exact `super_admin`/`admin` gate, redirecting
everyone else to `/admin?notice=settings_access_denied` (a real rendered
notice, not a crash).

`GET /api/cron/reminders` — Bearer `CRON_SECRET`. This is the path Vercel
Cron actually invokes (Vercel Cron sends `GET`, not `POST` — see
https://vercel.com/docs/cron-jobs — and automatically attaches
`Authorization: Bearer $CRON_SECRET` to that request when a project env var
is named exactly `CRON_SECRET`). `POST` is kept as an authenticated
manual/testing alias only (e.g. a `curl` check during deploy verification)
and calls the exact same handler as `GET` — there is one shared
`handleReminders()` function, not two copies of the logic. `PUT`/`DELETE`
remain `405`. Missing, invalid, or unset `CRON_SECRET` all return `401`
regardless of method; the received header value is never logged. Response
body is counts only (`raised`, `sent`, `failed`), never entity data — see
`tests/phase11/unit/cron-route.test.mjs` for the full route-level test
matrix (valid GET, missing/wrong/unset secret, no secret leakage, POST
parity, method rejection, generic-500-never-raw-error).

### Vercel plan requirement — read before deploying

`vercel.json` schedules this route hourly (`"0 * * * *"`). **This requires a
Vercel plan that supports sub-daily cron invocations (Pro or higher).** On
the Hobby plan, Vercel silently limits cron jobs to **once per day** — an
hourly schedule configured on Hobby will not run hourly; Vercel will only
invoke it once daily (typically at a fixed time it chooses, not necessarily
matching the configured hour). This was **not changed** during this fix —
changing the business cadence is not this fix's call to make. If the
project will run on Hobby, `vercel.json`'s `schedule` must be changed to a
once-daily cron expression (e.g. `"0 6 * * *"`) as an explicit, separate
decision, and the reminder windows in "Reminder windows" below should be
re-reviewed against a daily cadence (they were sized assuming hourly
granularity is available; daily-only invocation still raises every reminder
correctly — `private.reminder_runs` doesn't care how often the RPC runs —
but a `due-0` invoice reminder could now fire up to ~23 hours later in the
day than intended). Confirm the target Vercel plan before deploying, and
update `vercel.json`'s `schedule` value to match it explicitly rather than
assuming.

## Applying the claim-identity migration

`20260806030000_fix_phase_11_claim_identity.sql` **has been applied to TEST**
and catalog-verified (results below). It was applied as a single file through
the Supabase Management API's `POST /v1/projects/{ref}/database/query`
endpoint — the same direct-SQL model every prior phase used. This repo has
never used `supabase db push` (`supabase_migrations.schema_migrations` does not
exist on TEST at all), so there is no CLI-tracked history record to add and no
`migration repair` to run: there is no history gap, only an untracked-by-design
application model.

Applying it requires a Supabase account with access to
`akcxsmdodfgfqilavnlf`. If `supabase projects list` does not show that ref, or
`supabase projects api-keys --project-ref akcxsmdodfgfqilavnlf` returns HTTP
403, run `npx supabase login` as the owning account and re-run
`npx supabase link --project-ref akcxsmdodfgfqilavnlf` first. Note that
`supabase/.temp/pooler-url` stores **no** database password, so a direct
`psql`/driver connection is not available as a fallback without one.

Verified post-apply state on TEST:

```text
claim_pending_email_deliveries | p_limit integer
  -> TABLE(delivery_id uuid, claimed_at timestamp with time zone,
           recipient_email text, event_type text, title text, message text,
           entity_type text, entity_id uuid)
mark_email_delivery_result     | p_delivery_id uuid, p_status text,
                                 p_claimed_at timestamp with time zone,
                                 p_error_code text, p_provider_reference text
  -> void

both: prosecdef = true, proconfig = {"search_path=\"\""},
      proacl = postgres=X/postgres, service_role=X/postgres
      (no anon, no authenticated, no bare PUBLIC grant)

to_regprocedure('public.mark_email_delivery_result(uuid,text,text,text)') = NULL
PostgREST: p_claimed_at signature resolves; legacy 4-arg call -> PGRST202
```

### Catalog verification (run against TEST after applying)

```sql
-- 1. Lease columns exist and are nullable timestamptz.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'notification_deliveries'
  and column_name in ('claimed_at', 'lease_expires_at')
order by column_name;
-- expect exactly 2 rows, both 'timestamp with time zone', both is_nullable='YES'

-- 2. All four lease CHECK constraints are present.
select conname
from pg_constraint
where conrelid = 'public.notification_deliveries'::regclass
  and contype = 'c'
  and conname in (
    'notification_deliveries_pending_has_no_lease',
    'notification_deliveries_sending_requires_lease',
    'notification_deliveries_terminal_has_no_lease',
    'notification_deliveries_lease_expires_after_claimed'
  )
order by conname;
-- expect exactly 4 rows

-- 3. The partial reclaim index exists and is scoped to status='sending'.
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and indexname = 'notification_deliveries_expired_lease_idx';
-- expect 1 row; indexdef must contain "WHERE (status = 'sending'::text)"

-- 4. EXACT RPC identities — this is the critical check. Expect exactly two
--    rows, and no other overload of either name.
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as identity_args,
  pg_get_function_result(p.oid)             as result,
  p.prosecdef                               as security_definer,
  p.proconfig                               as settings
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('claim_pending_email_deliveries', 'mark_email_delivery_result')
order by p.proname;
-- expect EXACTLY 2 rows:
--   claim_pending_email_deliveries | p_limit integer
--       | TABLE(delivery_id uuid, claimed_at timestamp with time zone, ...)
--   mark_email_delivery_result
--       | p_delivery_id uuid, p_status text, p_claimed_at timestamp with time zone,
--         p_error_code text, p_provider_reference text
--       | void
-- both with security_definer = true and settings = {"search_path="}

-- 5. The legacy 4-argument signature is GONE.
select to_regprocedure('public.mark_email_delivery_result(uuid, text, text, text)') as legacy;
-- expect NULL

-- 6. Grants: service_role only; never anon/authenticated/PUBLIC.
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as identity_args,
  coalesce(array_to_string(p.proacl, ', '), '(default: PUBLIC)') as acl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('claim_pending_email_deliveries', 'mark_email_delivery_result');
-- expect each acl to grant EXECUTE to service_role and to contain no
-- 'anon=X' or 'authenticated=X' entry, and no bare '=X/' (PUBLIC) entry

-- 7. Nothing is stuck: no 'sending' row may lack a lease, and no expired,
--    attempt-exhausted row may still be 'sending'.
select count(*) filter (where status = 'sending' and (claimed_at is null or lease_expires_at is null)) as illegal_sending,
       count(*) filter (where status = 'sending' and lease_expires_at <= now() and attempt_count >= 5) as unretired
from public.notification_deliveries;
-- expect 0, 0 (the first is also structurally impossible via CHECK)
```

## Generated database types

`src/types/database.ts` was regenerated from TEST (`npx supabase gen types
typescript --linked --schema public > src/types/database.ts`) after migrations
1-3 were applied — never hand-edited.

It has since been regenerated for migration 4 as well, so `Database` now
carries both claim-identity shapes:

```ts
claim_pending_email_deliveries: {
  Args: { p_limit?: number }
  Returns: { claimed_at: string; delivery_id: string; /* … */ }[]
}
mark_email_delivery_result: {
  Args: {
    p_claimed_at: string        // required — no `?`
    p_delivery_id: string
    p_error_code?: string
    p_provider_reference?: string
    p_status: string
  }
  Returns: undefined
}
```

`p_claimed_at` being non-optional is what makes the compare-and-set
contract enforceable at compile time: a caller that forgets to thread the
identity through fails `npm run typecheck`, not just at runtime.

The temporary Phase 10-style bridge that covered the gap
(`src/lib/reminders/supabase.ts`, `asReminderSupabaseClient`) has been
**deleted**; `run-reminders.ts` uses `createAdminClient()` — already
`SupabaseClient<Database>` — directly. No `any`, no `unknown`, no casts, and no
locally duplicated RPC definitions remain in the reminder module.

Regeneration workflow, for future migrations (never edit the generated file by
hand):

```powershell
npx supabase gen types typescript --linked --schema public > src/types/database.ts.tmp
# Verify the required symbols landed BEFORE replacing the real file:
Select-String -Path src/types/database.ts.tmp -Pattern 'claimed_at','p_claimed_at'
# Only if both are present:
Move-Item -Force src/types/database.ts.tmp src/types/database.ts
npm run typecheck
```

## Test commands

```powershell
npm run test:phase11:unit
npm run test:phase11:integration
npm run test:phase11
npm run test:e2e:phase11
```

Current suite sizes (13 unit files, 9 integration files):

| Tier | Tests | Requires |
| --- | --- | --- |
| `test:phase11:unit` | **107** | nothing (static migration/text assertions, no DB) |
| `test:phase11:integration` | **65** | live TEST with **all four** migrations applied, `--test-concurrency=1` |
| `test:e2e:phase11` | **5** | live TEST + the six `TEST_P11_*` values |

All three tiers are green. The unit tier is safe to run at any time — it
asserts against migration *files*, so it does not care what any environment has
applied. The integration tier requires `20260806030000`: `delivery-lease`,
`delivery-outbox`, and `stale-worker-result` all call
`mark_email_delivery_result` with `p_claimed_at`, which does not resolve
against the pre-migration signature.

The earlier "64 unit / 40 integration" figures in this document were from
before migrations 3 and 4 and their suites existed; they are superseded by the
table above.

### Outbox suites and the shared global queue

`claim_pending_email_deliveries` drains a **global, unscoped** queue by design.
Every outbox suite therefore makes its fixture rows provably first in claim's
ordering by giving them timestamps far older than anything the application
would produce, and calls with `p_limit: 1`:

| Suite | Pending key (`next_attempt_at`) | Reclaim key (`lease_expires_at`) |
| --- | --- | --- |
| `delivery-lease.test.mjs` | `1999-01-01` | `2000-01-01T00:10` |
| `stale-worker-result.test.mjs` | `1999-01-01` | `1998-01-01T00:10` |

The reclaim branch orders by `lease_expires_at`, **not** `next_attempt_at`.
Simulating a stalled worker by expiring only `lease_expires_at` (to
`claimed_at + 1ms`) does expire the lease, but it leaves the row the *newest*
reclaim candidate — any older claimable row anywhere in the queue then wins the
single slot and the reclaim returns somebody else's row. Both suites therefore
backdate the **whole lease window** (`claimed_at` and `lease_expires_at`) when
simulating a stall, never just the expiry.

This was a real intermittent failure, not a theoretical one: `delivery-lease`'s
`expireLease` originally backdated only the expiry, and its two reclaim tests
failed whenever an earlier suite in the same `test:phase11:integration` run
(`event-emission`, `reminders`) had left claimable rows in the queue. Verified
both ways — injecting three pending rows dated one hour ago reproduces the
failure against the old helper and passes 14/14 against the current one.

That makes its rows the highest-impact possible orphans: one left abandoned in
`'sending'` would outrank `delivery-lease`'s sentinels and starve that suite
rather than failing its own. This was confirmed by deliberately injecting such
a row — `delivery-lease`'s first test fails while everything else still passes.
The suite therefore tracks every delivery it creates and force-retires them all
in `after()`, before fixture teardown, so no test outcome can leave a claimable
row behind. **Any new outbox suite must do the same**, and must not introduce a
reclaim key older than `1998-01-01`.

Required regression and build validation (all run as part of this phase's
completion):

```powershell
npm run test:phase8
npm run test:phase9
npm run test:phase10
npm test
npm run lint
npm run typecheck
npm run build
```

## Manual verification checklist

### Already verified (this session, against TEST)

- [x] Migration applied to TEST via direct SQL execution (not `db push`).
- [x] Catalog verified: 5 objects (`audit_logs`, `notifications`,
      `notification_preferences`, `notification_deliveries`,
      `private.reminder_runs`), 14 `emit_events` triggers, RLS enabled on
      all 4 public tables with zero `using (true)` anywhere in the database,
      all grants/revokes as specified.
- [x] Live smoke test: inserting a lead fires the trigger, writes exactly
      one `audit_logs` row, resolves the correct (email-having) recipients,
      creates the matching `notification_deliveries` row.
- [x] `src/types/database.ts` regenerated and confirmed to include every new
      table/function for **all four** migrations — never hand-edited.
- [x] Phase 11 unit suite green (107/107), including the 13 static
      claim-identity tests.
- [x] `npm run lint`, `npm run typecheck`, `npm run build` all clean with the
      claim-identity change in place.
- [x] Phase 11 integration suite green twice (40/40) against live TEST **as of
      migrations 1-3**; must be re-run at 59/59 once migration 4 is applied,
      covering: exactly-one-audit-row-per-mutation, actor exclusion,
      suspended-member denial, cross-organization notification/audit
      isolation, the dedupe unique index rejecting a literal duplicate,
      audit immutability (no role can `UPDATE`/`DELETE` through PostgREST),
      reminder idempotency for all three reminder types with real window
      dates, exclusion of paid/void/draft invoices and cancelled
      subscriptions and won/lost leads, concurrent-claim non-overlap,
      retry backoff and the attempt-5 terminal state, and every
      service-role-only RPC rejecting an authenticated caller.
- [x] `npm run lint` / `npm run typecheck` clean.

### Not yet done (manual follow-up required)

- [x] Applied `20260806030000_fix_phase_11_claim_identity.sql` to TEST and ran
      the catalog verification — exactly two RPC identities, legacy signature
      `NULL`, grants `service_role`-only.
- [x] The six `TEST_P11_*` values are present in `.env.test.local`;
      `npm run test:e2e:phase11` green 5/5, twice.
- [x] Regenerated `src/types/database.ts` from TEST — carries `claimed_at` on
      the claim RPC and a required `p_claimed_at` on the mark RPC.
- [x] Deleted the temporary bridge `src/lib/reminders/supabase.ts`;
      `run-reminders.ts` now uses the generated `Database` types directly.
- [x]Run the full regression suite (`npm run test:phase8/9/10`, `npm test`,
      `npm run build`) — see the completion report for this session's actual
      results.
- [x]Apply this same reviewed migration file to DEV, then repeat the
      catalog-verification steps above against DEV specifically.
- [ ] Link the project to Vercel, set `CRON_SECRET`/`RESEND_API_KEY`/
      `EMAIL_FROM` in its env, confirm `vercel.json`'s cron entry is picked
      up.
- [ ] Smoke test in a real deploy: one real cron invocation returns `200`;
      an immediate second invocation raises zero duplicate reminders; a
      request with a wrong `Authorization` header returns `401`.
- [ ] Send a real invoice → confirm the bell increments → confirm exactly
      one `audit_logs` row.

## Unresolved decisions carried over from the handoff (business calls, not technical ones)

Implemented with the handoff's own stated "assumed" defaults; revisit if the
business wants different values — none of these are hard-coded in a way
that resists changing later:

1. Cron cadence: hourly (`vercel.json`). Reminder windows: invoice
   `-3/0/+7` days, renewal `-14/-3` days.
2. Lead follow-up staleness threshold: 7 days (`FOLLOW_UP_WINDOW_DAYS` in the
   migration; also asserted in
   `tests/phase11/unit/dedupe-key.test.mjs`).
3. Client reminder recipients (`invoice.reminder_due` /
   `subscription.renewal_due`): `client_users` with role `owner`/`manager`,
   **not** the raw `clients.email` column — `notifications.user_id` is a
   `not null` FK to `profiles(id)`, and there is no schema-consistent way to
   deliver to a bare email address with no profile behind it. A client with
   no portal owner/manager account simply receives no emailed reminder this
   phase; admins still do. See reconciliation note 6.
4. Audit retention: indefinite. No pruning job exists; this is a Phase 12
   decision if row volume ever justifies one.
5. Manual "Run reminders now": `super_admin` only
   (`canRunRemindersManually` in `src/features/notifications/permissions.ts`).

## Deferred functionality

Explicitly out of scope this phase, per the approved handoff:

- Client-facing in-app portal notifications (clients get email only).
- SMS or push channels (`notification_deliveries.channel` allows `'email'`
  only for now, by design, so adding a channel later is additive).
- Realtime/websockets — the feed is server-rendered; the bell refetches on
  open, not via a live subscription.
- Digest emails (daily/weekly).
- Slack/Teams/outbound webhooks.
- AI features (F-090–F-095) and reporting (F-099–F-104) — Phase 12.
- Automatic subscription charging/renewal billing (already deferred in
  Phase 10).
- Retiring `lead_activities`/`revision_activities`/`ticket_activities` — the
  audit log is a security record, not a replacement for domain activity
  history.
