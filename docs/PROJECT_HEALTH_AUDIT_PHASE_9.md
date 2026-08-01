# Project Health Audit — Phase 9 (Invoices + Payments)

**Audit date:** 2026-08-01
**Branch:** `feat/phase-9-invoices-payments`
**Scope:** Full stability and error audit. Phase 10 explicitly not started.

## Migration versions

Local and remote are aligned through the two Phase 9 migrations:

- `20260804000000_phase_9_invoices_payments.sql`
- `20260804010000_fix_phase_9_invoice_check_constraints.sql`

18 migrations total, all `local == remote`, `npx supabase db push --dry-run`
reports `"upToDate": true` with zero pending migrations.

## Files reviewed

`AGENTS.md`, `package.json`, `playwright.config.ts`,
`playwright.phase9.config.ts`, `.gitignore`, `.env.example`, `FEATURES.md`,
`ROADMAP.md`, `docs/PHASE_8_AUTOMATED_TESTING.md`,
`docs/PHASE_8_FILES_REVISIONS_SETUP.md`,
`docs/PHASE_9_INVOICES_PAYMENTS_SETUP.md`,
`scripts/start-phase8-e2e-server.mjs`, `src/config/env.public.ts`,
`src/config/env.server.ts`, `src/lib/supabase/{client,server,admin,proxy}.ts`,
`src/lib/paymongo/*`, `src/lib/email/*`, all Phase 8/9 test helpers and specs,
both Phase 9 migrations, and the full uncommitted diff.

## Errors found and root causes

### 1. Phase 9 E2E had no `webServer` — BLOCKING (fixed)

**Symptom:** Phase 9 admin/portal E2E specs failed near sign-in.

**Root cause:** `playwright.phase9.config.ts` defined no `webServer`. Phase 8
had already been fixed to auto-start a Next.js server with `TEST_SUPABASE_*`
mapped onto the app-facing variable names, but Phase 9 was never given the
same treatment. It therefore required a manually started server, and any
server started with `npm run dev` loads `.env.local` — the **dev** Supabase
project. Phase 9 fixtures are created in the **TEST** project, so those
accounts do not exist in the project the app was talking to, and sign-in
failed in a way that looks like bad credentials.

**Fix:** Extracted the proven Phase 8 launcher into `scripts/lib/e2e-server.mjs`
(one implementation of the security-sensitive env mapping, rather than
duplicating it), reduced `scripts/start-phase8-e2e-server.mjs` to a thin
wrapper, added `scripts/start-phase9-e2e-server.mjs`, added the
`dev:e2e:phase9` script, and gave `playwright.phase9.config.ts` a `webServer`
block with `reuseExistingServer: false` so an `.env.local` server can never be
silently reused.

### 2. Hydration mismatch on both file-upload forms — REAL DEFECT (fixed)

**Symptom:** React hydration error in the Phase 8 E2E server log:
`encType="multipart/form-data"` (server) vs `encType={null}` (client).

**Root cause:** Both upload forms set `encType` explicitly on a `<form>` whose
`action` is a function. When `action` is a function, React submits the form
itself as `FormData` and renders no `encType` attribute, so the explicit
attribute produced a genuine SSR/client attribute mismatch.

**Fix:** Removed the redundant `encType` from
`src/features/files/components/internal-file-upload-form.tsx` and
`src/features/portal/files/components/portal-file-upload-form.tsx`. Verified
uploads still work — Phase 8 E2E remained 6/6 and the warning is gone
(`grep -c encType` on the run log: 0).

### 3. Phase 9 admin E2E flake — DIAGNOSED, not retry-masked (fixed)

**Symptom:** `admin-invoice-flow.spec.ts` failed its post-create redirect
assertion on a cold server, passed on retry.

**Root cause:** Not an application defect. The failure screenshot context
showed the submit button still in its **pending** state
(`"Creating…" [disabled]`) at the 25s assertion timeout — the server action
was still in flight, not errored. That single step waits on
`createInvoiceAction`'s ~4 sequential round trips to the remote test Supabase
project *plus* `next dev`'s one-time Turbopack compile of the
`/admin/invoices/[invoiceId]/edit` redirect target, which is always cold on
the first run against a freshly spawned server.

**Fix:** Gave that one assertion an explicit 60s timeout with the evidence
documented inline, rather than inflating global timeouts or leaning on the
retry. **Verified with `--retries=0` on a cold server: 2/2 passed.**

## Deferred / non-blocking

- **`npm audit`: 4 high severity**, all transitive through `next@16.2.11`
  (`sharp <0.35.0` libvips CVEs, and `postcss`). `npm audit fix --force` would
  install `next@9.3.3` — a catastrophic downgrade, not acceptable. The `sharp`
  path is **unreachable in this application**: there are no `next/image`
  component imports anywhere in `src/` (the only `_next/image` match is a path
  exclusion string in the proxy matcher). Correct remediation is a routine
  Next.js patch bump (16.2.11 → 16.2.12+) handled as its own change, not
  during a stabilization audit.
- **`npm outdated`:** all minor/patch drift except `@types/node` (20 → 26),
  `eslint` (9 → 10), and `typescript` (5.9 → 7.0), which are major upgrades
  requiring separate, deliberate work.
