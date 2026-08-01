# Phase 8 automated testing — Files + Revisions

This document describes the automated test suite for Phase 8 (F-064 through
F-069: private file upload/visibility/download and the client revision
workflow). It does not redesign or extend Phase 8 itself — see
`docs/PHASE_8_FILES_REVISIONS_SETUP.md` for the feature. Phase 9 is not
started or referenced by anything here.

## Frameworks used

- **Node's built-in test runner** (`node --test`), matching every prior
  phase's test suite (`tests/*.test.mjs`) — used for unit tests and for
  database/RLS/storage/revision integration tests.
- **Playwright** (`@playwright/test`, newly added as a devDependency) — used
  for the four browser end-to-end flows. It was not previously installed;
  no other E2E framework existed to reuse.

No test in this suite ever mocks Supabase Auth, RLS, storage policies, or the
revision workflow. Integration and E2E tests run against a real, dedicated,
non-production Supabase project using real authenticated sessions.

## Directory layout

```text
tests/phase8/
  helpers/
    test-env.mjs         Env-var gating + skip reasons, shared by every layer
    supabase-clients.mjs Test-project Supabase client constructors
    factory.mjs          Fixture creation/teardown for integration tests
  unit/
    file-validation.test.mjs
    storage-path.test.mjs
    revision-validation.test.mjs
    revision-transitions.test.mjs
    error-and-cleanup.test.mjs
  integration/
    rls-files-and-revisions.test.mjs
    storage.test.mjs
    revision-workflow.test.mjs
  e2e/
    global-setup.ts       Idempotent fixed E2E fixtures (org, clients, users,
                           projects, files, revisions)
    fixture-ids.ts         Reads the ids global-setup.ts writes
    internal-admin-flow.spec.ts
    client-owner-flow.spec.ts
    client-viewer-flow.spec.ts
    cross-client-access.spec.ts
playwright.config.ts
```

## Environment variables

All test-only. Never production credentials, never committed — put real
values in `.env.test.local` (already gitignored) or in CI secrets. Empty
placeholders are documented in `.env.example`.

| Variable | Used by | Purpose |
| --- | --- | --- |
| `TEST_SUPABASE_URL` | unit (n/a), integration, E2E | URL of the dedicated test Supabase project |
| `TEST_SUPABASE_PUBLISHABLE_KEY` | integration, E2E | Publishable (anon) key — the same key the real app uses client-side |
| `TEST_SUPABASE_SECRET_KEY` | integration, E2E (setup/cleanup only) | Service-role key, used only for fixture setup/teardown and by `global-setup.ts` |
| `TEST_APP_URL` | E2E | Local origin where Playwright starts the app under test |
| `TEST_INTERNAL_ADMIN_EMAIL` / `TEST_INTERNAL_ADMIN_PASSWORD` | E2E | Fixed internal admin test user |
| `TEST_CLIENT_OWNER_EMAIL` / `TEST_CLIENT_OWNER_PASSWORD` | E2E | Fixed Client A "owner" test user |
| `TEST_CLIENT_VIEWER_EMAIL` / `TEST_CLIENT_VIEWER_PASSWORD` | E2E | Fixed Client A "viewer" test user |

`TEST_SUPABASE_SECRET_KEY` is used only by test setup/cleanup code
(`factory.mjs`, `global-setup.ts`). Every assertion in every test —
integration and E2E alike — authenticates as a normal user (owner, manager,
viewer, internal admin, or anonymous) and goes through the application's
normal RLS/authorization path, exactly like a real browser would. The
secret key is never used by a Playwright browser page and never sent to the
browser.

### How `.env.test.local` is loaded

