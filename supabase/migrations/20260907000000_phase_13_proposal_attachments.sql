-- Phase 13: optional final-PDF attachment on proposals.
--
-- Adds a single, optional PDF attachment to a proposal. The admin uploads it
-- while the proposal is still editable; the client downloads it from the same
-- tokenized /proposal/[token] page they already use, via a short-lived signed
-- URL. The PDF is never attached to the outbound email.
--
-- Data model: six nullable columns on public.proposals rather than a separate
-- proposal_attachments table. The product flow is "upload the final PDF" as
-- one step, and proposal_versions.snapshot already captures point-in-time
-- state at the proposal level.
--
-- Trade-off accepted deliberately: replacing the attachment deletes the
-- previous storage object, so an older version snapshot's
-- attachment_storage_path can become a dangling reference after a later
-- replace. Snapshots preserve attachment *metadata* history, not file
-- content. If per-version file retention is ever required, that needs a
-- dedicated proposal_attachments history table instead.

alter table public.proposals
  add column attachment_file_name text,
  add column attachment_storage_path text,
  add column attachment_mime_type text,
  add column attachment_file_size bigint,
  add column attachment_uploaded_at timestamptz,
  add column attachment_uploaded_by uuid;

alter table public.proposals
  add constraint proposals_attachment_uploaded_by_fkey
    foreign key (attachment_uploaded_by)
    references public.profiles (id)
    on delete set null;

alter table public.proposals
  add constraint proposals_attachment_file_name_length
    check (
      attachment_file_name is null
      or (
        btrim(attachment_file_name) <> ''
        and char_length(attachment_file_name) <= 255
      )
    );

alter table public.proposals
  add constraint proposals_attachment_storage_path_length
    check (
      attachment_storage_path is null
      or (
        btrim(attachment_storage_path) <> ''
        and char_length(attachment_storage_path) <= 1024
      )
    );

-- PDF-only: this column holds the finished proposal document specifically,
-- never an arbitrary deliverable file, so it deliberately does not reuse the
-- broader allowlist in src/lib/storage/project-files.ts.
alter table public.proposals
  add constraint proposals_attachment_mime_type_check
    check (
      attachment_mime_type is null
      or attachment_mime_type = 'application/pdf'
    );

-- 26214400 bytes = 25 MiB. Must stay in sync with MAX_FILE_SIZE_BYTES in
-- src/lib/storage/project-files.ts (re-exported by proposal-attachments.ts)
-- and with this bucket's own file_size_limit below.
alter table public.proposals
  add constraint proposals_attachment_file_size_check
    check (
      attachment_file_size is null
      or (attachment_file_size > 0 and attachment_file_size <= 26214400)
    );

-- All-or-nothing, so a half-written attachment can never exist.
-- attachment_uploaded_by is deliberately excluded: it is `on delete set
-- null`, so deleting the uploader's profile must not violate this constraint
-- while the attachment itself is still present.
alter table public.proposals
  add constraint proposals_attachment_presence_check
    check (
      (
        attachment_storage_path is null
        and attachment_file_name is null
        and attachment_mime_type is null
        and attachment_file_size is null
        and attachment_uploaded_at is null
      )
      or (
        attachment_storage_path is not null
        and attachment_file_name is not null
        and attachment_mime_type is not null
        and attachment_file_size is not null
        and attachment_uploaded_at is not null
      )
    );

create unique index proposals_attachment_storage_path_key
  on public.proposals (attachment_storage_path)
  where attachment_storage_path is not null;

-- ---------------------------------------------------------------------------
-- Column-level grant only.
--
-- No new RLS policy is required: proposals_update_proposal_managers (defined
-- in 20260801000000_phase_6_proposals.sql) already restricts UPDATE to
-- super_admin/admin AND status in ('draft', 'changes_requested') — exactly
-- the immutability rule this feature needs, reused rather than duplicated.
-- This grant follows the existing column-level grant convention for this
-- table; without it the UPDATE is denied even where RLS would allow it.
-- ---------------------------------------------------------------------------

grant update (
  attachment_file_name,
  attachment_storage_path,
  attachment_mime_type,
  attachment_file_size,
  attachment_uploaded_at,
  attachment_uploaded_by
) on public.proposals to authenticated;

-- ---------------------------------------------------------------------------
-- public.send_proposal
--
-- Replaced in place to add attachment metadata to the version snapshot.
-- Body is otherwise byte-identical to the current definition in
-- 20260801010000_fix_send_proposal_version_ambiguity.sql, including the
-- table-qualified proposal_versions.version_number fix documented there.
-- ---------------------------------------------------------------------------

