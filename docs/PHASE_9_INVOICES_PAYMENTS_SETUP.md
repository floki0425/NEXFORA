# Phase 9 — Invoices + Payments Setup

Covers what was built for Phase 9 (NEXFORA OS V0.3: Invoices, Payment
Tracking, PayMongo, Payment Webhooks), how to configure it, and how to
verify it manually. Support tickets, maintenance subscriptions, renewals,
AI, accounting integrations, automatic tax filing, and payroll are
explicitly out of scope for this phase — see ROADMAP.md.

## 1. Migration

`supabase/migrations/20260804000000_phase_9_invoices_payments.sql` — a
single new migration. It does not modify any already-applied migration.

Apply it the same way every prior phase's migration was applied: paste the
file into the Supabase Dashboard's SQL Editor and run it, once per project
(both your dedicated Phase 8 test project and your real dev project need
Phase 9 applied — check `TEST_SUPABASE_URL` in `.env.test.local` and
`NEXT_PUBLIC_SUPABASE_URL` in `.env.local`). The Supabase CLI's `db push`
is not available in this environment (the linked CLI account does not have
access to either project) — this is the same limitation documented for
every prior phase here.

## 2. Tables

- **`public.invoices`** — `organization_id`, `client_id` (FK `on delete
  restrict` — a client with billing history can never be deleted), optional
  `project_id`, `invoice_number` (null until sent, unique per organization,
  format `NXF-INV-YYYY-NNNN`), `status`
  (`draft`/`sent`/`partial`/`paid`/`overdue`/`void`), `currency`,
  `subtotal`/`discount`/`tax`/`total` (all `numeric(14,2)`), `amount_paid`
  (trigger-maintained from `payments`, never directly written by the
  application), `balance_due` (a **generated column**, `total -
  amount_paid` — cannot drift, since Postgres recomputes it on every read),
  `issue_date`/`due_date`, `sent_at`/`viewed_at`/`paid_at`/`voided_at`,
  internal-only `notes`, `created_by`.
- **`public.invoice_items`** — `invoice_id`, `description`, `quantity`
  (`numeric(10,2)`), `unit_price` (`numeric(14,2)`), `line_total` (a
  **generated column**, `quantity * unit_price`), `sort_order`. Uses a
  single `description` field (not DATABASE.md's suggested `name` +
  `description` pair) and a stored `line_total` column — both deliberately
  match this phase's task specification's exact field list; see the
  migration's own comment on `public.invoice_items` for the full reasoning.
- **`public.payments`** — `organization_id`/`client_id` (denormalized from
  the invoice, mirroring `project_files`'s identical pattern from Phase 8,
  so RLS never needs an extra join), `invoice_id` (FK `on delete
  restrict`), `amount` (`numeric(14,2)`, `check > 0`), `currency`,
  `payment_method` (`bank_transfer`/`gcash`/`card`/`cash`/`other`),
  `provider` (`manual`/`paymongo`), `provider_reference`, `status`
  (`pending`/`processing`/`paid`/`failed`/`refunded`/`cancelled`),
  `paid_at`, `recorded_by` (manual only), `notes`, `metadata` (jsonb — only
  non-sensitive derived fields, e.g. a checkout URL, never a raw webhook
  payload), `idempotency_key` (unique, manual-payment retry safety),
  `provider_event_id` (unique, webhook retry safety).
- **`private.invoice_number_counters`** — one row per
  `(organization_id, number_year)`, incremented atomically inside
  `private.next_invoice_number()`. Independent from
  `private.proposal_number_counters` — invoice and proposal numbering never
  share a sequence.

## 3. Money representation

`numeric(14,2)` throughout, exactly like `proposals`/`proposal_items` —
never `real`/`double precision`. All trusted arithmetic (subtotal from line
items, total from subtotal/discount/tax, amount_paid from paid payments,
balance_due from total/amount_paid) happens in Postgres via triggers or
generated columns — the application never computes and submits a total. The
one place JavaScript multiplies a money value (`toCentavos()` in
`src/lib/paymongo/money.ts`, converting to PayMongo's required integer
centavos) operates on an amount already computed server-side moments
earlier, uses `Math.round` to guard against IEEE754 drift, and is
independently re-verified by `start_paymongo_checkout` against the
invoice's own `balance_due` before anything is persisted.