`tests/phase8/helpers/test-env.mjs` loads `.env.test.local` itself, once, as
a top-level side effect (via `dotenv`, resolving the file path as
`path.resolve(process.cwd(), ".env.test.local")` rather than a hardcoded
absolute path — so it works the same on every machine and OS, given every
consumer is always invoked from the project root). `import.meta.url` was
tried first but rejected: Playwright's own config/dependency loader compiles
this file in a context where `import.meta` throws `SyntaxError: Cannot use
'import.meta' outside a module`, even though plain `node --test` handles it
fine — `process.cwd()` avoids that entirely. Every consumer —
`playwright.config.ts`, every `*.spec.ts`, `global-setup.ts`, and every
`tests/phase8/integration/*.test.mjs` file — imports from this helper before
calling any of its functions, and module evaluation guarantees that import
(and therefore the env load) completes before
`getPhase8SupabaseTestConfig()` / `getPhase8E2EConfig()` ever read
`process.env`, regardless of which file Playwright or `node --test` happens
to load first. The load uses `override: false`, so a real value already
present in `process.env` (as in CI, where secrets are injected directly)
always wins over the file — the file only fills in whatever CI didn't
already set.

For E2E runs, `scripts/start-phase8-e2e-server.mjs` reads that shared test
configuration and starts `next dev` directly through Node. It maps only these
app-facing variables in the child process:

| Test variable | Next.js application variable |
| --- | --- |
| `TEST_APP_URL` | `NEXT_PUBLIC_APP_URL` |
| `TEST_SUPABASE_URL` | `NEXT_PUBLIC_SUPABASE_URL` |
| `TEST_SUPABASE_PUBLISHABLE_KEY` | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| `TEST_SUPABASE_SECRET_KEY` | `SUPABASE_SECRET_KEY` (server-only) |

The mapped child-process values take priority when Next.js also reads
`.env.local`. The service-role secret is never assigned to a `NEXT_PUBLIC_*`
name. Missing or placeholder E2E variables stop the launcher early with a
message containing variable names only, never their values.

A variable is treated as **not configured** (triggering a skip, identical to
being unset) if it is missing, blank, or matches a known placeholder value
from `.env.example`/this doc (e.g. `your_test_secret_key`, `example.com`),
so a copy-pasted template is never mistaken for a real credential. The skip
reason returned by `getPhase8IntegrationSkipReason()` /
`getPhase8E2ESkipReason()` names only which variables are missing or still
hold a placeholder — for example `"Phase 8 E2E skipped: missing
TEST_APP_URL; placeholder value in TEST_CLIENT_OWNER_EMAIL. ..."` — and
never includes any variable's actual value, so it is always safe to print
in test output or CI logs.

Unit tests (`tests/phase8/unit/*.test.mjs`) require no environment variables
at all — they test pure logic (validation, path building, transition rules)
against the actual source files and the actual migration SQL, with no
network access.

## Setting up the dedicated test Supabase project

1. Create a **new, separate** Supabase project used only for testing —
   never the project referenced by `.env.local`/production.
2. Apply every migration in `supabase/migrations/` to it, in order, the same
   way described in `docs/PHASE_8_FILES_REVISIONS_SETUP.md` (this creates
   the `project-files-private` storage bucket and all Phase 1–8 tables,
   RLS policies, and RPC functions the tests exercise).
3. Copy that project's URL, publishable key, and secret key into
   `.env.test.local` as `TEST_SUPABASE_URL` / `TEST_SUPABASE_PUBLISHABLE_KEY`
   / `TEST_SUPABASE_SECRET_KEY`.

No manual bucket setup is required beyond applying the migrations — the
Phase 8 migration creates the private `project-files-private` bucket and its
`storage.objects` policies itself.

## Setting up the fixed E2E test users

Playwright's `global-setup.ts` creates these users itself (idempotently, via
`admin.auth.admin.createUser`) the first time it runs, using the emails and
passwords from `TEST_INTERNAL_ADMIN_*` / `TEST_CLIENT_OWNER_*` /
`TEST_CLIENT_VIEWER_*`. You only need to choose the three email/password
pairs and put them in `.env.test.local` — there is no separate manual
sign-up step. Repeated runs reuse the same users and fixed organization,
clients, and project rather than creating duplicates.

