# Phase 8 files and revisions setup

Phase 8 adds private project file storage (internal and client-uploaded) and
a client revision-request workflow with an internal management workspace and
a client review flow. This implementation covers F-064 through F-069 at V0.2
scope.

It does not add invoices, payments, PayMongo, support tickets, maintenance
subscriptions, broader notifications infrastructure, AI, file deletion as a
general feature, or anything from Phase 9+.

## Prerequisites

- Complete Phases 1–7 (`docs/PHASE_1_SETUP.md` through
  `docs/PHASE_7_CLIENT_PORTAL_SETUP.md`).
- Use an intended non-production Supabase project for migration and security
  verification.
- Keep the existing `.env.local` values private.

Phase 8 uploads, downloads, and internal mutations use the cookie-scoped
Supabase SSR client (`src/lib/supabase/server.ts`) and RLS/storage policies —
exactly like every prior phase. No admin/service-role client is used
anywhere in this phase's code, for either files or revisions: every
authorization check (organization membership, project access, client
membership, role) happens through the caller's own authenticated session, so
signed URLs, uploads, and RPC calls are all subject to the same RLS and
storage policies described below.

## Apply the migration

The tracked migration is:

```text
supabase/migrations/20260803000000_phase_8_files_revisions.sql
```

It does not edit any already-applied migration. Review the linked project,
then run:

```bash
npx supabase db push --include-all
```

If the CLI's platform login-role endpoint returns HTTP 403 (the same known
account/token permission issue documented in every prior phase's setup doc,
not a code defect), connect with the database password instead:

```bash
npx supabase db push --dry-run --include-all --password '<DB_PASSWORD>'
npx supabase db push --include-all --password '<DB_PASSWORD>'
```

Never paste the database password into source files, commits, or chat.

A second, small follow-up migration also exists:

```text
supabase/migrations/20260803010000_fix_phase_8_attachment_default.sql
```

It does not edit the migration above (or any other already-applied
migration) — it only replaces `create_client_revision` with an identical
body plus one addition: its trailing `p_attachment_file_id` parameter now
has `default null`. This mirrors the existing
`20260801010000_fix_send_proposal_version_ambiguity.sql` precedent for a
small, targeted follow-up fix rather than a rewrite of the original
migration. See "RPC argument nullability" below for why this was needed.
Apply it the same way, after the main Phase 8 migration:

```bash
npx supabase db push --include-all
```

**Status of this implementation session:** both migration files have been
written and are covered by `tests/files/project-files.test.mjs` and
`tests/revisions/revisions.test.mjs` (static checks against the migration
text and application code — no live database was available in this session
to actually execute `db push` against, and the CLI's login-role endpoint
returned the same HTTP 403 already documented above). Neither migration has
been applied to any Supabase project by this agent, and
`src/types/database.ts` reflects only the first migration (it was
regenerated against a live project by a maintainer between the initial
Phase 8 delivery and this follow-up fix). Application code is written
directly against the target schema (table/column/function names below),
matching the same approach Phases 6 and 7 used while type generation was
blocked — `npm run typecheck` and `npm run build` show exactly one error
(`src/features/portal/revisions/actions.ts`, the `p_attachment_file_id`
omission — see "RPC argument nullability") until a maintainer with real
Supabase project access applies the second migration and regenerates types
again (see below).

## RPC argument nullability

Every parameter in the Phase 8 RPC functions (`p_mime_type`, `p_category`,
`p_page_name`, `p_section_name`, `p_attachment_file_id`, etc.) was declared
in the original migration with **no SQL default**, so Supabase's generated
`Args` types mark all of them as required, plain (non-nullable) `string`/
`number` properties — never `| null`, and never optional (`?`). Sending
`value || null` for any of them is therefore a real type error, not a false
positive: TypeScript is correctly rejecting a value the generated type
never promised to accept.

Two different, deliberate strategies are used, chosen per field based on
what the underlying Postgres column type can safely accept:

- **`p_mime_type`** (required, `text`): the browser occasionally reports no
  MIME type at all (`file.type === ""`). Rather than treating that as
  absent, the actions normalize it to `"application/octet-stream"`
  (`const safeMimeType = file.type.trim() || "application/octet-stream";`)
  — a real, meaningful value is always sent, and this fallback is computed
  *after* `validateUploadedFile()`'s extension/allowlist check, so it can
  never be used to admit a file that failed validation.