## 4. Statuses and derivation

`draft → sent → (partial) → paid`, with `overdue` and `void` as
side-branches. Every transition is server-derived, never browser-declared:

- **draft → sent**: `send_invoice()` only, requires ≥1 line item, a
  positive total, and a due date that is not in the past.
- **sent/partial/overdue → partial/paid**: automatic, via a trigger chain —
  `payments_recalculate_invoice_amount_paid` (after any payments write)
  recomputes `invoices.amount_paid` from the sum of `paid` payments, which
  fires `invoices_derive_payment_status` (before update of amount_paid):
  `balance_due <= 0` → `paid` (+ `paid_at`); `amount_paid > 0` → `partial`;
  otherwise unchanged. `paid` is a stable terminal state — a later
  `refunded` payment does not reopen the invoice (refund handling is
  deferred to Phase 10+, kept in the status list for schema completeness
  only).
- **sent/partial → overdue**: `public.refresh_overdue_invoices()`, called
  at the top of the admin invoice list/detail queries
  (`src/features/invoices/queries.ts`) — a cheap, idempotent,
  organization-scoped `UPDATE`. No cron/scheduler is required. For the
  client-facing read functions (`get_client_invoices` /
  `get_client_invoice_detail`), the *displayed* status is additionally
  computed live via `private.effective_invoice_status()`, so a client never
  sees a stale `sent` past its due date even if no admin has loaded the
  list recently to trigger the persisted refresh.
- **→ void**: `void_invoice()` only, from any status except `paid` or
  already-`void`. Line items and payment history are never deleted.

## 5. Permissions

Matches `PROPOSAL_MANAGER_ROLES` exactly (invoices carry official numbers
and payment history, at least as sensitive as proposals):

| Action | super_admin / admin | project_manager | team_member |
| --- | --- | --- | --- |
| View | ✓ | ✓ | ✓ |
| Create / edit draft | ✓ | ✗ | ✗ |
| Send / void | ✓ | ✗ | ✗ |
| Record manual payment | ✓ | ✗ | ✗ |

Enforced twice: RLS (`invoices_insert_invoice_managers` /
`invoices_update_invoice_managers`, both requiring `super_admin`/`admin`)
and the application layer (`INVOICE_MANAGER_ROLES` in
`src/features/invoices/constants.ts`, checked by every server action).

Portal (client) access: any active `client_users` role may view invoices
and payment history for their own client; only `owner`/`manager` may
initiate a PayMongo payment (mirrors the file-upload/revision-submission
owner/manager-write, viewer-read-only pattern from Phase 8).

## 6. Numbering strategy

`private.next_invoice_number(organization_id)` — same race-safe
upsert-and-increment pattern as `private.next_proposal_number()`:
`insert ... on conflict (organization_id, number_year) do update set
last_value = last_value + 1 returning last_value`, format `NXF-INV-<year>-
<value padded to 4 digits>`. Assigned exactly once, only inside
`send_invoice()`, only when `invoice_number is null` (guaranteed by the
`invoices_invoice_number_presence_check` constraint: `status = 'draft'`
iff `invoice_number is null`). A draft is never assigned a number; voiding
or re-sending never reassigns or reuses one.

## 7. Sending workflow

Admin edits a draft (`/admin/invoices/[id]/edit`), adds line items, clicks
**Send invoice** → `sendInvoiceAction` calls the `send_invoice` RPC
(assigns the number, sets `issue_date` to today, flips `status = 'sent'`,
all atomically) → on success, looks up the client's `email` and calls the
centralized `sendInvoiceEmail()` (never called from a component — mirrors
`sendProposalEmail`'s exact architecture: degrades to a safe, distinct
message for `not_configured` / `invalid_recipient` / `provider_error`,
never throws, never silently reports success on failure). **Resend email**
(`resendInvoiceEmailAction`) re-sends the same content without touching
invoice state, so a retried email can never create a duplicate number or
version. The emailed link points at `/portal/invoices/[id]` (the client
portal), never `/admin/...`.

