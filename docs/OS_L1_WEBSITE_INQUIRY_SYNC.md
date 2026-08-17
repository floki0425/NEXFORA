# OS-L1 — Website project inquiries → NEXFORA OS leads

How verified "Start a Project" inquiries submitted on the public Nexfora
website become leads inside NEXFORA OS, and what has to be configured for
that to work.

---

## 1. Why this is a server-to-server integration

The two applications do **not** share a database:

| | Supabase project |
| --- | --- |
| Nexfora website (`NEXFORA-WEBSITE/nexfora-website`) | `bjthzxewxqyzutxgpead` |
| NEXFORA OS (this repository) | `qcuhdysqijrozhzasnbe` |

There is therefore no RLS policy, JWT claim, or foreign key that could reach
across them. Two further facts settle the design:

1. The website's `public.project_inquiries` grants its service role
   `INSERT` **only** — no `SELECT`. Nothing, including the website itself,
   can read that table back. Polling it from the OS is not an option, and
   would not be one worth taking even if the grant existed.
2. Because the website cannot `SELECT`, it never learns the `id` of the row
   it just wrote. The **`idempotency_key` it generated** is the only stable
   external identity it actually holds, so that is what keys the sync.

The website POSTs each accepted inquiry to an HMAC-signed endpoint in this
application, which writes an ordinary lead.

```
visitor → Start a Project form → validation → Turnstile → rate limit
        → website Supabase (project_inquiries)  ← source of truth, unchanged
        → Resend notification + visitor confirmation
        → [new] signed POST /api/webhooks/website-inquiry
                → public.ingest_website_project_inquiry (service_role only)
                → public.leads + public.website_inquiry_imports
                → existing lead.created notification, CRM pipeline, reports
```

## 2. What the OS stores

The inquiry becomes an **ordinary `public.leads` row**, not a second lead
concept. Everything already built on leads — RLS, pipeline status, the
activity timeline, assignment, conversion to a client, notifications,
reporting, global search — applies to it unchanged.

| Website field | OS destination |
| --- | --- |
| `full_name` | `leads.full_name` |
| `email` | `leads.email` (lowercased) |
| `phone` | `leads.phone` |
| `business_organization` | `leads.business_name` |
| `project_description` | `leads.problem_summary` |
| `service_needed` | `leads.service_interest` (mapped label) |
| `estimated_budget` | `leads.budget_min` / `leads.budget_max` (numeric) |
| `target_timeline` | `leads.target_timeline` (mapped label) |
| — | `leads.source` = `website`, `leads.source_detail` = `Start a Project form` |
| — | `leads.status` = `new` |

`source_detail` is what distinguishes the public website's funnel from this
application's own on-site inquiry form at `/start-a-project`, which also
writes `source = 'website'`.

The website-only facts that have no column on `leads` go to
`public.website_inquiry_imports`, a sync ledger holding the external
identity, the **canonical website enum values exactly as submitted**, and
the two timestamps. It stores no applicant PII — name, email, phone,
business and description live once, on the lead row — and does not copy the
consent record, which remains the website's.

Canonical → OS normalization happens inside the ingestion function, in SQL.
The route forwards the website's enum values unchanged; the database is the
single authority that turns `website_development` into a label and
`25000_50000` into numeric bounds.

## 3. Security model

| Layer | Control |
| --- | --- |
| Transport | `POST /api/webhooks/website-inquiry` requires header `x-nexfora-signature: t=<unix>,v1=<hex>` where `v1 = HMAC-SHA256(secret, "<t>.<rawBody>")`. Constant-time compare, ±5 min replay window, timestamp signed so it cannot be re-dated. Unset secret → 401, never "skip the check". |
| Payload | Zod-validated against the website's canonical enums and column limits before the database is touched. |
| Database | `public.ingest_website_project_inquiry` is `SECURITY DEFINER`, `search_path = ''`, granted to **`service_role` only** — revoked from `public`, `anon`, `authenticated`. A browser cannot reach it at either layer. |
| Ledger | RLS enabled. One policy: `SELECT` for internal members of the owning organization. No session role may write it; even `service_role` has no table grant, so the definer function is the only writer. |
| Reading leads | Unchanged — the existing Phase 3 RLS and `requireInternalMember()` gate. Clients and unauthenticated visitors see nothing. |
| Logging | No field of the payload is ever logged. Failures record a coarse stage and an error code only. Responses never echo the submission. |

