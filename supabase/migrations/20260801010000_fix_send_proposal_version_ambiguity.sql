-- Fix: public.send_proposal always failed with Postgres error 42702
-- ("column reference "version_number" is ambiguous").
--
-- send_proposal is declared `returns table (proposal_number text,
-- version_number integer)`, which implicitly creates function-scoped
-- PL/pgSQL variables named `proposal_number` and `version_number` for the
-- entire function body. The bare `version_number` in the next-version
-- lookup below was ambiguous between that implicit OUT variable and
-- `proposal_versions.version_number`, so every send attempt raised an
-- exception and rolled back before assigning a number, creating a version,
-- issuing an access token, or flipping status to 'sent' — the outbound
-- Resend call was never reached. The app correctly treated this as an
-- unrecognized database error and surfaced only the generic "We could not
-- send this proposal" message (SAFE_RPC_MESSAGES intentionally excludes raw
-- Postgres errors), which is why the true cause was invisible from the UI.
--
-- This migration does not edit the already-applied
-- 20260801000000_phase_6_proposals.sql; it replaces the function in place
-- (create or replace preserves the existing revoke/grant on
-- public.send_proposal(uuid, text, timestamptz), but they are reissued
-- below anyway for clarity and to be safe against any manual grant drift).

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

  -- Fixed: qualify version_number with its table so it can never be
  -- resolved against this function's own `version_number` OUT variable.
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