## 8. Manual payment workflow

Admin opens a sent/partial/overdue invoice, fills the **Record a payment**
form (amount, method, paid date, optional reference/note) →
`recordManualPaymentAction` calls `record_manual_payment`, which:

1. Short-circuits to the original result if `idempotency_key` was already
   used for this exact invoice (retry-safe — a double-click or
   refresh-resubmit never double-counts). The key is generated once by the
   client component (`useRef(() => crypto.randomUUID())` in
   `record-payment-form.tsx`) and reused across retries of the same
   submission, never regenerated server-side.
2. Rejects outright if the amount would exceed `balance_due` — no
   overpayment support in this phase.
3. Inserts a `payments` row with `status = 'paid'` directly (manual
   recording *is* the confirmation; there is no async step) and
   `recorded_by`/`created_at` as the audit trail.
4. The `amount_paid`/status-derivation trigger chain (section 4) does the
   rest.

## 9. Partial / full / overdue calculations

Exactly the formulas the task specified, all computed server-side:

- `balance_due = total` → nothing paid yet (displayed as `sent`, or
  `overdue` if past due).
- `0 < balance_due < total` → `partial`.
- `balance_due = 0` → `paid`.
- `due_date < current_date and balance_due > 0` → `overdue` (see section 4
  for exactly where/how this is computed).

## 10. PayMongo integration

`src/lib/paymongo/client.ts` (server-only) wraps PayMongo's **hosted
Checkout Sessions API** — the client is redirected to a PayMongo-hosted
page, never handles card data directly, and no `PAYMONGO_PUBLIC_KEY` /
client-side tokenization is needed for this flow. Flow:

1. Client clicks **Pay online** (`/portal/invoices/[id]`, owner/manager
   only) → `createPaymongoCheckoutAction` reads the invoice's
   authenticated, RLS-protected `balance_due`, calls PayMongo to create a
   session with that amount, then calls `start_paymongo_checkout` to
   persist a `pending` payment row.