## 4. Idempotency

One website inquiry maps to exactly one OS lead:

- `website_inquiry_imports.idempotency_key` is `UNIQUE`, and `lead_id` is
  `UNIQUE`, so the guarantee is schema-level rather than code-level.
- The function takes a transaction-scoped advisory lock on the idempotency
  key **before** the existence check, so a webhook retry racing the original
  cannot pass the check twice.
- A `unique_violation` from a lost race is caught, re-read, and reported as
  `duplicate` with the original lead id rather than raised.

A replay returns `{ "status": "duplicate", "leadId": "…" }` with HTTP 200.

## 5. Failure handling

The website inquiry is the source of truth and has **already been committed
and confirmed to the visitor** before this endpoint is called. Therefore:

- A sync failure must never surface to the visitor as a failed submission.
- The route returns **5xx** (not 4xx) when the payload was authentic but the
  write failed, so a well-behaved caller retries rather than discards.
- Nothing here deletes, rewrites, or re-notifies the website's record.

If the OS is unreachable when a visitor submits, the inquiry still exists on
the website and can be replayed later — ingestion is idempotent, and the
ledger's `submitted_at` preserves the real submission time even when
`received_at` is days later.

## 6. Configuration

### NEXFORA OS

| Variable | Required | Notes |
| --- | --- | --- |
| `WEBSITE_INQUIRY_WEBHOOK_SECRET` | to receive inquiries | 32+ random characters. When unset the route rejects every request with 401. |

Set it in Vercel for Production and Preview. Never commit a real value.

### Applying the migration

`supabase/migrations/20260817000000_os_l1_website_inquiry_ingestion.sql`
has **not** been applied anywhere. It is additive: it creates one table,
one index, one policy, and one function, and alters no existing object.

```bash
# unit tier first — it parses the SQL and gates the apply
npm run test:os-l1

# then, deliberately, against the intended project
npx supabase db push
```

After applying, regenerate the database types and confirm no drift from the
hand-written entries added for `website_inquiry_imports` and
`ingest_website_project_inquiry`:

```bash
npx supabase gen types typescript --project-id <ref> > src/types/database.ts
npm run typecheck
```

---

## 7. WEBSITE PATCH PLAN

**None of this has been applied.** The website repository is untouched by
OS-L1. Everything below is additive and must preserve the existing flow's
validation, Turnstile, rate limiting, Supabase persistence, email
notification, visitor confirmation, idempotency, and privacy behaviour.

### 7.1 New environment variables (website)

| Variable | Value |
| --- | --- |
| `NEXFORA_OS_INQUIRY_WEBHOOK_URL` | `https://<os-host>/api/webhooks/website-inquiry` |
| `NEXFORA_OS_INQUIRY_WEBHOOK_SECRET` | the same secret as the OS's `WEBSITE_INQUIRY_WEBHOOK_SECRET` |

Both are server-only. Neither may carry a `NEXT_PUBLIC_` prefix.

### 7.2 New file: `src/lib/project-inquiries/os-sync.ts`

A `server-only` module exporting one function, e.g.
`forwardProjectInquiryToNexforaOs(inquiry, consentedAt)`, that:

1. Returns immediately (no throw, no log) when either variable is unset, so
   an unconfigured environment simply does not sync.