- **`p_category` / `p_page_name` / `p_section_name`** (required, `text`,
  no default): all three already have documented "empty means not
  provided" semantics in their SQL functions
  (`nullif(btrim(coalesce(p_x, '')), '')`), so an empty string and SQL NULL
  produce an identical stored result. The Zod schemas already normalize
  these to a plain string via `.trim().default("")`, so the actions pass
  them through exactly as parsed — never wrapped in `|| null`.
- **`p_attachment_file_id`** (`uuid`, not `text`): this one cannot use the
  same "empty string" trick — `''::uuid` is not valid input and Postgres
  raises `invalid input syntax for type uuid` for it, unlike a `text`
  column. Omitting the key entirely is the only genuinely safe way to
  represent "no attachment," which requires the parameter to have a SQL
  default (so the generated property becomes optional) — hence the
  follow-up migration above. `submitRevisionAction` includes the key only
  when a real, Zod-validated (`z.uuid()`) value is present:
  ```ts
  ...(attachmentFileId ? { p_attachment_file_id: attachmentFileId } : {}),
  ```
  An invalid attachment value (anything that is neither `""` nor a valid
  UUID) is rejected by the Zod schema before this code ever runs — it is
  never silently coerced to null or omitted.

No non-null assertion, `as string`/`as any`/`as never` cast,
`@ts-ignore`/`@ts-expect-error`, or manual edit to `src/types/database.ts`
was used anywhere in this fix.

## Tables and functions created

- `public.project_files`
- `public.revisions`
- `public.revision_activities` — additional table beyond the two named in
  this phase's official database scope, genuinely required for traceability
  (see "Traceability" below).
- `private.can_manage_project(project_id)` — shared "may this internal
  caller upload files to / manage revisions on this project" check, reused
  by the file RPC functions, the revision functions/RLS, and the
  `storage.objects` policies.
- `private.active_client_role()` — the role half of Phase 7's
  `private.active_client_id()`, used to enforce "owner/manager may
  write, viewer is read-only" everywhere a client writes.
- `private.record_revision_submitted_activity()` /
  `private.record_revision_assignment_activity()` — trigger functions.
- `public.create_internal_project_file(...)`,
  `public.create_client_project_file(...)`,
  `public.get_client_project_files(project_id)`,
  `public.get_client_project_organization_id(project_id)`,
  `public.get_client_file_for_download(file_id)`.
- `public.create_client_revision(...)`, `public.get_client_revisions(project_id)`,
  `public.get_client_revision_activities(revision_id)`,
  `public.transition_revision_status(revision_id, new_status)`,
  `public.approve_revision(revision_id)`,
  `public.request_revision_changes(revision_id, comment)`.

### Additional fields/constraints beyond DATABASE.md's suggested schema

- `projects.id, organization_id, client_id` gets one new additive unique
  constraint, `projects_id_organization_id_client_id_key`. It lets both
  `project_files` and `revisions` enforce "must never point to a project,
  client, and organization that do not belong together" with a single
  composite foreign key each, rather than chaining two composite foreign
  keys the way Phase 5 did for `projects -> clients`.
- `project_files.project_id` is `not null` (DATABASE.md's suggested schema
  left it nullable) — every documented Phase 8 flow always begins with
  "Choose Project," so a file with no project never occurs in this phase.
- `revisions.attachment_file_id` (nullable, `references project_files(id) on
  delete restrict`) — not in DATABASE.md's suggested `revisions` schema, but
  explicitly permitted by this phase's own instructions after inspecting the
  existing schema: USER_FLOWS.md §40 and PRODUCT.md §27 both list a
  "Screenshot / Attachment" field for revision submission, and this phase's
  requirements require it to "use the private file system." `on delete
  restrict` guarantees a file still referenced by a revision can never be
  deleted (this phase does not build a delete feature, but the constraint is
  the documented safety net for a future one).
- No other fields were added. In particular, `revisions` has **no** mutable
  "current rejection comment" column — the required client comment is
  stored only in `revision_activities.description` (see "Traceability").

## Storage

- Bucket: `project-files-private` (matches the name suggested in
  ARCHITECTURE.md §34 and DATABASE.md §93).
- **Not public.** `public = false` in `storage.buckets`.
- Bucket-level `file_size_limit` (26,214,400 bytes = 25 MiB) and
  `allowed_mime_types` are set as a second enforcement layer *in addition
  to* the application/database checks — Supabase Storage itself will reject
  an upload outside these, even if application code had a bug.
