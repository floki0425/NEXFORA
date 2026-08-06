# Phase 12A — Reporting and Global Search Setup

Covers F-099 → F-104: five read-only reporting RPCs and one cross-entity
workspace search. AI features F-090 → F-095 are explicitly out of scope.

## Current status

**Checkpoints 2A, 2B, 2C and 2D are complete.** F-099 → F-104 are
`completed`; the Phase 12A sub-phase is `completed`. Phase 12 overall remains
`in_progress`, because the AI features F-090 → F-095 are not implemented.

### Platform requirement

**The authenticated NEXFORA OS admin application requires JavaScript.**

The Global Search dialog has a directly addressable server route at
`/admin/search?q=<term>`. That route is server-rendered through the Next.js
App Router, URL-addressable, bookmarkable, refreshable, and protected by the
same role and tenant authorization as the dialog.

It is **not** claimed to work with scripting disabled, and does not. The admin
application requires JavaScript because its App Router `loading.tsx` and
Suspense boundaries rely on client-side streamed-content reconciliation:
Next.js parks streamed content in a `<template>` and an inline script moves it
into place. See "Checkpoint 2D → Platform requirement" for the evidence and
the decision record.

The rest of this section describes **Checkpoint 2A**. Both migrations are
applied and catalog-verified against the dedicated **TEST** project only.
`src/types/database.ts` is regenerated from TEST as UTF-8. Unit tiers, lint,
typecheck, and build all pass locally.

**DEV has not been touched.** No command in this checkpoint connected to DEV.
See "DEV isolation" below — this needed active defending, not just avoiding.

Not yet done: Phase 12 integration tests, Playwright E2E, application routes
and UI (reports pages, search palette, dashboard cards). Those are Checkpoint
2B and later.

| Environment | Project ref | State |
| --- | --- | --- |
| TEST | `akcxsmdodfgfqilavnlf` | Both Phase 12A migrations applied and catalog-verified. Types regenerated from here. |
| DEV | *(not referenced in this checkpoint)* | **Untouched.** Apply only after a separate, explicit approval. |

---

## DEV isolation — a real incident, not a formality

At the start of Checkpoint 2A the repository was **linked to DEV**, left over
from the Phase 11 DEV apply (`supabase/.temp/` stamped 2026-08-03 23:57).

Had `supabase migration list --linked` been run in the documented order
without first inspecting the link target, **it would have queried DEV**. The
link target was checked before any remote command ran, the discrepancy was
caught, and the workspace was relinked to TEST.

**Standing rule for every future checkpoint: read
`supabase/.temp/project-ref` and assert it equals the intended project ref
before running any `--linked` command.** The `--linked` flag is silent about
which project it means.

---

## Migration files

Apply in this order. Each has a `do $preflight$` block that aborts loudly
rather than guessing, and refuses to run twice.

```
1. supabase/migrations/20260807000000_phase_12a_reporting.sql
2. supabase/migrations/20260807010000_phase_12a_global_search.sql
```

SHA-256 of what was applied (matches the reviewed files byte for byte):

```
4fffa3d0380a40e16b27ac4c7502419d7d4a5e64271ce655a5056b6d7e4855c5  reporting
700b85c0db2e9832df52d628621f26d5eb3f49dd106bbc5f7426ad68af399654  global_search
```

Both files are now **immutable**. Any correction must be a new forward
migration.

---

## Observed migration-history state

`supabase migration list --linked` against TEST returned **26 rows, every one
with an empty `Remote` column** — 24 pre-existing migrations plus the 2 new
Phase 12A files, none recorded as applied remotely.

```
 Local            | Remote | Time (UTC)
------------------|--------|---------------------
 20260727000000   |        | 2026-07-27 00:00:00
 ...              |        |
 20260807010000   |        | 2026-08-07 01:00:00
```

This is **history absent/empty**, not partial or divergent — a partial state
would show *some* remote entries. It confirms the Phase 11 note: every
migration since Phase 1 was applied by direct SQL, so
`supabase_migrations.schema_migrations` was never populated.

**Consequence, and why it matters:** `supabase db push` and
`supabase migration up` would treat all 26 as pending and attempt to replay
Phases 1–11 against a database that already has those objects. Neither was
run. No migration history was created or repaired in this checkpoint.

---

## Application method selected

```
supabase db query --linked -f <file>
```

Chosen because the observed history state is "absent/empty", which mandates
the repository's established direct-SQL model. `supabase db query` executes
SQL without writing migration history — exactly what that branch requires.
CLI help was inspected first (`supabase db --help`, `supabase db query
--help`); no unsupported flags were invented.

**Transactionality.** Each file was applied wrapped in an explicit
`begin; … commit;`, built at apply time in a scratch directory. The migration
body was embedded verbatim (verified by substring equality and SHA-256 before
apply); the repository files themselves were not modified. This guarantees
all-or-nothing application rather than relying on an assumption about how the
Management API batches statements.

---

## Apply results

| Migration | Result |
| --- | --- |
| `20260807000000_phase_12a_reporting.sql` | Applied cleanly, exit 0, no error |
| `20260807010000_phase_12a_global_search.sql` | Applied cleanly, exit 0, no error |

No rollback was needed. **No 42702 ambiguous-column error occurred** — the
`resolve_report_window` output columns and the callers' PL/pgSQL variables
coexist correctly, closing the risk flagged at the end of Checkpoint 1.5.

---

## Read-only catalog preflight (before applying)