create or replace function public.send_proposal(
  target_proposal_id uuid,
  p_token_hash text,
  p_token_expires_at timestamptz
)
returns table (
  proposal_number text,
  version_number integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_organization_id uuid;
  actor_profile_id uuid;
  actor_role text;
  active_membership_count integer;
  target_proposal public.proposals%rowtype;
  item_count integer;
  assigned_number text;
  next_version integer;
  snapshot_value jsonb;
begin
  if (select auth.uid()) is null then
    raise exception using
      errcode = 'P0001',
      message = 'Authentication is required.';
  end if;

  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using
      errcode = 'P0001',
      message = 'A valid access token hash is required.';
  end if;

  select
    min(membership.organization_id::text)::uuid,
    min(membership.user_id::text)::uuid,
    min(membership.role),
    count(*)::integer
  into
    actor_organization_id,
    actor_profile_id,
    actor_role,
    active_membership_count
  from public.organization_members as membership
  inner join public.profiles as profile
    on profile.id = membership.user_id
  inner join public.organizations as organization
    on organization.id = membership.organization_id
  where profile.auth_user_id = (select auth.uid())
    and membership.status = 'active'
    and organization.status = 'active';

  if active_membership_count <> 1
    or actor_role not in ('super_admin', 'admin')
  then
    raise exception using
      errcode = 'P0001',
      message = 'You do not have permission to send this proposal.';
  end if;

  select proposal.*
  into target_proposal
  from public.proposals as proposal
  where proposal.id = target_proposal_id
    and proposal.organization_id = actor_organization_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'This proposal could not be found.';
  end if;

  if target_proposal.status not in ('draft', 'changes_requested') then
    raise exception using
      errcode = 'P0001',
      message = 'Only draft or changes-requested proposals can be sent.';
  end if;

  if btrim(target_proposal.title) = '' then
    raise exception using
      errcode = 'P0001',
      message = 'A proposal title is required before sending.';
  end if;

  select count(*)::integer
  into item_count
  from public.proposal_items
  where proposal_id = target_proposal_id;

  if item_count = 0 then
    raise exception using
      errcode = 'P0001',
      message = 'At least one line item is required before sending.';
  end if;

  if target_proposal.proposal_number is null then
    assigned_number := private.next_proposal_number(actor_organization_id);
  else
    assigned_number := target_proposal.proposal_number;
  end if;

  select coalesce(max(proposal_versions.version_number), 0) + 1
  into next_version
  from public.proposal_versions as proposal_versions
  where proposal_versions.proposal_id = target_proposal_id;

  snapshot_value := pg_catalog.jsonb_build_object(
    'proposal_number', assigned_number,
    'title', target_proposal.title,
    'summary', target_proposal.summary,
    'scope', target_proposal.scope,
    'deliverables', target_proposal.deliverables,
    'timeline_text', target_proposal.timeline_text,
    'payment_terms_text', target_proposal.payment_terms_text,
    'terms_text', target_proposal.terms_text,
    'currency', target_proposal.currency,
    'subtotal', target_proposal.subtotal,
    'discount', target_proposal.discount,
    'tax', target_proposal.tax,
    'total', target_proposal.total,
    'valid_until', target_proposal.valid_until,
    'attachment_file_name', target_proposal.attachment_file_name,
    'attachment_storage_path', target_proposal.attachment_storage_path,
    'attachment_mime_type', target_proposal.attachment_mime_type,
    'attachment_file_size', target_proposal.attachment_file_size,
    'items', (
      select coalesce(pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'name', item.name,
          'description', item.description,
          'quantity', item.quantity,
          'unit_price', item.unit_price,
          'sort_order', item.sort_order
        )
        order by item.sort_order
      ), '[]'::jsonb)
      from public.proposal_items as item
      where item.proposal_id = target_proposal_id
    )
  );

  insert into public.proposal_versions (
    proposal_id,
    version_number,
    snapshot,
    created_by
  )
  values (target_proposal_id, next_version, snapshot_value, actor_profile_id);

  update public.proposal_access_tokens
  set revoked_at = pg_catalog.now()
  where proposal_id = target_proposal_id
    and revoked_at is null;

  insert into public.proposal_access_tokens (
    proposal_id,
    token_hash,
    expires_at
  )
  values (target_proposal_id, p_token_hash, p_token_expires_at);

  update public.proposals
  set
    proposal_number = assigned_number,
    status = 'sent',
    sent_at = pg_catalog.now()
  where id = target_proposal_id;

  return query select assigned_number, next_version;
end;
$function$;

revoke all on function public.send_proposal(uuid, text, timestamptz)
  from public, anon, authenticated;

grant execute on function public.send_proposal(uuid, text, timestamptz)
  to authenticated;

-- ---------------------------------------------------------------------------
-- public.view_proposal_by_token
--
-- Replaced in place to expose attachment *presence hints* only — the file
-- name and size, so the page can render a download control. The storage path
-- is deliberately NOT returned here: it is fetched only when the client
-- actually clicks download, via get_proposal_attachment_by_token below, so a
-- raw storage path never sits in the page's initial data payload.
--
-- Adding keys is additive to this function's jsonb contract; the client-side
-- zod schema ignores unknown keys and is extended separately to read them.
-- Body is otherwise identical to 20260801000000_phase_6_proposals.sql.
-- ---------------------------------------------------------------------------