- Storage path (server-controlled, never accepted from the browser):

  ```text
  organization/{organization_id}/client/{client_id}/project/{project_id}/{uuid}-{safe_filename}
  ```

  `organization_id`/`client_id`/`project_id` always come from a validated
  server-side lookup (the project row, or — for a client upload — the new
  `get_client_project_organization_id` function plus the caller's own
  resolved client id). `{uuid}` is a client-generated idempotency key (see
  "Upload and cleanup strategy" below) — never trusted for authorization,
  only used so a retried submission reuses the same object. `{safe_filename}`
  is the original name after `sanitizeDisplayFileName()`
  (`src/lib/storage/project-files.ts`) strips path separators, control
  characters, and reserved punctuation, and bounds the length — this is also
  the name preserved and shown in the UI (`project_files.file_name`); the
  internal UUID/path structure is never shown to users.
- `storage.objects` policies (`project_files_storage_insert_internal`,
  `_insert_client`, `_select_internal`, `_select_client`,
  `_delete_internal`, `_delete_client`) re-derive the path's segments via
  `storage.foldername(name)` and cross-check them against a real
  `public.projects` row (insert) or a real `public.project_files` row with
  `visibility = 'client'` (client select) — folder naming alone is never the
  security boundary. There is no broad `using (true)` policy, and no
  `list`-equivalent policy exists beyond the scoped `select` policies above,
  so an arbitrary authenticated user cannot enumerate the bucket.

## File visibility rules

```text
internal — internal team members with project access only
client   — internal team members AND the owning client's portal users
```