## Commands

```bash
npm run test:phase8       # Phase 8 unit + integration tests (node --test)
npm run dev:e2e:phase8    # supporting test-env Next.js server (normally automatic)
npm run test:e2e:phase8   # Phase 8 Playwright E2E specs
npm run test:phase8:all   # both, in sequence
npm test                  # the full repository suite, Phase 8 included
```

`test:e2e:phase8` starts and stops the application automatically through
Playwright's `webServer` configuration. Do not start `npm run dev` first;
`reuseExistingServer: false` ensures an app using `.env.local` cannot be
silently reused for the test run.

## What's covered

**Unit** (no environment required, always run):
- File validation: MIME/extension allowlists, size limits, visibility
  values, category handling.
- Storage path building: uniqueness, idempotent-retry stability, filename
  never used as the sole path component, fixed segment ordering,
  path-traversal containment.
- Revision validation: priority enum, title/description length limits,
  optional page/section handling.
- Revision status transitions: every valid transition
  (`submitted → reviewing → in_progress → ready_for_review → approved →
  closed`, and `ready_for_review → rejected → in_progress`) is asserted
  against the actual `transition_revision_status`/`approve_revision`/
  `request_revision_changes` SQL in the migration; invalid/skipped
  transitions are asserted absent.
- Error/cleanup behavior: no secrets, tokens, or signed URLs are ever
  logged; every action returns a structured result instead of throwing;
  idempotency keys regenerate after each attempt; pending UI states resolve.

**Integration** (require `TEST_SUPABASE_*`, skip cleanly otherwise):
- `rls-files-and-revisions.test.mjs`: anonymous denial, cross-organization
  denial, cross-client denial, internal-vs-client file visibility,
  suspended-membership denial, viewer-cannot-upload,
  owner/manager-can-upload, browser cannot forge organization/client ids,
  cross-org assignment denial, direct table access blocked by RLS.
- `storage.test.mjs`: who can upload (internal/owner/manager succeed,
  viewer/cross-client fail), bucket privacy, signed URL authorization +
  expiry + usability, server-controlled storage paths, stored metadata
  matches the uploaded file, idempotent retries, cleanup scoped to only the
  test's own objects.
- `revision-workflow.test.mjs`: submission by owner/manager, denial for
  viewer and cross-client, attachment validation (including rejecting a
  cross-project or internal-only attachment), assignment within/across
  organizations, invalid transitions rejected, the full
  submitted→…→ready_for_review sequence, approval idempotency, wrong-client
  approval denial, request-changes with and without a comment, resuming a
  rejected revision, and full activity-log traceability/ordering.

**End-to-end** (require `TEST_APP_URL` + all `TEST_*` credentials, skip
cleanly otherwise), one spec per documented user flow:
- `internal-admin-flow.spec.ts`: sign in, upload an internal file and a
  client-visible file, verify visibility badges, download a file, then move
  a revision through assignment and every internal status transition up to
  "ready for review."
- `client-owner-flow.spec.ts`: sign in, confirm the internal-only fixture
  file is never visible, download a permitted file, upload a new file,
  submit a revision with and without an attachment, then review and approve
  a fixed ready-for-review revision.
- `client-viewer-flow.spec.ts`: sign in, confirm read-only access to
  permitted files, confirm the upload form and revision-submission form are
  entirely absent from the DOM (not merely disabled), then confirm a direct
  RPC call bypassing the UI is still rejected by RLS for both upload and
  revision submission.
- `cross-client-access.spec.ts`: signed in as Client A, confirm Client B's
  project URL renders a safe "not found" state with no Client B names or
  file names leaked, confirm Client B's project never appears in Client A's
  own project list, and confirm direct RPC calls for Client B's files/
  revisions/download return empty results rather than another client's
  data.

## Test fixture strategy

- **Integration tests** (`factory.mjs`) create fully isolated fixtures per
  test run: two organizations, internal admin/PM/team member, two clients
  each with owner/manager/viewer, two projects, real uploaded files, and a
  revision — all with unique, run-scoped values (via `testRunId()`) so
  parallel/repeated runs never collide.