- **React Compiler warning** (`react-hooks/incompatible-library`) previously
  reported on `invoice-create-form.tsx` is resolved — `watch()` was replaced
  with `useWatch({ control })`. Lint is now completely clean (0 errors,
  0 warnings).
- **Supabase CLI link target:** `supabase/.temp/project-ref` points at
  `qcuhdysqijrozhzasnbe` (the **dev** project), not the test project. This is
  read-only-safe for this audit (only `migration list` and `db push --dry-run`
  were run), but means a future unguarded `supabase db push` would target dev.
  Worth an explicit re-link before any migration work.

## Test results

| Check | Result |
| --- | --- |
| `node --env-file=.env.test.local --test .../revision-workflow.test.mjs` | **18/18 pass** |
| `npm run test:phase8` (run 1) | **28 unit + 45 integration, 0 fail** |
| `npm run test:phase8` (run 2) | **28 unit + 45 integration, 0 fail** (deterministic) |
| `npm run test:e2e:phase8` | **6 passed** (twice, incl. after the encType fix) |
| `npm run test:phase9` (run 1) | **104/104 pass** |
| `npm run test:phase9` (run 2) | **104/104 pass** (deterministic) |
| `npm run test:e2e:phase9` (run 1, pre-fix) | 2 ran, 1 flaky-then-passed |
| Phase 9 E2E `--retries=0`, cold server | **2 passed** (flake genuinely fixed) |
| `npm run test:e2e:phase9` (final) | **2 passed** |
| `npm test` (full) | **423/423 pass** (246 core + 28 + 45 + 104) |
| `npm run lint` | **clean — 0 errors, 0 warnings** |
| `npm run typecheck` | **clean — exit 0** |
| `npm run build` | **clean — exit 0, 48 routes** |

Playwright-spawned servers confirmed terminated after every run
(`netstat` on port 3000 clear).

## Migration status

`migration list` shows all 18 local migrations matched to remote.
`db push --dry-run`: `{"upToDate":true,"migrations":[]}`. No actual push,
repair, reset, or destructive operation was performed.

**Schema parity verified independently:** a temporary read-only script (since
deleted) confirmed all three Phase 9 tables and all eight Phase 9
functions exist, and generated columns are readable, on **both** the TEST and
DEV projects.

## Database / RLS review

- RLS enabled on `invoices`, `invoice_items`, `payments`.
- **No `using (true)` anywhere** in any migration.
- `payments` has **no** INSERT/UPDATE/DELETE grant to `authenticated` — every
  write goes through `record_manual_payment` / `start_paymongo_checkout`
  (SECURITY DEFINER) or `reconcile_paymongo_webhook_event` (service-role only).
- `invoices` UPDATE grant excludes `client_id`/`project_id`; direct updates are
  additionally restricted to `status = 'draft'`.
- Money is `numeric(14,2)` throughout; `balance_due` and `line_total` are
  Postgres generated columns and cannot drift.
- Invoice numbering is an atomic per-(organization, year) upsert-and-increment.
- Payment idempotency enforced by unique `idempotency_key` and
  `provider_event_id` constraints.
- No RLS policy, grant, or authorization check was weakened during this audit.

## Secret scan

- `.env.local` and `.env.test.local` both confirmed git-ignored and untracked.
- Only `.env.example` is tracked among env files.
- Full credential-pattern scan across **tracked** files (Supabase publishable/
  secret keys, JWTs, PayMongo `sk_`/`whsec_`, Resend `re_`) produced one hit in
  `docs/PHASE_1_SETUP.md`, verified to be uppercase **placeholders**
  (`sb_secret_<...>`), not real key material.
- No secret is exposed through any `NEXT_PUBLIC_*` name — verified by grep for
  `NEXT_PUBLIC_*SECRET` / `NEXT_PUBLIC_*SERVICE` (no matches). The server
  launcher maps the secret key only to `SUPABASE_SECRET_KEY`.
- No secret values were printed at any point during this audit.

## Manual checks still required

- Real PayMongo **test-mode** credentials + the full manual verification
  checklist in `docs/PHASE_9_INVOICES_PAYMENTS_SETUP.md` §17.
- Re-verify PayMongo's `Paymongo-Signature` header shape against their current
  documentation.
- Production `RESEND_API_KEY` / `EMAIL_FROM`. (Note: E2E logs show Resend
  correctly returning 422 for `example.com` fixture addresses and the app
  degrading safely — this is expected, not a defect.)
- End-to-end manual invoice → payment walkthrough by a human operator.

## PayMongo live-verification status

**NOT VERIFIED.** No live PayMongo credentials are available in this
environment. The provider boundary, webhook signature verification, and all
reconciliation rules are implemented and covered by unit tests against
PayMongo's documented API/signature shape, and by integration tests that call
the database functions directly. No live PayMongo session, webhook delivery,
or successful payment has been exercised. Per the project's standing rule, a
live successful payment was **not** faked.

## Final stability classification

## STABLE FOR TESTING

All automated checks pass repeatedly and deterministically, TEST/DEV
migrations are aligned, Phase 8 shows no regression from Phase 9, Phase 9 E2E
passes with retries disabled on a cold server, and no secrets are committed.

Not classified **STABLE FOR MERGE** or **PRODUCTION READY** because the
PayMongo live-sandbox verification and the manual invoice/payment operator
walkthrough remain outstanding — both are explicitly required before any
production claim that includes payments.