- Internal reads: any active internal member of the file's organization can
  read **both** `internal` and `client` files
  (`project_files_select_internal_members` RLS policy) — matches DATABASE.md
  §59 ("Internal files... must never be exposed to client portal users;
  client files still require client ownership validation").
- Portal reads: exclusively through `get_client_project_files()` /
  `get_client_file_for_download()`, both filtered to
  `visibility = 'client'` and the caller's own resolved `client_id`. There is
  **no** client-facing RLS policy on `project_files` at all — matching
  Phase 7's documented reasoning for `clients`/`projects`/`milestones`: a
  table-level policy would also let a client `select *` and see
  `uploaded_by`/`storage_path`, so the read path goes entirely through a
  `SECURITY DEFINER` function that returns only curated columns.
- A client can never choose `internal` visibility: `create_client_project_file`
  hard-codes `visibility = 'client'` in its `insert` statement and does not
  accept it as a parameter at all.
- Visibility cannot be changed after upload in this phase (no update grant
  exists on `project_files`) — see "Deferred Phase 9+ functionality."

## Internal/client upload permissions

Internal (mirrors `private.can_manage_project()` exactly — this decision is
not explicit in FEATURES.md/DATABASE.md and is documented here per this
phase's instructions):

```text
super_admin, admin        — upload/manage files for any project in the org
project_manager           — only a project they manage (project_manager_id)
                             or are a project_members row for
team_member                — only a project they are a project_members row for
```

Client (mirrors `private.active_client_role()`; also documented here as this
phase's decision for unspecified client write permissions):

```text
owner, manager — may upload
viewer          — read-only
```

Both internal and client uploads go through a dedicated `SECURITY DEFINER`
RPC function (`create_internal_project_file` /
`create_client_project_file`) rather than a direct authenticated `insert`
grant — `project_files` has no `INSERT`/`UPDATE`/`DELETE` grant to
`authenticated` at all. This keeps the "which internal role can act on which
project" and "client role gate" logic in exactly one place each, reused by
both the RPC function and (for the internal/client project-access rule) the
`storage.objects` policies.

## Supported MIME types and maximum file size

Centralized in `src/lib/storage/project-files.ts`
(`ALLOWED_MIME_TYPES`, `ALLOWED_EXTENSIONS`, `MAX_FILE_SIZE_BYTES`), re-used
by `src/features/files/schemas.ts`'s `validateUploadedFile()`:

```text
image/png, image/jpeg, image/webp, image/gif
application/pdf
application/msword, .docx
application/vnd.ms-excel, .xlsx
application/vnd.ms-powerpoint, .pptx
text/plain
application/zip
```

Maximum size: **25 MiB** (26,214,400 bytes) — enforced in three independent
places that must be changed together if it ever changes: the Zod/JS check in
`validateUploadedFile()`, the `project_files_file_size_check` /
`p_file_size` checks in the migration, and the bucket's own
`file_size_limit`.

The browser-reported `file.size`/`file.type` are never the only validation:
the server re-checks the real `ArrayBuffer` length after reading the upload,
and `hasMismatchedFileSignature()` sniffs the first bytes against known
magic numbers (PNG/JPEG/GIF/WEBP/PDF) to catch a file whose declared MIME
type clearly does not match its actual contents. Formats with no reliable
signature (zip-based/legacy office documents, plain text) are not rejected
by this check — it exists to catch a clearly mislabeled upload, not to fully
validate every format.

## Upload and cleanup strategy

Both `uploadInternalProjectFileAction` (`src/features/files/actions.ts`) and
`uploadPortalProjectFileAction` (`src/features/portal/files/actions.ts`)
follow the same sequence:

```text
1. Validate the form fields and the file (type, extension, size, signature)
2. Authorize the actor against the target project (org/client/role rules above)
3. Build the server-controlled storage path
4. Upload to Supabase Storage (upsert: true) at that path
5. Call the create_*_project_file RPC to record metadata
```

Failure handling:

- **Storage upload fails:** no metadata row is ever created (step 5 never
  runs) — the object never existed, so there is nothing to clean up.
- **Storage upload succeeds, metadata insert fails:** the action deletes the
  just-uploaded storage object (`storage.remove([storagePath])`) before
  returning a safe error, so no orphaned object is left behind.
- **Retry after a network error:** the upload form generates a
  `crypto.randomUUID()` idempotency key once (on file selection), which
  becomes the path's `{uuid}` segment. A retry of the *same* attempt reuses
  the same key, so it re-uploads to the same path (`upsert: true`, harmless)
  and the metadata insert hits `project_files.storage_path`'s unique
  constraint (Postgres error `23505`), which the action treats as "already
  succeeded" rather than an error or a duplicate row.

This phase does not implement a general file-deletion feature or UI (see
"Deferred Phase 9+ functionality"); the `storage.objects` delete policies
exist solely to support the cleanup step above.

## Signed-download strategy

```text
User clicks Download
  -> Server Action authenticates the caller
  -> Server Action authorizes the specific file (org/project membership, or
     get_client_file_for_download() for a portal user)
  -> createSignedUrl(storagePath, 120 seconds, { download: safeFileName })
  -> Browser navigates directly to the one-time signed URL
```

- Signed URL lifetime: **120 seconds** (`SIGNED_URL_TTL_SECONDS`) — long
  enough to start a download, short enough that a leaked link is useless
  soon after.
- Authorization never relies on the storage path alone: the internal path
  queries `project_files` through RLS (scoped to the caller's organization)
  first; the portal path calls `get_client_file_for_download()`, which
  resolves the caller's own active client membership internally and returns
  a row only for a `visibility = 'client'` file belonging to that client.
- `createSignedUrl` is always called with the **authenticated** SSR client,
  never the service-role/admin client — the same `storage.objects` `select`
  policies documented above are the actual enforcement for URL generation,
  not merely a defense-in-depth backstop.
- The signed URL itself is returned directly to the browser and is never
  logged (`console.error` calls only ever include `fileId`/`projectId`, not
  the URL) and never written to any database column.
- `getPublicUrl` is never called anywhere in this phase — only
  `createSignedUrl`.
- A nonexistent file, a foreign-org file, or a foreign-client file all
  produce the same safe "This file could not be found" result.

## Revision priorities and statuses

```text
priority: low, medium, high, urgent (default medium)
status:   submitted, reviewing, in_progress, ready_for_review, approved,
          rejected, closed
```

## Revision status transitions

Internal-driven, via `transition_revision_status()`:

```text
submitted        -> reviewing
reviewing        -> in_progress
in_progress      -> ready_for_review
rejected         -> in_progress   (team resumes work after a client request)
approved         -> closed
```

Client-driven, via `approve_revision()` / `request_revision_changes()`
(only from `ready_for_review`):

```text
ready_for_review -> approved
ready_for_review -> rejected      (requires a non-empty comment)
```

No other transition is accepted — `transition_revision_status()` validates
the exact edge server-side and raises a safe error otherwise; the two
client-only edges are not reachable from `transition_revision_status()` at
all. `status` is **not** part of `revisions`' authenticated `UPDATE` column
grant, so a direct table update can never change it — every status change
goes through one of these three `SECURITY DEFINER` functions.

Revision management/authorization roles (documented decision, mirroring the
file-upload decision above and PRODUCT.md §7.3's "Revisions" access for
Project Manager):

```text
super_admin, admin — manage/assign/transition any revision in the org
project_manager    — only for a project they manage or are a member of
team_member        — may transition the status of a revision currently
                      assigned to them, but may never (re)assign a revision
```

Assignment (`assigned_to`) is a direct authenticated column update, gated by
the `revisions_update_assignment` RLS policy, which requires
`super_admin`/`admin`, or a `project_manager` with project access — the
policy deliberately excludes `team_member` from assignment, and requires the
assignee to be an active member of the same organization (mirrors Phase 5's
`tasks.assigned_to` rule).

## Client review behavior

```text
Mark Ready for Review (internal)
  -> Client opens the revision
  -> Approve                       -> status = approved, resolved_at set
  -> Request Further Changes       -> status = rejected, comment required
```

- **Approve** is idempotent: calling it again on an already-approved
  revision returns `{ status: "approved", already_approved: true }` instead
  of erroring or creating a duplicate activity row.
- **Request Further Changes** requires a non-empty comment (1–3000
  characters); the comment is stored in a new `revision_activities` row
  (`activity_type = 'rejected'`, `description = comment`) — never on the
  `revisions` row itself, so an earlier rejection's comment is never
  overwritten by a later one. Both remain visible in the activity history.
- Both functions re-resolve the caller's active client membership and role
  (`owner`/`manager` only) and re-check `revision.client_id` against that
  membership on every call — a client can never approve or reject another
  client's revision, and a `viewer` cannot call either function.

## Traceability

Every important revision event is recorded in `revision_activities`
(additional table — see "Tables and functions created" above):

```text
submitted        -- AFTER INSERT trigger
assigned         -- AFTER UPDATE OF assigned_to trigger (only when it changes)
status_changed   -- written inside transition_revision_status()
approved         -- written inside approve_revision()
rejected         -- written inside request_revision_changes()
```

Each row records `activity_type`, `title`, an optional `description` (the
required client comment for `rejected`), a `metadata` jsonb payload
(`from_status`/`to_status` for status changes, `from_assignee`/`to_assignee`
for assignment), `created_by`, and `created_at` — matching the existing
`lead_activities` pattern (Phase 3) applied to revisions instead of leads,
per this phase's instruction to reuse an existing appropriate activity model
rather than invent a new, broader audit system. `revision_activities` has no
`INSERT`/`UPDATE`/`DELETE` grant to `authenticated` at all — only the
trigger functions and the three status-changing RPC functions (all
`SECURITY DEFINER`, running as the table owner) ever write to it, which is
what keeps it append-only in practice.

## Routes

Internal:

```text
/admin/projects/[projectId]/files   (upload + list, linked from project detail)
/admin/revisions                    (list, search, filters, pagination)
/admin/revisions/[revisionId]       (detail, assignment, status transitions)
```

Portal (no new top-level nav item — Files and Revisions are sections on the
existing project detail page, matching "do not create duplicate competing
route structures" and keeping the portal nav to Dashboard/Projects):

```text
/portal/projects/[projectId]        (now includes Files and Revisions sections)
```

## RLS and storage policies summary

- `project_files`: `select` for internal org members (both visibilities); no
  `insert`/`update`/`delete` grant to `authenticated` (mutation only via the
  two `create_*_project_file` RPC functions). No client-facing policy.
- `revisions`: `select` for internal org members; only the `assigned_to`
  column is directly updatable, gated by `revisions_update_assignment`. No
  `insert`/`delete` grant to `authenticated` (creation only via
  `create_client_revision`; status changes only via the three RPC
  functions). No client-facing policy.
- `revision_activities`: `select` for internal org members only; no
  `insert`/`update`/`delete` grant to `authenticated` at all. No
  client-facing policy (`get_client_revision_activities()` instead).
- `storage.objects` (bucket `project-files-private`): scoped `insert`,
  `select`, and `delete` policies for both internal and client actors,
  described under "Storage" above. No broad `using (true)` policy anywhere.
- Anonymous (`anon`) access is denied on all three new tables and on the
  bucket's policies.

## Type-generation instructions

```bash
npx supabase gen types typescript --linked --schema public > src/types/database.ts
```

Run this after **both** migrations above have actually been applied
(including `20260803010000_fix_phase_8_attachment_default.sql`). Do not
hand-edit `src/types/database.ts` and do not create a blank or partial file
as a workaround — review the diff before committing it. The generated file
must include:

- `Database["public"]["Tables"]["project_files"]`
- `Database["public"]["Tables"]["revisions"]`
- `Database["public"]["Tables"]["revision_activities"]`
- `Database["public"]["Functions"]["create_internal_project_file"]`,
  `create_client_project_file`, `get_client_project_files`,
  `get_client_project_organization_id`, `get_client_file_for_download`,
  `create_client_revision`, `get_client_revisions`,
  `get_client_revision_activities`, `transition_revision_status`,
  `approve_revision`, `request_revision_changes`
- `create_client_revision`'s `Args` should show `p_attachment_file_id` as
  **optional** (`p_attachment_file_id?: string`) once the second migration
  has been applied and types regenerated — that is what resolves the one
  remaining `npm run typecheck`/`build` error described above in "RPC
  argument nullability." If it still shows as required, the second
  migration has not been applied yet.

As with Phase 6/7, if `get_client_project_files`,
`get_client_project_organization_id`, `get_client_revisions`, or
`get_client_revision_activities` are ever called with no arguments in the
future, remember the `Args: never` / empty-object gotcha documented in
`docs/PHASE_7_CLIENT_PORTAL_SETUP.md` — none of Phase 8's functions are
zero-argument, so this does not currently apply, but keep it in mind if that
changes.

## Manual testing checklist

Files:

- [ ] Authorized internal upload (super_admin/admin, or project_manager/team_member with project access) succeeds.
- [ ] Unauthorized internal upload (team_member not on the project) is denied.
- [ ] Client owner/manager upload succeeds; client viewer upload is denied.
- [ ] A client cannot upload into another client's project.
- [ ] An invalid file type and an oversized file are both rejected before any storage call.
- [ ] The storage object name always matches the server-controlled path shape; a crafted browser request cannot control it.
- [ ] Retrying the same upload (same idempotency key) does not create duplicate metadata or duplicate storage objects.
- [ ] Forcing a metadata-insert failure after a successful storage upload leaves no orphaned storage object.
- [ ] An `internal`-visibility file never appears in `get_client_project_files()`.
- [ ] A `client`-visibility file is visible only to its own client, not another client.
- [ ] Signed URL generation requires authorization (rejects a foreign file/org/client) and the URL expires after 120 seconds.
- [ ] No endpoint ever returns a permanent/public bucket URL.
- [ ] Cross-client download attempts fail safely.
- [ ] Anonymous direct table reads of `project_files` are denied.

Revisions:

- [ ] An authorized client (owner/manager) submits a revision; a viewer cannot.
- [ ] Submission from a project belonging to a different client fails.
- [ ] Missing title/description and an invalid priority are all rejected.
- [ ] A new revision always begins with `status = submitted`.
- [ ] An optional attachment must already be the client's own `visibility='client'` file for that same project.
- [ ] Internal users list revisions only within their own organization.
- [ ] Assignment requires an active member of the same organization; team_member cannot assign.
- [ ] An invalid/out-of-order status transition is rejected by `transition_revision_status()`.
- [ ] `in_progress -> ready_for_review` succeeds and is visible to the client.
- [ ] Client approval succeeds exactly once in effect; repeating it is idempotent (no duplicate activity).
- [ ] Requesting further changes without a comment is rejected; with a comment it is required and stored.
- [ ] A client cannot approve/reject another client's revision.
- [ ] A rejected revision can be moved back to `in_progress` by an authorized internal actor.
- [ ] Status changes, assignment changes, approvals, and rejections are all visible in the revision's activity history, in order, without overwriting earlier entries.

Security:

- [ ] Internal-only file/revision metadata never appears in any client-facing payload.
- [ ] Raw storage paths and database identifiers are never rendered in the UI.
- [ ] Signed URLs and Supabase secrets never appear in server logs.
- [ ] RLS blocks a direct, unauthorized cross-client or cross-organization read of `project_files`, `revisions`, or `revision_activities`.

Run the repository checks:

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

## Deferred Phase 9+ functionality

Invoices, payments, PayMongo, support tickets, maintenance subscriptions,
broader notifications infrastructure, AI, general file deletion / a
recycle-bin, editing a file's visibility or category after upload, and
editing revision content after submission. Do not proceed to Phase 9 while
any authorization, RLS, storage-policy, or traceability check above is
failing.