2. `start_paymongo_checkout` independently re-verifies the amount/currency
   against the invoice's own `balance_due` (rejects on mismatch — never
   trusts the app layer's relayed figure) and enforces **one active session
   per invoice** via a partial unique index
   (`payments_invoice_active_paymongo_session_unique`, on
   `(invoice_id) where provider='paymongo' and status in ('pending',
   'processing')`). A session simply abandoned by the client (tab closed,
   no webhook ever fires) does not block forever — sessions older than 24
   hours (PayMongo's documented session TTL) are auto-cancelled the next
   time a checkout is started for that invoice.
3. Client completes (or abandons) checkout on PayMongo's page, redirected
   back to `/portal/invoices/[id]?payment=success` or `?payment=cancelled`
   — this redirect is **never** treated as proof of payment; it only shows
   a "we're confirming" message.
4. PayMongo sends a webhook to `/api/webhooks/paymongo`, which is the only
   thing that actually settles a payment (section 11–12).

### Required environment variables

```
PAYMONGO_SECRET_KEY=
PAYMONGO_WEBHOOK_SECRET=
```

Both optional at the schema level — `isPaymongoConfigured()` returns
`false` and "Pay online" reports a clear setup error instead of crashing
when `PAYMONGO_SECRET_KEY` is unset; the webhook route rejects every
request (400) when `PAYMONGO_WEBHOOK_SECRET` is unset, rather than
accepting unverified events. **No live PayMongo credentials were available
in this environment** — the provider boundary (`client.ts`,
`webhook-signature.ts`) and every reconciliation rule were built and
covered by tests that call the database functions directly / mock the
signature math, per the task's explicit instruction to never fake a live
successful payment. See the manual verification checklist (section 15)
for what to check once real PayMongo test-mode keys are available.

## 11. Webhook route

`POST /api/webhooks/paymongo` (`src/app/api/webhooks/paymongo/route.ts`,
Node runtime, reads the raw body — required for signature verification):

1. Verifies `Paymongo-Signature` via `verifyPaymongoWebhookSignature()`
   (`src/lib/paymongo/webhook-signature.ts`) — rejects with **400** on a
   missing/invalid signature or a timestamp more than 5 minutes from now
   (replay protection). This is the one response that is not the generic
   200 — an unverified request must not be acknowledged as received.
2. On a verified request, always responds `{ received: true }` with status
   200 (500 only on an unexpected exception, so PayMongo retries) —
   reconciliation failures (unknown reference, amount mismatch,
   already-processed) are never distinguishable from the HTTP response.
3. Calls `reconcile_paymongo_webhook_event` via the **service-role admin
   client** — the one legitimate Phase 9 use of it, since a webhook request
   carries no Supabase Auth session at all (mirrors the narrow, documented
   admin-client exception from Phase 7's client-invitation onboarding).
   That function is granted to `service_role` only — not `authenticated`,
   not `anon`.
4. Never logs the raw payload, headers, signature, or secrets — only safe,
   derived fields (event type, outcome, masked/absent recipient info).

### Signature scheme

Implemented to PayMongo's documented `t=<timestamp>,te=<test-mode
hex-hmac>,li=<live-mode hex-hmac>` header shape (the same
timestamp-prefixed-HMAC construction Stripe popularized):
`HMAC-SHA256(webhook_secret, "{t}.{raw_body}")`, verified with a
constant-time comparison against whichever of `te`/`li` is present. **This
should be re-verified against PayMongo's current webhook documentation
before going live** — no live webhook call could be exercised in this
environment to empirically confirm the exact header field names.

## 12. Idempotency and reconciliation strategy

- **Manual payments**: `payments.idempotency_key` (unique constraint) +
  `record_manual_payment`'s check-first-then-insert short-circuit.
- **Webhooks**: `payments.provider_event_id` (unique constraint) +
  `reconcile_paymongo_webhook_event`'s check-first `already_processed`
  branch, checked before any other logic runs.
- **Reconciliation** locks the matching payment row (`for update`),
  verifies `amount`/`currency` against what `start_paymongo_checkout`
  recorded, and only then updates `status`/`paid_at` — a mismatch marks the
  payment `failed` instead of ever settling the invoice. Exactly one
  `payments` row is finalized per real transaction; the trigger chain in
  section 4 then recomputes the invoice's trusted totals/status from that
  row, never from anything the webhook payload claims about the invoice
  directly.

## 13. Portal routes

`/portal/invoices` (list, all client roles) and
`/portal/invoices/[invoiceId]` (detail — line items, confirmed payment
history, and **Pay online** for owner/manager on a payable invoice). Both
read exclusively through `get_client_invoices()` /
`get_client_invoice_detail()` (`SECURITY DEFINER`, resolve the caller's
active client membership internally) — there is no client-facing RLS
policy on `public.invoices` itself, for the same reason Phase 7/8 avoided
one: table-level `SELECT` cannot be column-limited per role, so a policy
would also let a client `select *` and see `organization_id`, `notes`,
`created_by`. A draft invoice is never returned by either function. Opening
a sent invoice for the first time idempotently sets `viewed_at` (does not
change `status` — invoices have no distinct "viewed" status value, unlike
proposals).

## 14. RLS boundaries

- `invoices`/`invoice_items`: `SELECT` for any active internal member of
  the organization; `INSERT`/`UPDATE` restricted to `super_admin`/`admin`,
  and only while `status = 'draft'` — sending/voiding/paying always go
  through a `SECURITY DEFINER` function instead, which is what makes "a
  sent invoice's number/history can never be altered by a direct update"
  true regardless of role.
- `payments`: `SELECT` for internal members only; **no** `INSERT`/`UPDATE`/
  `DELETE` grant to `authenticated` at all — every write goes through
  `record_manual_payment`, `start_paymongo_checkout`, or
  `reconcile_paymongo_webhook_event` (service-role only). A forged "paid"
  row from an admin's own browser session is rejected by the grant, not
  just application logic.
- No policy anywhere uses `using (true)`. No portal-facing policy exists on
  any of the three tables — see section 13.

## 15. Generated database types

`src/types/database.ts` must be regenerated after applying the migration
(never hand-edited, per every prior phase's convention):

```
npx supabase gen types typescript --project-id <ref> --schema public > src/types/database.ts
```

Run once per project you applied the migration to, using that project's
own `--project-id`. `src/features/invoices/types.ts` and
`src/features/portal/invoices/types.ts` both reference
`Database["public"]["Tables"]["invoices" | "invoice_items" |
"payments"]`, and `typecheck` will fail until this has been done.

## 16. Tests

- `npm run test:phase9` — unit tests (Zod schemas, permissions,
  `formatMoney`, PayMongo webhook-signature math, PayMongo centavos
  conversion, and static analysis of the migration's SQL text for
  numbering/status/void/payment/RLS rules — the last category needs no
  live database and mirrors `tests/phase8/unit/revision-transitions.test.mjs`'s
  technique) plus integration tests against a real, dedicated non-production
  Supabase project (numbering, draft/sent editability and RLS, cross-org/
  cross-client isolation, manual-payment balance/overpayment/idempotency,
  PayMongo session/webhook reconciliation, overdue derivation). Integration
  tests skip (not pass, not fail) when `TEST_SUPABASE_*` is not configured
  — see `docs/PHASE_8_AUTOMATED_TESTING.md` for how to set up that project;
  Phase 9 reuses it.
- `npm run test:e2e:phase9` — Playwright, a separate config
  (`playwright.phase9.config.ts`, its own `globalSetup`/fixture-ids file)
  from Phase 8's, because **the E2E test accounts must be distinct**:
  reusing `TEST_INTERNAL_ADMIN_EMAIL`/`TEST_CLIENT_OWNER_EMAIL` would give
  that auth user active memberships in two different E2E organizations
  simultaneously, which `requireInternalMember()` and
  `private.active_client_id()` both fail closed on (see AGENTS.md's
  "exactly one active membership" invariant, and the shared-test-email
  lesson already documented in `PHASE_8_AUTOMATED_TESTING.md`). Requires
  `TEST_P9_INTERNAL_ADMIN_EMAIL`/`TEST_P9_INTERNAL_ADMIN_PASSWORD`/
  `TEST_P9_CLIENT_OWNER_EMAIL`/`TEST_P9_CLIENT_OWNER_PASSWORD` in
  `.env.test.local`, plus the app already running against the same
  `TEST_SUPABASE_*` project.
- `npm run test:phase9:all` — both of the above in sequence.

## 17. Manual verification checklist

Automated coverage above does not include a real PayMongo API call. Before
relying on online payments in production:

- [ ] Set real PayMongo **test-mode** `PAYMONGO_SECRET_KEY` /
      `PAYMONGO_WEBHOOK_SECRET`, register the webhook URL
      (`https://<your-domain>/api/webhooks/paymongo`) in the PayMongo
      dashboard.
- [ ] Create and send a real invoice, click **Pay online** as the test
      client, confirm the PayMongo hosted checkout page loads with the
      correct amount/currency/description.
- [ ] Complete a test payment (PayMongo's documented test card/GCash
      flow), confirm the webhook arrives, `payments.status` becomes
      `paid`, and the invoice's status/balance update within a few
      seconds — without ever reloading with a query-param-only "success"
      state before the webhook lands.
- [ ] Deliberately cancel a checkout session; confirm the invoice remains
      payable and a fresh **Pay online** click succeeds.
- [ ] Confirm PayMongo's own dashboard shows the webhook delivery as
      `200`, and that manually re-delivering the same event from their
      dashboard does not create a duplicate `payments` row.
- [ ] Re-verify `Paymongo-Signature`'s exact header field names/format
      against PayMongo's current webhook documentation (section 11).
- [ ] Confirm `RESEND_API_KEY`/`EMAIL_FROM` are set in production and a
      real "Send invoice" delivers the branded email with a working
      `/portal/invoices/[id]` link.

## 18. Deferred to Phase 10+

Support tickets, maintenance subscriptions/renewals, refund handling
(payments.status already includes `refunded` for schema completeness, but
no refund action or invoice-reopening workflow exists), overpayment/credit
handling, a general invoice-deletion feature, PDF export/printing, AI, and
accounting integrations — none of these were built, matching the task's
explicit scope boundary.