2. Builds the payload below, serializes it **once**, and signs that exact
   string — the signature covers the bytes that are sent, not a re-encoding.

   ```jsonc
   {
     "idempotencyKey": "<inquiry.idempotencyKey>",   // uuid
     "submittedAt":    "<consentedAt>",              // ISO 8601 with offset
     "fullName":       "<inquiry.fullName>",
     "email":          "<inquiry.email>",
     "phone":          null,                          // or string
     "businessOrganization": null,                    // or string
     "preferredContactMethod": "email" | "phone",
     "serviceNeeded":  "<canonical service value>",
     "estimatedBudget": null,                         // or canonical value
     "targetTimeline":  null,                         // or canonical value
     "projectDescription": "<inquiry.description>"
   }
   ```

   Send the **canonical** values from `contract.ts` unchanged. The OS
   rejects anything else and maps them itself.

3. Signs with
   `t = Math.floor(Date.now() / 1000)` and
   `v1 = createHmac("sha256", secret).update(\`${t}.${rawBody}\`).digest("hex")`,
   sending header `x-nexfora-signature: t=<t>,v1=<v1>`.
4. Applies a request timeout (e.g. `AbortSignal.timeout(5000)`) and at most
   one short retry on a network error or 5xx. A 4xx is not retried — it means
   the payload is wrong, which retrying cannot fix.
5. Reports outcomes through the existing `logProjectInquiryIssue` helper with
   a new provider label, passing only a status code and stage. It must never
   log the payload, the secret, or the signature.
6. **Never throws.** The caller treats it as fire-and-forget.

### 7.3 One-line change: `src/app/start-a-project/actions.ts`

Inside the existing `persistence.status === "created"` branch only:

```ts
if (persistence.status === "created") {
  after(() => sendProjectInquiryEmails(inquiry, consentedAt));
  after(() => forwardProjectInquiryToNexforaOs(inquiry, consentedAt));   // new
}
```

`after()` runs the sync **after** the response is sent, so a slow or down OS
cannot delay or fail the visitor's submission. Do not forward on
`"replayed"`: the website already holds that inquiry, and a genuine
duplicate delivery would be absorbed by the OS's idempotency anyway.

### 7.4 What must not change

`persistProjectInquiry` stays exactly as it is — in particular the
`insert()` **without** `.select()`, which is what keeps the table's
insert-only grant intact. The sync must not be moved before persistence,
must not gate the action's return value, and must not alter the visitor's
message on any path.

## 8. Privacy

The Nexfora privacy policy already describes project inquiries being used to
review and respond to inquiries. Displaying the same inquiry inside NEXFORA
OS so a Nexfora team member can review and respond to it is that same
operational purpose, handled by the same organization.

OS-L1 adds no profiling, no scoring, no enrichment, no marketing automation,
and no third-party recipient. It stores no personal data the website did not
already collect for this purpose. **No privacy notice update is required.**

If a later phase adds enrichment, lead scoring, or any recipient beyond
Nexfora's own team, that assessment changes and the notice must be revisited.

## 9. Verification checklist (manual, after apply)

1. With `WEBSITE_INQUIRY_WEBHOOK_SECRET` unset — request returns 401.
2. Unsigned request → 401. Wrong secret → 401. Body altered after signing →
   401. Timestamp older than 5 minutes → 401.
3. Valid signed request → 200 `{"status":"created"}`; the lead appears at
   `/admin/leads` with source **Website**, status **New**, and the correct
   service and budget.
4. Replay the identical request → 200 `{"status":"duplicate"}` with the same
   `leadId`, and **no** second row in `/admin/leads`.
5. Lead detail shows the **Website inquiry** panel with preferred contact,
   the canonical service/budget/timeline labels, and the website submission
   time. It shows no idempotency key, consent field, or Turnstile data.
6. A `team_member` can read the lead but cannot change its status; a client
   portal user and a logged-out visitor receive nothing.
7. The assigned admin receives the existing **New lead received**
   notification.
8. Server logs for a deliberately failing ingestion contain no name, email,
   phone, or description.