All verified present on TEST beforehand: the four core identity tables, the
six searchable base tables, all Phase 11 tables (`audit_logs`,
`notifications`, `notification_preferences`, `notification_deliveries`,
`private.reminder_runs`, `private.notification_dispatch_failures`), all five
private helpers including `private.effective_invoice_status(text, date,
numeric)`, and the Phase 11 fix RPCs — confirming Phase 11 is fully applied
to TEST.

All 8 Phase 12A functions and all 18 Phase 12A indexes were confirmed
**absent**. `pg_trgm` was confirmed **absent** (the expected pre-state).
`SELECT` was confirmed granted to `authenticated` on all seven relevant
tables, and RLS confirmed enabled on all seven.

### Live RLS policies matched the approved authorization matrix

This was the check that could have halted the checkpoint. It passed:

| Table | Live SELECT policy |
| --- | --- |
| `leads`, `clients`, `projects`, `proposals`, `invoices` | bare `is_internal_member(organization_id)` — **tenant rule only** |
| `support_tickets` | admin **OR** assignee **OR** managing project_manager — **already the product rule** |

This confirms both halves of the search design: the per-entity product-role
predicates (Layer 4) are genuinely required, because RLS alone would surface
every lead and invoice to a `team_member`; and `support_tickets` correctly
gets no product predicate, because duplicating its policy would create a
second copy that can drift.

---

## Reporting catalog verification

- All five report RPCs exist with the expected signatures.
- All five are **SECURITY DEFINER**, **stable**, `search_path=""`.
- `EXECUTE` granted to `authenticated`; **denied to `anon` and to `PUBLIC`**
  (ACL inspected directly — not null, no `=X/` PUBLIC entry).
- `get_project_delivery_report` scopes a project manager by
  `project.project_manager_id = actor_profile_id` and **does not reference
  `can_manage_project`** (verified against `prosrc`).
- All twelve reporting indexes present.
- Pre-existing helper signatures unchanged; RLS still enabled on all nine
  checked tables; no table created, dropped, or altered.
- `private.current_internal_actor` is SECURITY DEFINER (it reads
  `organization_members`, which has RLS). `private.resolve_report_window` is
  security **invoker** by design — pure validation, touches no table, so
  definer would grant needless privilege.

### Server-side report-window validation (verified behaviourally)

Executed as role `authenticated` against TEST. Reads no business rows.

| Input | Result |
| --- | --- |
| null start date | `P0001: A report start date and end date are both required.` |
| null end date | `P0001: A report start date and end date are both required.` |
| reversed range | `P0001: The report end date must not be before the start date.` |
| range > 366 days | `P0001: The report date range must not exceed 366 days.` |
| exactly 366 inclusive days | **accepted** |

The accept path also confirmed the Asia/Manila window arithmetic live:
`2026-01-01 → 2026-12-31` produced `window_start = 2025-12-31 16:00+00`
(= 2026-01-01 00:00 Manila) and `window_end = 2026-12-31 16:00+00`
(= 2027-01-01 00:00 Manila) — the intended half-open interval.

---

## Global-search catalog verification

- `pg_trgm` installed in the **`extensions`** schema.
- All **12** GIN trigram indexes present, every one using `gin_trgm_ops`.
- `public.search_workspace` exists, **SECURITY INVOKER (not definer)**,
  stable, `search_path=""`.
- `EXECUTE` granted to `authenticated`; **denied to `anon` and `PUBLIC`**.
- Layer 1 guard present: calls `private.current_internal_actor`, raises
  `P0001`, rejects a mismatched organization, carries the safe denial message.
- All six entity branches present (`lead`, `client`, `project`, `proposal`,
  `invoice`, `support_ticket`).
- All bounds present: min length 2, max length 120, per-entity clamp
  `least(greatest(coalesce(p_limit, 5), 1), 5)`, hard total cap `limit 30`,
  backslash-first wildcard escaping.
- **No forbidden identifier appears in the function body**: `token_hash`,
  `storage_path`, `provider_reference`, `idempotency_key`,
  `provider_event_id`, `metadata`, `auth.users` — all absent.
- RLS still enabled on all six searchable tables.

### Denial paths verified behaviourally

Executed against TEST via role simulation. No business rows were read — every
call raises before touching a table. No broad search was run against real
client data.

| Caller | Observed |
| --- | --- |
| role `anon` | `42501: permission denied for function search_workspace` |
| role `authenticated`, no membership | `P0001: You do not have permission to search this workspace.` |
| role `authenticated`, no membership → `get_revenue_report` | `P0001: You do not have permission to view this report.` |

**This empirically confirms the Checkpoint 1.5 correction:** `anon` is stopped
by the **EXECUTE privilege (42501)** *before the function body runs*, and never
reaches the P0001 guard. Documentation and tests must not claim otherwise.

Still to be proven with real sessions in Checkpoint 2B (they require issued
JWTs, so they are integration-test territory): authenticated **portal** users,
**suspended** members, and **wrong-organization** members reaching P0001. The
guard logic covering them is verified structurally; the end-to-end behaviour
is not yet exercised.

---

## Generated database types

Command: `supabase gen types typescript --linked`, captured through a shell
redirect that writes raw bytes (no PowerShell redirection, whose default
encoding is not guaranteed UTF-8).

Verified on the temporary file **before** replacing the real one:

```
bytes                : 77540
UTF-16 BOM           : false
UTF-8 BOM            : false
NUL bytes (binary)   : false
file(1)              : ASCII text
```

All six new RPCs present in the generated output:
`get_lead_conversion_report`, `get_lead_source_report`,
`get_proposal_win_rate_report`, `get_revenue_report`,
`get_project_delivery_report`, `search_workspace`. Pre-existing RPCs
(`list_audit_logs`, `claim_pending_email_deliveries`,
`convert_lead_to_client`) still present.