- **E2E tests** (`global-setup.ts`) instead use a small set of **fixed,
  idempotent** fixtures (looked up by a documented, unique slug/email/title
  before creating), because Playwright's global setup runs once per test
  run and every spec needs the same known ids. Fixtures that must be
  re-walked through a workflow (the two revision fixtures) are reset to
  their starting status on every run rather than duplicated.

## Cleanup behavior

- Integration test fixtures are torn down in `factory.mjs`'s
  `cleanupPhase8Fixtures()`, in explicit dependency order (storage objects →
  revisions → project_files → project_members → projects → client_users →
  clients → organization_members → profiles → auth users → organizations),
  each step wrapped so one failure doesn't prevent the rest from running.
  Cleanup only ever touches ids this run created, so it cannot remove
  unrelated records.
- E2E fixtures are intentionally **not** torn down after each run — they are
  fixed, idempotent, and reset to a known starting state instead, since
  global setup runs once per Playwright invocation and every spec depends
  on the same ids existing. Ad-hoc data created *during* an E2E run (e.g.
  the timestamp-suffixed files/revisions the owner and internal-admin specs
  upload/submit through the UI) accumulates in the dedicated test project
  across repeated runs. This is acceptable because the project is
  non-production and dedicated to this suite, but periodically resetting it
  (or re-running the migrations against a fresh project) is a reasonable
  manual maintenance step — see "Remaining manual-only checks" below.

## Test isolation

Every integration test authenticates its own client per test (no shared
mutable session across tests), uses unique values, and cleans up in a
`finally`/`after`/`afterAll` hook. Playwright's config runs with
`fullyParallel: false` and `workers: 1` for the Phase 8 project specifically
so specs never race each other over the shared fixed E2E fixtures, while
each spec's own assertions still target ids/values unique to that spec.

## CI configuration

Both the integration and E2E layers check for required environment
variables (`hasPhase8IntegrationEnv()` / `hasPhase8E2EEnv()` in
`tests/phase8/helpers/test-env.mjs`) before doing any network work, and
call `test.skip(...)` / `t.skip(...)` with an explicit, dynamically-built
reason (`getPhase8IntegrationSkipReason()` / `getPhase8E2ESkipReason()`)
naming the specific missing/placeholder variables when they are missing —
this is a visible skip, never a silent pass and never a hard CI failure.
Unit tests always run regardless of environment.

To actually exercise the integration/E2E layers in CI, configure these as
CI secrets (never as plain repository variables): `TEST_SUPABASE_URL`,
`TEST_SUPABASE_PUBLISHABLE_KEY`, `TEST_SUPABASE_SECRET_KEY`, and — for the
E2E job only, which additionally needs the app running — `TEST_APP_URL`,
`TEST_INTERNAL_ADMIN_EMAIL`, `TEST_INTERNAL_ADMIN_PASSWORD`,
`TEST_CLIENT_OWNER_EMAIL`, `TEST_CLIENT_OWNER_PASSWORD`,
`TEST_CLIENT_VIEWER_EMAIL`, `TEST_CLIENT_VIEWER_PASSWORD`. Playwright
browsers must also be installed in the CI image
(`npx playwright install --with-deps chromium`).

## Known issues found by running against a real test project

Running `npm run test:phase8` / `npm run test:e2e:phase8` against a real,
configured test project (rather than only verifying that they skip cleanly
when unconfigured) surfaced three genuine defects in the original Phase 8
storage RLS policies, all now fixed via follow-up migrations, plus a
test-account setup lesson. Recorded here rather than only in chat history:

1. **`project_files_storage_insert_client`/`_internal` could never let an
   authorized upload through** — their `with check` queried
   `public.projects` directly (`exists (select 1 from public.projects
   ...)`), evaluated under the caller's own restricted RLS visibility
   rather than through a SECURITY DEFINER helper. Portal clients have no
   direct RLS access to `public.projects` at all (by design), so the
   subquery always evaluated to nothing for a client session regardless of
   real ownership. Confirmed empirically (a client's own
   `create_client_project_file` RPC call succeeded while the identical
   `storage.upload()` failed) and fixed in
   `20260803020000_fix_phase_8_storage_insert_policy_rls.sql`, which moves
   the check into new `private.can_upload_internal_project_file` /
   `private.can_upload_client_project_file` SECURITY DEFINER helpers.
2. **`project_files_storage_select_client` had the identical flaw**,
   confirmed live via the client-owner/client-viewer E2E flows: real file
   downloads failed with "We couldn't prepare this download. Please try
   again." because `createSignedUrl()` enforces this policy, and it also
   queried `public.project_files` directly. Fixed in
   `20260803030000_fix_phase_8_storage_select_client_policy_rls.sql` via a
   new `private.can_download_client_project_file` helper.
3. **`storage.objects` had no UPDATE policy at all**, for any role. Both
   upload actions (`uploadPortalProjectFileAction` and its internal
   equivalent) call `.storage.upload(path, buffer, { upsert: true, ... })`
   — `upsert: true` so a client-generated idempotency-key retry safely
   reuses the same path — and Supabase Storage implements an upsert upload
   as `INSERT ... ON CONFLICT DO UPDATE`, which requires the UPDATE policy
   to permit the operation regardless of whether the object already
   exists. With none defined, every real upload failed even after fixes 1
   and 2 above, confirmed by reproducing the exact failure with a minimal
   script: the identical upload succeeds with `upsert` omitted (a plain
   insert) and fails only when `upsert: true` is passed. Fixed in
   `20260803040000_fix_phase_8_storage_missing_update_policy.sql`, adding
   `project_files_storage_update_internal`/`_client` policies that reuse the
   same two SECURITY DEFINER helpers from fix 1.
4. **Even with fixes 1–3 applied, client uploads with `upsert: true` still
   failed** — isolated to the client role only (the equivalent internal
   upload already succeeded). Proven directly: an object uploaded via the
   admin client with no matching `project_files` row is invisible to the
   owning client via `createSignedUrl()` ("Object not found"), even though
   the object physically exists — exactly the state of every object
   between the storage write and the `create_client_project_file` RPC call
   that creates its metadata row (the two steps are sequential, not
   atomic). Supabase Storage's upsert path evaluates the SELECT policy to
   check for a conflicting object before deciding insert vs. update; for a
   client session that SELECT can never succeed for an as-yet-untracked
   object, so upsert fails structurally regardless of how correct the
   INSERT/UPDATE policies are. The internal SELECT policy has no such gap
   (it only checks org membership, never `project_files` existence) —
   exactly why internal upserts already worked. Fixed in
   `20260803050000_fix_phase_8_storage_select_client_upload_gap.sql`,
   extending `can_download_client_project_file` to also succeed when the
   caller could independently have uploaded to this exact path
   (`can_upload_client_project_file` — the same check INSERT/UPDATE already
   use), not only when a confirmed `project_files` row already exists. This
   doesn't meaningfully widen access: anyone satisfying that check already
   has write access to the exact same path and could just overwrite it with
   their own content and read that back.
5. **Reusing one real email address for all three `TEST_*_EMAIL`
   variables causes two problems** if that address already has other data
   in the configured Supabase project (e.g., because it's also a
   personal/dev account, not one created fresh only for this suite): (a)
   the app's deliberate "exactly one active organization membership" /
   "exactly one active client membership" fail-closed checks
   (`src/lib/auth/server.ts`'s `getInternalMemberForUser`,
   `private.active_client_id()`) reject sign-in entirely once that profile
   has more than one active membership anywhere in the project, and (b)
   because all three `TEST_*_EMAIL` variables would resolve to the same
   Supabase Auth user → the same `profiles` row, `global-setup.ts`'s
   owner/viewer `client_users` inserts would both target that one profile,
   so the second (viewer) write silently overwrites the first (owner).
   **Use three genuinely fresh, dedicated email addresses with no other
   data anywhere in the target Supabase project** — including no prior
   internal-organization membership from earlier phases' manual testing —
   to get meaningful, independent results from all four E2E flows.