create or replace function public.view_proposal_by_token(
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_token public.proposal_access_tokens%rowtype;
  target_proposal public.proposals%rowtype;
  result_value jsonb;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return null;
  end if;

  select token.*
  into target_token
  from public.proposal_access_tokens as token
  where token.token_hash = p_token_hash
    and token.revoked_at is null
    and token.expires_at > pg_catalog.now();

  if not found then
    return null;
  end if;

  select proposal.*
  into target_proposal
  from public.proposals as proposal
  where proposal.id = target_token.proposal_id
  for update;

  if not found then
    return null;
  end if;

  if target_proposal.status = 'sent' then
    update public.proposals
    set status = 'viewed', viewed_at = pg_catalog.now()
    where id = target_proposal.id;

    target_proposal.status := 'viewed';
    target_proposal.viewed_at := pg_catalog.now();
  end if;

  result_value := pg_catalog.jsonb_build_object(
    'id', target_proposal.id,
    'proposal_number', target_proposal.proposal_number,
    'title', target_proposal.title,
    'summary', target_proposal.summary,
    'scope', target_proposal.scope,
    'deliverables', target_proposal.deliverables,
    'timeline_text', target_proposal.timeline_text,
    'payment_terms_text', target_proposal.payment_terms_text,
    'terms_text', target_proposal.terms_text,
    'currency', target_proposal.currency,
    'subtotal', target_proposal.subtotal,
    'discount', target_proposal.discount,
    'tax', target_proposal.tax,
    'total', target_proposal.total,
    'valid_until', target_proposal.valid_until,
    'status', target_proposal.status,
    'sent_at', target_proposal.sent_at,
    'attachment_file_name', target_proposal.attachment_file_name,
    'attachment_file_size', target_proposal.attachment_file_size,
    'items', (
      select coalesce(pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'name', item.name,
          'description', item.description,
          'quantity', item.quantity,
          'unit_price', item.unit_price,
          'sort_order', item.sort_order
        )
        order by item.sort_order
      ), '[]'::jsonb)
      from public.proposal_items as item
      where item.proposal_id = target_proposal.id
    )
  );

  return result_value;
end;
$function$;

revoke all on function public.view_proposal_by_token(text)
  from public, anon, authenticated;

grant execute on function public.view_proposal_by_token(text)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- public.get_proposal_attachment_by_token
--
-- The only path by which an anonymous client-side caller can learn a
-- proposal attachment's storage path. Applies exactly the same token
-- validation as view_proposal_by_token: hex-format check, not revoked, not
-- expired.
--
-- Unlike view_proposal_by_token this is strictly read-only — no `for update`
-- and no sent -> viewed status flip, because that already happened when the
-- page itself was loaded. Returns null (never an error that would
-- distinguish cases) for an invalid, expired, or revoked token, for a
-- missing proposal, and for a proposal with no attachment.
-- ---------------------------------------------------------------------------

create or replace function public.get_proposal_attachment_by_token(
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_token public.proposal_access_tokens%rowtype;
  target_proposal public.proposals%rowtype;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return null;
  end if;

  select token.*
  into target_token
  from public.proposal_access_tokens as token
  where token.token_hash = p_token_hash
    and token.revoked_at is null
    and token.expires_at > pg_catalog.now();

  if not found then
    return null;
  end if;

  select proposal.*
  into target_proposal
  from public.proposals as proposal
  where proposal.id = target_token.proposal_id;

  if not found or target_proposal.attachment_storage_path is null then
    return null;
  end if;

  return pg_catalog.jsonb_build_object(
    'storage_path', target_proposal.attachment_storage_path,
    'file_name', target_proposal.attachment_file_name
  );
end;
$function$;

revoke all on function public.get_proposal_attachment_by_token(text)
  from public, anon, authenticated;

grant execute on function public.get_proposal_attachment_by_token(text)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Private storage bucket.
--
-- Deliberately NO storage.objects policy is created for this bucket.
--
-- Every read and write of these objects is performed by the service-role
-- client (src/lib/supabase/admin.ts), which bypasses RLS, and is reached only
-- from a Server Action that has already independently authorized the caller:
-- organization membership + role + editable status for the admin legs, or a
-- validated access token via get_proposal_attachment_by_token for the client
-- leg.
--
-- A storage policy could not correctly express the client-leg rule anyway:
-- that request arrives as the shared `anon` role with no auth.uid(), and RLS
-- can never see the caller's raw bearer token (only its SHA-256 hash, and
-- only inside a security-definer function's scope). Any anon-reachable
-- policy could therefore check no more than "some unrevoked token exists for
-- this proposal" — strictly weaker than, and redundant with, the check the
-- RPC above already performs correctly.
--
-- Keeping this bucket free of path-derived policies also avoids the class of
-- bug that required six follow-up migrations on project-files-private
-- (20260803020000 through 20260803060000).
-- ---------------------------------------------------------------------------

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'proposal-attachments-private',
  'proposal-attachments-private',
  false,
  26214400,
  array['application/pdf']::text[]
)
on conflict (id) do nothing;