`src/types/database.ts` went from **UTF-16LE with CRLF, 157,048 bytes** to
**UTF-8, 77,540 bytes**. This resolves the long-standing repository-wide
ESLint `"File appears to be binary"` error: `npm run lint` now exits 0 for the
first time in this phase. No generated definition was hand-edited.

---

## Local validation

| Check | Result |
| --- | --- |
| `npm run test:core` | 261 pass / 0 fail |
| `npm run test:phase8:unit` | 28 pass / 0 fail |
| `npm run test:phase9:unit` | 60 pass / 0 fail |
| `npm run test:phase10:unit` | 50 pass / 0 fail |
| `npm run test:phase11:unit` | 107 pass / 0 fail |
| `npm run test:phase12:unit` | 115 pass / 0 fail |
| `npm run lint` | **exit 0** |
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0 |

`npm test` was deliberately **not** run: it chains the phase 8–11 integration
suites, which connect to TEST Supabase and are out of scope for this
checkpoint.

---

## SQLSTATEs encountered

| SQLSTATE / error | Where | Resolution |
| --- | --- | --- |
| `42501` | role `anon` calling `search_workspace` | **Expected and desired.** Proves the EXECUTE-privilege boundary. |
| `P0001` | membership guard, report role check, window validation | **Expected and desired.** All messages user-safe, no SQL detail. |
| `LegacyDbConfigLoadError` | any CLI command | `.env.local` line 12 was not `KEY=VALUE`; the CLI parses env files because `supabase/config.toml` uses `env(...)` interpolation. Line commented out; no value read or printed. |
| `LegacyLinkProjectStatusError` | `supabase link` | Stored credentials lacked privileges on TEST. Resolved by the operator re-authenticating. |
| `UnknownError: --query-timeout can only be used with pg-meta type generation` | `gen types` | Invalid flag combination on the first attempt; retried without it. No file was written from the failed run. |

No migration error occurred, so no rollback or cleanup was required. No ad hoc
`DROP` or manual cleanup was performed at any point.

---

---

# Checkpoint 2B — TEST integration tests

**Complete.** 107 integration tests across 10 files, run twice against TEST
with identical results and no leaked state.

## Method

Integration tests connect through the JS client using `TEST_SUPABASE_URL`,
never through the Supabase CLI. Two independent guards keep them on TEST:

1. `supabase/.temp/project-ref` is checked before any CLI command.
2. `assertTestProjectRef()` parses `TEST_SUPABASE_URL` and refuses to run
   unless the project ref is `akcxsmdodfgfqilavnlf`. The CLI link does not
   govern these tests, so this second guard is not redundant.

Assertions always run through RLS-bound clients (`signInTestUser`,
`createTestAnonClient`). The service-role client is used only for fixture
setup, cleanup, and positive controls — never to satisfy an assertion, which
would bypass RLS and make authorization tests vacuously pass.

## Environment variables

**No new variables were added.** The suite reuses the three that every
integration suite since Phase 8 has used:

```
TEST_SUPABASE_URL
TEST_SUPABASE_PUBLISHABLE_KEY
TEST_SUPABASE_SECRET_KEY
```

Phase 12 integration creates its own ephemeral auth users per run rather than
depending on pre-provisioned accounts, so no `TEST_P12_*` identities exist and
`.env.example` needed no additions. (Fixed `TEST_P*_*` accounts exist only for
Playwright E2E, where a browser must log in as a stable identity — that is
Checkpoint 2C.)

## Fixture organizations and cleanup

Two dedicated organizations per run, named with a random run id:

```
phase12-org-a-<runId>   main fixture organization
phase12-org-b-<runId>   cross-tenant negative control
```

Every search term is a high-entropy token (`Zqx<runId>…`) so an assertion can
never match a real row or another run's fixtures. All eight identities are
created and destroyed per run; no permanent account is added.

Cleanup runs in `after`/`finally`, in reverse dependency order, scoped
exclusively to ids the factory created — never a broad predicate, never a
row outside the two fixture organizations. It is idempotent: a rerun tolerates
an already-deleted auth user but still surfaces any other error.

Two schema rules shaped the design and are worth knowing before editing the
factory:

- `leads_conversion_pair_check` requires `converted_at` and
  `converted_client_id` to be written together. Conversion is therefore
  applied after the clients exist, and cleanup clears both columns in a single
  update — clearing only one violates the constraint.
- `leads_lost_reason_check` requires a non-blank `lost_reason` on a lost lead
  and none on any other.

## Identities exercised (by role)

`super_admin`, `admin`, `project_manager`, `team_member`, suspended internal
member, portal client user, authenticated user with no membership,
second-organization admin, and `anon`. Service-role is used for positive
controls only.

## Authorization matrix verified

| RPC | super_admin | admin | project_manager | team_member / suspended / portal / no-membership | anon |
| --- | --- | --- | --- | --- | --- |
| `get_lead_conversion_report` | allow | allow | **P0001** | P0001 | 42501 |
| `get_lead_source_report` | allow | allow | **P0001** | P0001 | 42501 |
| `get_proposal_win_rate_report` | allow | allow | **P0001** | P0001 | 42501 |
| `get_revenue_report` | allow | allow | **P0001** | P0001 | 42501 |
| `get_project_delivery_report` | allow (org-wide) | allow (org-wide) | allow, **row-scoped** | P0001 | 42501 |

Search matrix, verified per entity with a service-role positive control behind
every zero-row expectation:

| Entity | super_admin / admin | project_manager | team_member |
| --- | --- | --- | --- |
| lead | org-wide | none | none |
| client | org-wide | only via a project they manage | none |
| project | org-wide | only `project_manager_id` = actor | only via `project_members` |
| proposal | org-wide | none | none |
| invoice | org-wide | none | none |
| support_ticket | org tickets | assigned + tickets on managed projects | assigned only |

Portal, suspended, no-membership and wrong-organization **authenticated**
callers all receive a safe `P0001`. `anon` receives `42501` — refused by the
EXECUTE privilege before the function body runs, never reaching the guard.

### One correction to the stated expectation

The brief listed a second-organization user as "denied" for every report. In
practice an **active admin of Org B is legitimately allowed to run reports —
for Org B**. The real boundary is tenant isolation, not refusal, and that is
what the suite asserts: an Org B admin's lead report returns `leads_created:
1` (their own lead) while Org A's returns `8`, and their revenue report is
empty. They are refused outright only when they pass Org A's id to
`search_workspace`, where the organization guard rejects the mismatch with
`P0001`.

## Results

| Suite | Result |
| --- | --- |
| Lead conversion (F-099) | 10 pass |
| Lead source (F-100) | 7 pass |
| Proposal win rate (F-101) | 11 pass |
| Revenue (F-102) | 14 pass |
| Project delivery (F-103) | 12 pass |
| Report authorization | 18 pass |
| Search permission matrix | 14 pass |
| Search bounds | 9 pass |
| Cross-tenant | 8 pass |
| Fixture lifecycle | 4 pass |
| **Run 1** | **107 pass / 0 fail** |
| **Run 2 (determinism)** | **107 pass / 0 fail**, no unique violations |
| Orphan sweep | 0 leftover organizations, 0 leftover auth users |

Unit regression after the work: core 261, phase8 28, phase9 60, phase10 50,
phase11 107, phase12 115 — all green. `npm run lint` exit 0,
`npm run typecheck` exit 0.

## No real business data touched

Every fixture row lives in one of the two run-scoped organizations. Nothing
outside them is read into an assertion or modified. Searches use
high-entropy run-scoped tokens, so no broad query ran against real client
data. Cleanup deletes only ids the factory created.

## Package scripts

```
test:phase12:integration   --test-concurrency=1 over the 10 integration files
test:phase12               unit + integration
```

`test:phase12` is deliberately **not** in the broad `npm test` chain: it now
includes integration, which connects to TEST, and ordinary local unit runs
should not reach a database.

## Remaining gaps

- **UI**: report routes, charts, the search palette, `/admin/search`, the
  admin nav entry and dashboard cards are all still unbuilt.
- **E2E**: no Playwright specs and no `TEST_P12_*` fixture accounts yet.
- **DEV**: still untouched; a separate, explicitly approved step.
- **Production deploy**: not started.

## DEV isolation

DEV was not contacted at any point in Checkpoint 2B. Every database call went
through `TEST_SUPABASE_URL`, guarded by `assertTestProjectRef()`, and the CLI
link was verified as `akcxsmdodfgfqilavnlf` before use. No migration was
reapplied; no `db push`, `migration up`, or `migration repair` was run.

---

# Checkpoint 2C — Application layer, reporting UI and global search

**Complete.** The query layer, authorization gates, five report pages, the
⌘K search palette, an addressable search route and role-aware dashboard tiles
are implemented. F-099 → F-104 moved from `planned` to **`testing`** — the
implementation exists, but browser and E2E verification are still pending.

> **Correction (Checkpoint 2D).** This checkpoint originally described
> `/admin/search` as a *no-JavaScript* fallback. That claim was wrong and has
> been withdrawn — see "Checkpoint 2D → Platform requirement". The route is a
> server-rendered, URL-addressable fallback **target** for the dialog; it is
> not scripting-optional.

## Routes created

```
/admin/reports                          index, role-filtered cards
/admin/reports/lead-conversion          F-099
/admin/reports/lead-sources             F-100
/admin/reports/proposal-win-rate        F-101
/admin/reports/revenue                  F-102
/admin/reports/project-delivery         F-103
/admin/search                           F-104 addressable search route (?q=)
```

Each has its own `loading.tsx` and `error.tsx`. All build as `ƒ`
(server-rendered on demand) — confirmed in the build output, so no report
issues a database request at build time.

## Role matrix implemented

| Surface | super_admin | admin | project_manager | team_member |
| --- | --- | --- | --- | --- |
| Reports nav entry | shown | shown | shown | **hidden** |
| Reports index | 5 cards | 5 cards | **1 card** (Project Delivery) | redirected |
| Lead Conversion / Lead Sources / Proposal Win Rate / Revenue | allow | allow | redirected | redirected |
| Project Delivery | org-wide | org-wide | **own projects only** | redirected |
| Dashboard tiles | leads, proposals, revenue, delivery | same | delivery only | placeholders |
| Global search | yes | yes | yes | yes (results self-limit) |

A role never sees a link to a report it cannot open — unauthorized cards are
not rendered at all, not merely disabled. Unauthorized direct navigation
redirects to `/admin?notice=reports_access_denied`, which renders a plain
notice rather than any database error.

Three layers, in order: navigation visibility → `requireReportAccess()` route
gate → the RPC's own role check. The database remains the boundary; the first
two are convenience.

The Project Delivery page reads its own role and shows *"Delivery performance
for the projects you are assigned to manage"* to a project manager, never an
organization-wide label.

## Report terminology

- Proposal headline is **"Win Rate — Decided Proposals"**; the secondary
  figure is **"Sent-to-Accepted Rate"**. Expired is shown as its own count and
  is never labelled declined.
- Lead source revenue is labelled **"First-touch attributed revenue"**, with
  a note that it credits a client's whole payment history to the originating
  channel and is not a multi-touch split.
- Revenue is split into three visually separate sections: **cash basis**
  (collected in the selected period), **invoice cohort** (billed/collected/
  rate/outstanding, labelled *as of today*), and **point in time** (current
  outstanding, current overdue, MRR). Currencies are never merged — every
  money tile is per currency.
- Project Delivery shows the caveat verbatim: *"This measures schedule
  adherence, not team performance. The current system cannot distinguish
  client-caused delays from internal delays."*
- A null rate renders as an em dash, never as 0%.

## Global search behaviour

⌘K on macOS, Ctrl+K elsewhere (platform read via `useSyncExternalStore`, so
there is no hydration mismatch and no state written from an effect). The
shortcut is ignored while focus is in an `input`, `textarea`, `select` or
`contenteditable`. One listener, added once and removed on unmount.

Escape closes; focus moves into the dialog on open and returns to the trigger
on close; Tab cycles inside the dialog; arrow keys move the active option and
Enter opens it. `role="dialog"` + `aria-modal`, a labelled listbox, and an
`aria-live` status line announcing the result count.

States: idle hint, below-minimum hint (states the character minimum), loading
spinner, grouped results, empty, denied, and error — the error state keeps the
typed query and offers retry. Only groups with rows are rendered, so a role
never sees an empty heading hinting at an entity it cannot access.

A stale response cannot overwrite a newer one (request sequence guard), and
input is debounced at 250 ms.

## Query layer

`src/features/reports/queries.ts` and `src/features/search/queries.ts` are
both `server-only`. The search organization is resolved server-side from the
caller's own membership and is **never** accepted from the client. No
service-role client is used anywhere in application code.

Every RPC payload is validated with Zod (`response.ts`) before rendering — a
shape change becomes a caught `error`, not a half-rendered page. Outcomes are
a three-state union for reports (`ok` / `denied` / `error`) and a four-state
union for search (`ok` / `empty` / `denied` / `error`). Neither carries a
message, code, hint or detail field, so leaking database text is structurally
impossible. Diagnostics are dev-only and server-side.

## No chart dependency

No charting package was added. Categorical data uses CSS-width bars inside a
real `<table>`; the revenue time series is inline SVG paired with a visually
hidden table carrying the same numbers.

## Local validation

| Check | Result |
| --- | --- |
| `test:core` | 261 pass |
| `test:phase8/9/10/11:unit` | 28 / 60 / 50 / 107 pass |
| `test:phase12:unit` | **133 pass** (+18 this checkpoint) |
| `test:phase12:integration` | **107 pass**, still TEST-only via `assertTestProjectRef()` |
| `npm run lint` | exit 0, no warnings |
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0 |

## Remaining work

- **Browser verification**: no page has been opened in a browser. Keyboard
  behaviour, focus movement, responsive layout and the visual design are
  implemented to spec but unverified by eye.
- **Playwright E2E**: none written; `TEST_P12_*` fixture accounts do not exist.
- **Dashboard**: uses `preset: this_month`. Deferred as noted below.
- **DEV**: untouched. Production deploy not started.

## DEV isolation

No Supabase CLI or remote database command was run in this checkpoint. The
migrations were not edited, renamed, reapplied or replaced. Integration tests
connect only to TEST through `assertTestProjectRef()`.

---

# Checkpoint 2D — Playwright E2E, responsive and accessibility

**Complete.** F-099 → F-104 moved from `testing` to **`completed`**, and the
Phase 12A sub-phase moved to `completed`, after two consecutive fully passing
E2E runs with cleanup proven to zero after each.

One product requirement was **withdrawn** during this checkpoint rather than
satisfied: `/admin/search` is no longer required to render with scripting
disabled. See "Platform requirement" below. That decision was taken after
browser verification exposed its architectural consequence, and the three
assertions that encoded the old requirement were removed — **they are not
recorded as passing.**

## Continuation and recovery state

This checkpoint resumed an interrupted run rather than restarting. The
recovery precheck found the workspace already clean:

| Check | Result |
| --- | --- |
| Branch | `feat/phase-12-reporting-search` |
| Staged / committed | nothing staged, nothing committed |
| `supabase/.temp/project-ref` | `akcxsmdodfgfqilavnlf` (TEST), 20 bytes, exact |
| `assertTestProjectRef()` | passed |
| Migration SHA-256 | both **unchanged** from the Checkpoint 2A baseline |
| Port 3000 | free — **no orphaned E2E server** |
| `.e2e-fixture-ids.json` | absent |
| Fixture organizations | 0 |
| Fixture auth users | 0 |
| Tracked fixture rows | 0 |

The interrupted run's `globalTeardown` had already completed, so no scoped
cleanup was needed and none was performed. Had fixtures remained, cleanup
would have run only through the recorded ids in `.e2e-fixture-ids.json` via
`cleanupPhase12Fixtures()` — never a name or date predicate.

Zero-state was re-verified with a **read-only** sweep before and after every
run. It deletes nothing and prints no key, URL or password.

## DEV isolation

DEV (`qcuhdysqijrozhzasnbe`) was never contacted. Note that `.env.local` *does*
carry the DEV ref — the E2E server is safe from it structurally, not by
accident: `scripts/lib/e2e-server.mjs` overwrites `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` with the TEST
values **before** spawning `next build` / `next start`, and Next.js never
overrides an already-set process variable when it later reads `.env.local`.
`assertTestProjectRef()` runs before the server is allowed to build at all.

No migration was edited, renamed, reapplied or replaced. No `db push`, no
`migration up`, no `migration repair`.

## Playwright configuration

`playwright.phase12.config.ts`, unchanged this checkpoint:

```
testDir              tests/phase12/e2e
timeout              150s per test, 25s per expect
workers              1, fullyParallel false   (fixtures are shared)
retries              0                        (a flake must not be hidden)
reuseExistingServer  false                    (never adopt a dev server)
webServer            npm run dev:e2e:phase12, 300s cold-build budget
project              chromium, 1440x900
trace                retain-on-failure
```

`retries: 0` is deliberate: with one shared fixture set, a retry would mask a
genuine ordering or cleanup bug.

## Ephemeral identity strategy

No `TEST_P12_*` accounts exist and none were added. `globalSetup` provisions
all eight identities per run through the service-role factory and
`globalTeardown` destroys them, so the number of permanent TEST accounts does
not grow every phase. The service-role client is used **only** in global
setup/teardown; it never reaches the browser. Specs sign in through the real
login form.

Roles exercised in the browser: `super_admin`, `admin`, `project_manager`,
`team_member`, portal client user, and a second-organization `admin`.
Organizations: `phase12-org-a-<runId>` and `phase12-org-b-<runId>`.

## Spec files

Four were created this checkpoint; three existing ones gained assertions.

```
report-filters.spec.ts             created  (18 tests)
search-fallback.spec.ts            created  (14 tests)
topbar-regression.spec.ts          created  (11 tests)
dashboard-role-visibility.spec.ts  created  ( 8 tests)
global-search.spec.ts              extended (+9 tests)
responsive-accessibility.spec.ts   extended (+1 test, em-dash strengthened)
reports-access.spec.ts             extended (+1 test)
```

Suite total: **100 tests**. That number is *not* the earlier 100 — three
JavaScript-disabled assertions were withdrawn and three JavaScript-enabled
addressability/safety assertions took their place.

Suite size went from 41 tests to **100**.

## The two carried-over defects — both fixed and verified

### 1. Revenue mobile horizontal overflow — FIXED

Verified at 390x844, and re-verified at 1440x900 and 1024x768. Overflow is
0px; `findOverflowingElements()` returns no offender. The assertion was not
weakened — the `min-w-0` shrinking rules on the revenue grid and card children
are what stopped the long unbreakable fixture client name forcing a card
outside the viewport.

### 2. Report-filter label / keyboard assertion — FIXED (the test was wrong)

Label association was **already correct**. The rendered accessible names are
exactly `Date range`, `From`, `To`, `Source`, `Apply`, with **no option text
folded into the name** — a wrapping `<label>` would have produced
"Date range Last 30 days This month ...".

The failure was the **Tab-order assertion itself**, and it was doubly broken:

- Chromium's `<input type="date">` owns internal day/month/year segments that
  each consume a Tab, so pressing Tab three times from the preset select left
  focus still inside the *From* field, not on *Apply*.
- The assertion then read
  `document.activeElement?.textContent?.trim() ?? ...tagName`. An `<input>`'s
  `textContent` is `""`, and `??` does not fall back on an empty string, so
  the check received `""` and failed. It also asserted only *truthiness* — it
  would have passed on literally any element with text.

Replaced with a real assertion: walk Tab a bounded number of times, collect the
**distinct** elements that receive focus, and require the order
`report-preset → report-from → report-to → report-filter-source`, then require
Tab from the last control to land on the *Apply* button. Each control is also
asserted visible, enabled, and resolved by `getByLabel()` to the id its
`<label for>` points at. This is strictly stronger than what it replaced.

## Results by area

| Area | Result |
| --- | --- |
| Report access by role | pass (8) |
| Report rendering vs fixtures | pass (6) |
| Report filters | pass (18) |
| Global-search keyboard and focus | pass (19) |
| Global-search permissions | pass (8) |
| Search fallback route | pass (11) |
| Search route addressability and safety | pass (3) |
| Topbar / Notification Bell regression | pass (11) |
| Dashboard role visibility | pass (8) |
| Desktop 1440x900 | pass |
| Tablet 1024x768 | pass |
| Mobile 390x844 | pass |
| Accessibility | pass |

Cross-tenant isolation, portal denial, and the "no protected content flash"
check all pass. The redirect check was rewritten during this checkpoint:
Next.js answers a Server Component `redirect()` by **streaming the navigation,
not by always emitting a 3xx**, so asserting the status code was wrong. It now
fetches the protected URL directly with redirects disabled and asserts the
bytes contain no report filter bar, no report metric, and no fixture data.

## Two assertions that were corrected, not weakened

- **Back/Forward.** Browsers deliberately restore form-control values from
  session history, so the `<select>` legitimately still reads `facebook` after
  Back while the page renders the unfiltered report. The spec now asserts what
  the application actually owns — that the **rendered report follows the URL**
  (8 → 1 → 8 → 1) — plus a reload proving the control is rendered from the URL
  rather than held in client state.
- **Undefined metric.** The old check only proved "no `0.0%`" on a window with
  no rows at all, where the page shows an empty state and no tiles exist. It
  now uses May 2026, where projects are active but none completed, so
  `rated_count` is genuinely 0: the Schedule On-Time Rate tile renders and must
  read an em dash, with "0 of 0 rated projects" stating why.

## One application change

`src/features/search/components/global-search-dialog.tsx` — `runSearch()` now
wraps the server-action call in `try/catch` and falls back to
`{ status: "error" }`.

The action itself already maps every failure to `error`; this catches the
**transport**. Without it a dropped connection rejected inside
`startTransition` and took out the whole route through its error boundary, so
the dialog's designed error state — the one that keeps the typed query and
offers *Try again* — was unreachable in a browser. Both the error state and
"retry preserves the query" are now proven end to end by aborting the
server-action request and then letting it through.

No other application file was changed. Authorization was not touched.

## Platform requirement — the admin application requires JavaScript

**The authenticated NEXFORA OS admin application requires JavaScript.** The
earlier claim that `/admin/search` works with scripting disabled was wrong and
is withdrawn.

### What the route still is, and still guarantees

`/admin/search?q=<term>` remains the Global Search dialog's route fallback:

- directly URL-addressable, bookmarkable and refreshable
- all state carried in `?q=`, so a view is shareable and Back works
- server-rendered through the Next.js App Router
- protected by the **same role and tenant authorization as the dialog** —
  both call one `server-only` query layer, so there is no second code path to
  drift
- fully usable with JavaScript enabled

### Why scripting-optional rendering is not achievable here

Established empirically, not assumed. With scripting off:

```
admin navigation visible : true      (the layout renders)
page <h1> visible        : false
"Search term" input      : false
result group headings    : []
```

The content **is** in the response — but Next.js parks streamed Suspense
content in a `<template>` and moves it into place with an inline `$RC`
script. With scripting off that script never runs, so the content stays inert
inside the template, invisible and absent from the accessibility tree, and the
skeleton remains.

Removing `src/app/admin/search/loading.tsx` alone was tested and is **not
sufficient**: `src/app/admin/loading.tsx` is an ancestor Suspense boundary for
every route in the segment. Making the route scripting-optional would require
deleting **both**.

### Decision record

**Both `loading.tsx` boundaries are deliberately retained.**

```
src/app/admin/loading.tsx           KEPT
src/app/admin/search/loading.tsx    KEPT
```

Deleting them would remove the loading skeleton from the Phase 2 admin
dashboard and change streamed-content behaviour across every admin surface
built in Phases 2–11 — a cross-phase UX change with no benefit to any
authenticated user, since the admin application is a signed-in internal tool
whose dialog, notification bell and filter controls all require scripting
anyway. The requirement was withdrawn instead.

### What happened to the three assertions

The three specs in `search-fallback.spec.ts` → *Admin search without
JavaScript* were **removed**. They encoded a product requirement that no
longer exists.

**They are not recorded as passing, and were never made to pass.** They are
not skipped, not `fixme`, and not expected failures — the block is gone, and
`javaScriptEnabled` appears nowhere in `tests/`.

They were replaced by three JavaScript-enabled specs under *Admin search route
addressability and safety*, which assert the properties that genuinely remain
required:

| Replacement spec | Asserts |
| --- | --- |
| the route is URL-addressable, bookmarkable and refreshable | direct navigation by URL, query rendered back from the URL, refresh re-runs the same search, editing the URL alone changes results, form submit produces a linkable `?q=` |
| malformed queries degrade safely and never leak database text | nine hostile inputs (array param, repeated param, control bytes, bare `%`, SQL injection attempt, escaped wildcards, script tag, 3000 chars, empty) each render the page with one `h1`, no error state, and none of nine database-text markers |
| no unauthorized row is ever sent to the browser for this route | asserts on **response bytes, not the DOM** — a team member's response omits a lead's title, Org A's response omits Org B's rows, a portal user's response contains no result markup, each against an admin positive control |

That last one is a stronger tenant-isolation check than anything the removed
block contained: a row streamed and then hidden would still be a leak, and a
DOM-only assertion would never notice it.

## Run results

`retries: 0`, so every number below is a first-attempt result.

| | Run 1 | Verification run |
| --- | --- | --- |
| Tests | 100 | 100 |
| Passed | 93 | **95** |
| Failed | 7 | **5** |
| Duration | 13.6m | 16.4m |
| Teardown | completed | completed |
| Fixture organizations after | 0 | 0 |
| Fixture auth users after | 0 | 0 |
| Tracked fixture rows after | 0 | 0 |
| Orphaned server | none | none |

Of Run 1's seven failures, **four were defects in the new specs** and were
fixed: a `Recent activity` / `No recent activity` strict-mode collision, the
Back/Forward form-restoration assumption, the redirect status-code assumption,
and a `Search the workspace` collision with the topbar trigger's screen-reader
label. The verification run confirmed all four.

The verification run surfaced two further **spec** defects, both fixed and
re-confirmed by a targeted run:

- *the shortcut is ignored while a select has focus* raced hydration. It
  called `.focus()` and pressed Ctrl+K immediately; React could re-render and
  drop focus to `<body>`, so the shortcut fired legitimately and the test
  proved nothing. It now asserts `toBeFocused()` **before** sending the
  keystroke. (It passed in Run 1 and failed here — a genuine flake the
  `retries: 0` policy correctly exposed rather than hid.)
- *the protected route's own response carries no report content* used the
  marker `"Win Rate"`, which matched the Suspense fallback's
  `aria-label="Loading Proposal Win Rate report"`. **This was a false alarm,
  not a leak.** The protected URL returns a 200 whose body is the *dashboard*
  (`<title>Dashboard`) plus a meta-refresh to
  `/admin?notice=reports_access_denied`, with the report's empty loading
  skeleton and **no figures, no rows, and no filter bar**. The marker is now
  `"Sent-to-Accepted Rate"`, which only appears in rendered output.

A targeted run then confirmed all three corrected specs green
(`3 passed`, teardown clean).

At that point 97 of 100 passed; the three failures were the
scripting-disabled assertions, which the product decision below then
withdrew.

### After the product decision

The scripting-disabled requirement was withdrawn (see "Platform
requirement"). The three assertions were removed and replaced by three
JavaScript-enabled ones, and the suite was then run twice, back to back, to
completion.

| | **Run 1** | **Run 2** |
| --- | --- | --- |
| Tests | 100 | 100 |
| Passed | **100** | **100** |
| Failed | **0** | **0** |
| Playwright exit | **0** | **0** |
| Skipped (missing configuration) | 0 | 0 |
| Duration | 7.5m | 7.7m |
| Teardown | completed | completed |
| Fixture organizations after | 0 | 0 |
| Fixture auth users after | 0 | 0 |
| Tracked fixture rows after | 0 | 0 |
| Orphaned server | none | none |
| Unique-constraint failures | none | none |

### Operational hazard found the hard way

An earlier attempt at Run 2 failed with cascading timeouts and
`InvariantError: The client reference manifest for route "..." does not
exist`. The cause was **running `npm run build` while the E2E suite was in
flight**: the E2E server builds into `NEXFORA_NEXT_DIST_DIR=.next/e2e-phase-12-e2e`,
which is **nested inside `.next`**, and a default `next build` clears `.next`
— deleting the running server's own output mid-run.

That run was discarded as invalid (it reported `80 did not run`), its
`globalTeardown` still cleaned fixtures to zero, and its orphaned `next start`
process was identified by command line and start time before being terminated.
The two runs recorded above were then executed back to back with **nothing
else running**.

**Rule for future checkpoints: never run `npm run build`, or any other task
that writes to `.next`, while a Phase 12 E2E run is active.**

Zero-state was proven **before Run 1, between the two runs, and after Run 2**
by a read-only sweep. Both runs ran the identical suite back to back with
`retries: 0`, so every result is a first attempt.

The suite total is **100 tests**, and that is *not* the earlier 100: three
scripting-disabled assertions were withdrawn and three JavaScript-enabled
addressability/safety assertions took their place. Net coverage went up, not
down.

Two spec defects surfaced while rewriting the replacements, both fixed before
Run 1 and neither an application fault:

- a `getByRole("button", { name: "Search" })` collision — the topbar trigger's
  accessible name also begins "Search" — resolved with `exact: true`;
- reading result group headings straight after a form submit raced the
  streamed chunk and saw an empty list. The spec now waits for the expected
  group heading before reading, which is the same streaming behaviour the
  platform requirement describes.

The malformed-query spec also produced a genuine, useful finding: a query
containing a **NUL byte** cannot be represented as PostgreSQL `text`, so the
RPC cannot succeed. It degrades to the designed `error` state with a
plain-language message and no database detail. That is correct behaviour, so
the spec asserts it explicitly and separately from the eight inputs that must
reach a normal state — rather than hiding it behind a loose "anything goes"
assertion.

## Screenshot evidence

`tests/phase12/e2e/evidence/` — gitignored (`.gitignore:56`) and confirmed
untracked by `git ls-files`. All eleven required images are present:

```
desktop-reports-index      desktop-lead-conversion   desktop-lead-sources
desktop-proposal-win-rate  desktop-revenue           desktop-project-delivery
desktop-global-search      pm-reports-index          team-member-dashboard
mobile-reports-index       mobile-search-dialog
```

Audited by a byte-level scan for `eyJ` (JWT header), `sb_secret_`,
`sb_publishable_`, `service_role`, both project refs, `supabase.co`, the
fixture password prefix, `Bearer `, `access_token` and `SUPABASE_SECRET_KEY`.
**No marker found in any file.** Every visible row is fixture data carrying a
run-scoped `Zqx...` token, so no real business data is captured.

## Regression validation

Re-run in full after the two consecutive passing E2E runs, sequentially and
with nothing else active.

| Check | Result |
| --- | --- |
| `npm run test:core` | 261 pass |
| `npm run test:phase8:unit` | 28 pass |
| `npm run test:phase9:unit` | 60 pass |
| `npm run test:phase10:unit` | 50 pass |
| `npm run test:phase11:unit` | 107 pass |
| `npm run test:phase12:unit` | 133 pass |
| `npm run test:phase12:integration` | 107 pass, TEST-only via `assertTestProjectRef()` |
| `npm run lint` | exit 0, zero errors, zero warnings |
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0 |

Every report route builds as `f` (server-rendered on demand), so **no report
issues a database request at build time**.

## Remaining follow-ups

**No blocking items remain.** The one former blocker was resolved by product
decision: the scripting-disabled requirement for `/admin/search` was withdrawn
and both `loading.tsx` boundaries were retained. See "Platform requirement".

1. Non-blocking — the whole authenticated admin application requires
   JavaScript, not just `/admin/search`. This is pre-existing and repo-wide
   (every admin segment has had a `loading.tsx` since Phase 2), not introduced
   by Phase 12. It is now documented rather than implied.
2. Non-blocking — the dialog's `denied` **render** branch is unreachable in a
   browser for a user who can render the topbar at all, and stays covered by
   integration (`P0001`) and unit tests. The `error` branch is proven in the
   browser.
3. Non-blocking — the dashboard tiles use `preset: this_month`, so they show
   live-but-empty figures against a fixture set seeded in March 2026. Numeric
   correctness is proven on the reports themselves against the seeded window.
4. Non-blocking — DEV has still never been contacted. Applying these two
   migrations to DEV, and the production deploy, remain separate steps needing
   their own explicit approval.