All four storage-policy fixes need to be applied to **every** Supabase
project that has the Phase 8 migration deployed — not just the dedicated
test project — since the same broken policies affect real uploads/
downloads through the actual application UI wherever Phase 8 is deployed.

### E2E test-script bugs found once the app-level fixes above landed

With the four storage-policy defects fixed, the E2E specs surfaced a
further set of bugs — all in the test scripts themselves, not the
application:

- **A locator pattern that could never match.** Several specs used
  `page.getByTestId(x).filter({ has: page.locator('[data-y="z"]') })` where
  `data-testid` and the second attribute are both on the *same* element,
  not an ancestor/descendant pair — `.filter({ has })` only matches
  descendants, so this never matched. Fixed by switching to a single
  combined-attribute selector, e.g.
  `page.locator('[data-testid="x"][data-y="z"]')`.
- **A real race condition**: `internal-admin-flow.spec.ts`'s second test
  clicked "Sign in" and immediately called `page.goto("/admin/projects")`
  with no wait for the redirect, so it could navigate away before the
  session cookie was actually set and land back on the login page. Fixed
  by awaiting `expect(page).toHaveURL(/\/admin/)` first, matching the
  pattern the first test already used.
- **An assertion based on a UI feature that doesn't exist**:
  `RevisionAssignForm` auto-submits on `<select>` change
  (`<form onChange={submit}>`) and only ever renders an *error* message,
  never a success one — the spec's explicit "Update assignment" click was
  redundant and its `getByText(/assignment updated/i)` assertion could
  never pass. Fixed by removing the redundant click and waiting for the
  submit button's pending label ("Saving…") to revert instead.
- **Ambiguous `getByText` matches**: plain-string `getByText` is a
  case-insensitive substring match by default. Once the reused revision
  fixture's activity timeline accumulated entries like "Status changed to
  in progress" across repeated runs, `getByText("In progress")` started
  matching both that activity entry and the actual status badge, tripping
  Playwright's strict-mode check. Fixed with `{ exact: true }` on all three
  status-text assertions.
- **Timeouts and retries tuned for a real remote project in dev mode.**
  Playwright's defaults (30s test timeout, 5s assertion timeout, CI-only
  retries) assume either a local/fast backend or a production build.
  Against a live remote Supabase project through `next dev` (which pays a
  one-time Turbopack compile cost per route, on top of real network
  latency that was observed to occasionally spike well into double-digit
  seconds under heavy same-session load), these were too tight and produced
  failures that looked structural but were actually just timing. Raised to
  a 150s test timeout, 25s assertion/action timeout, and 1 retry locally
  (not just in CI) — a single retry reliably absorbed the observed
  variance without masking a genuine hang (a truly stuck test still fails,
  just later and after one retry).

All four storage-policy migrations and all E2E test-script fixes above
have been applied/verified against the dedicated test project, with a full
`npm run test:phase8` (73/73) and `npm run test:e2e:phase8` (6/6) green run
confirming it end to end — not just individually re-tested in isolation.
The four storage-policy migrations still need to be applied to any *other*
Supabase project running Phase 8 (e.g. a separate development project) —
they were confirmed present there too during this work, but re-verify if
that project is rebuilt from scratch.

## Remaining manual-only checks

- Visual/responsive review of the files and revisions UI (this suite
  asserts behavior and text content, not pixel-level layout).
- Periodically resetting or re-provisioning the dedicated test Supabase
  project if accumulated E2E fixture data (timestamped uploads/revisions)
  grows large enough to be inconvenient — the reused revision fixtures'
  activity timelines in particular grow by a few rows per E2E run.
