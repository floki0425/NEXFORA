-- Phase 6: proposal system.
-- Adds proposals, proposal line items, immutable version snapshots, and a
-- narrowly scoped secure client-access mechanism. Client Portal
-- authentication, invoices, payments, and support tickets remain out of
-- scope. Do not modify already-applied migrations; this file only adds new
-- objects and extends the existing lead_activities activity_type list.

-- ---------------------------------------------------------------------------
-- Extend the existing lead_activities activity_type list.
-- 'proposal_created', 'proposal_sent', 'proposal_viewed', and
-- 'proposal_accepted' already exist from Phase 3. This adds the two values
-- Phase 6 requires for the changes-requested and decline workflows.
-- ---------------------------------------------------------------------------

alter table public.lead_activities
  drop constraint lead_activities_type_check;

alter table public.lead_activities
  add constraint lead_activities_type_check
  check (
    activity_type in (
      'inquiry_submitted',
      'lead_created',
      'status_changed',
      'assigned',
      'note_added',
      'call_scheduled',
      'email_sent',
      'proposal_created',
      'proposal_sent',
      'proposal_viewed',
      'proposal_accepted',
      'proposal_changes_requested',
      'proposal_declined',
      'lead_won',
      'lead_lost',
      'client_created',
      'project_created'
    )
  );

-- ---------------------------------------------------------------------------
-- proposals
-- ---------------------------------------------------------------------------

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  lead_id uuid,
  client_id uuid,
  proposal_number text,
  title text not null,
  summary text,
  scope text,
  deliverables jsonb not null default '[]'::jsonb,
  timeline_text text,
  -- Additional field beyond DATABASE.md's suggested schema: PRODUCT.md and
  -- this phase's own admin-form requirements list "Payment Terms" as a
  -- distinct section from general "Terms", but the documented SQL schema
  -- only defines terms_text. A dedicated column is genuinely required so
  -- payment terms are not conflated with general terms and conditions.
  payment_terms_text text,
  terms_text text,
  status text not null default 'draft',
  currency text not null default 'PHP',
  subtotal numeric(14, 2) not null default 0,
  discount numeric(14, 2) not null default 0,
  tax numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  valid_until date,
  -- Additional field: stores the client's most recent requested-changes
  -- message directly on the proposal (mirroring how leads.lost_reason is
  -- stored directly on the leads row rather than only in activity), so
  -- admins can see the current request without opening activity history.
  requested_changes_message text,
  sent_at timestamptz,
  viewed_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint proposals_organization_id_fkey
    foreign key (organization_id)
    references public.organizations (id)
    on delete cascade,
  constraint proposals_lead_id_fkey
    foreign key (lead_id)
    references public.leads (id)
    on delete set null,
  constraint proposals_client_id_fkey
    foreign key (client_id)
    references public.clients (id)
    on delete set null,
  constraint proposals_created_by_fkey
    foreign key (created_by)
    references public.profiles (id)
    on delete set null,
  constraint proposals_organization_number_key
    unique (organization_id, proposal_number),
  constraint proposals_lead_or_client_check
    check (lead_id is not null or client_id is not null),
  constraint proposals_title_not_blank
    check (btrim(title) <> '' and char_length(title) <= 200),
  constraint proposals_summary_length
    check (summary is null or char_length(summary) <= 5000),
  constraint proposals_scope_length
    check (scope is null or char_length(scope) <= 5000),
  constraint proposals_deliverables_array
    check (
      jsonb_typeof(deliverables) = 'array'
      and jsonb_array_length(deliverables) <= 50
    ),
  constraint proposals_timeline_text_length
    check (timeline_text is null or char_length(timeline_text) <= 2000),
  constraint proposals_payment_terms_text_length
    check (
      payment_terms_text is null
      or char_length(payment_terms_text) <= 3000
    ),
  constraint proposals_terms_text_length
    check (terms_text is null or char_length(terms_text) <= 5000),
  constraint proposals_status_check
    check (
      status in (
        'draft',
        'sent',
        'viewed',
        'accepted',
        'changes_requested',
        'declined',
        'expired'
      )
    ),
  constraint proposals_currency_not_blank
    check (btrim(currency) <> ''),
  constraint proposals_subtotal_check
    check (subtotal >= 0),
  constraint proposals_discount_check
    check (discount >= 0),
  constraint proposals_tax_check
    check (tax >= 0),
  constraint proposals_total_check
    check (total >= 0),
  constraint proposals_proposal_number_format
    check (
      proposal_number is null
      or proposal_number ~ '^NXF-PROP-[0-9]{4}-[0-9]{4,}$'
    ),
  constraint proposals_proposal_number_presence_check
    check ((status = 'draft') = (proposal_number is null)),
  constraint proposals_requested_changes_message_check
    check (
      (status <> 'changes_requested' and requested_changes_message is null)
      or (
        status = 'changes_requested'
        and requested_changes_message is not null
        and btrim(requested_changes_message) <> ''
        and char_length(requested_changes_message) <= 3000
      )
    )
);

create index proposals_organization_updated_idx
  on public.proposals (organization_id, updated_at desc);

create index proposals_organization_status_idx
  on public.proposals (organization_id, status);

create index proposals_lead_idx
  on public.proposals (lead_id);

create index proposals_client_idx
  on public.proposals (client_id);

create trigger proposals_set_updated_at
before update on public.proposals
for each row
execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- proposal_items
-- ---------------------------------------------------------------------------

create table public.proposal_items (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null,
  name text not null,
  description text,
  quantity numeric(10, 2) not null default 1,
  unit_price numeric(14, 2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),

  constraint proposal_items_proposal_id_fkey
    foreign key (proposal_id)
    references public.proposals (id)
    on delete cascade,
  constraint proposal_items_name_not_blank
    check (btrim(name) <> '' and char_length(name) <= 200),
  constraint proposal_items_description_length
    check (description is null or char_length(description) <= 2000),
  constraint proposal_items_quantity_check
    check (quantity > 0),
  constraint proposal_items_unit_price_check
    check (unit_price >= 0),
  constraint proposal_items_sort_order_check
    check (sort_order >= 0)
);

create index proposal_items_proposal_sort_idx
  on public.proposal_items (proposal_id, sort_order);

-- ---------------------------------------------------------------------------
-- proposal_versions
-- ---------------------------------------------------------------------------

create table public.proposal_versions (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null,
  version_number integer not null,
  snapshot jsonb not null,
  created_by uuid,
  created_at timestamptz not null default now(),

  constraint proposal_versions_proposal_id_fkey
    foreign key (proposal_id)
    references public.proposals (id)
    on delete cascade,
  constraint proposal_versions_created_by_fkey
    foreign key (created_by)
    references public.profiles (id)
    on delete set null,
  constraint proposal_versions_proposal_version_key
    unique (proposal_id, version_number),
  constraint proposal_versions_version_number_check
    check (version_number > 0),
  constraint proposal_versions_snapshot_object
    check (jsonb_typeof(snapshot) = 'object')
);

create index proposal_versions_proposal_version_idx
  on public.proposal_versions (proposal_id, version_number desc);

-- ---------------------------------------------------------------------------
-- proposal_access_tokens
--
-- Additional table beyond DATABASE.md's suggested schema, genuinely required
-- because Phase 7 client authentication does not exist yet: this is the
-- secure client-access mechanism required by this phase's architecture. Only
-- a salted SHA-256 hash of the access token is ever stored (computed in the
-- application layer); the raw token exists only in the emailed link and is
-- never persisted. Mirrors the token_hash/expires_at pattern DATABASE.md
-- already documents for the (deferred) client_invitations table.
-- ---------------------------------------------------------------------------

create table public.proposal_access_tokens (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null,
  token_hash text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),

  constraint proposal_access_tokens_proposal_id_fkey
    foreign key (proposal_id)
    references public.proposals (id)
    on delete cascade,
  constraint proposal_access_tokens_token_hash_key
    unique (token_hash),
  constraint proposal_access_tokens_token_hash_format
    check (token_hash ~ '^[0-9a-f]{64}$')
);

create index proposal_access_tokens_proposal_idx
  on public.proposal_access_tokens (proposal_id);

-- ---------------------------------------------------------------------------
-- private.proposal_number_counters
--
-- Additional table genuinely required for race-safe official proposal
-- numbering (Section 3 of this phase's requirements). One row per
-- organization per calendar year; next_proposal_number() below performs an
-- atomic upsert-and-increment so concurrent sends can never receive the same
-- number.
-- ---------------------------------------------------------------------------

create table private.proposal_number_counters (
  organization_id uuid not null,
  number_year integer not null,
  last_value integer not null default 1,

  constraint proposal_number_counters_pkey
    primary key (organization_id, number_year),
  constraint proposal_number_counters_organization_id_fkey
    foreign key (organization_id)
    references public.organizations (id)
    on delete cascade,
  constraint proposal_number_counters_last_value_check
    check (last_value > 0)
);

revoke all on table private.proposal_number_counters
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Totals: server-computed, money-safe (numeric), never trusted from browser.
-- ---------------------------------------------------------------------------

create or replace function private.recalculate_proposal_subtotal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  affected_proposal_id uuid := coalesce(new.proposal_id, old.proposal_id);
begin
  update public.proposals
  set subtotal = coalesce((
    select sum(item.quantity * item.unit_price)
    from public.proposal_items as item
    where item.proposal_id = affected_proposal_id
  ), 0)
  where id = affected_proposal_id;

  return coalesce(new, old);
end;
$function$;

revoke all on function private.recalculate_proposal_subtotal()
  from public, anon, authenticated;

create trigger proposal_items_recalculate_subtotal
after insert or update or delete on public.proposal_items
for each row
execute function private.recalculate_proposal_subtotal();

create or replace function private.derive_proposal_total()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  new.total := new.subtotal - new.discount + new.tax;
  return new;
end;
$function$;

create trigger proposals_derive_total
before insert or update on public.proposals
for each row
execute function private.derive_proposal_total();

-- ---------------------------------------------------------------------------
-- Activity logging: mirrors the existing leads trigger pattern, writing into
-- the already-existing lead_activities timeline (proposals in this phase
-- always originate from a qualified lead).
-- ---------------------------------------------------------------------------

create or replace function private.record_proposal_created_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_profile_id uuid := private.current_profile_id();
begin
  if new.lead_id is not null then
    insert into public.lead_activities (
      organization_id,
      lead_id,
      activity_type,
      title,
      created_by
    )
    values (
      new.organization_id,
      new.lead_id,
      'proposal_created',
      'Proposal created',
      actor_profile_id
    );
  end if;

  return new;
end;
$function$;

revoke all on function private.record_proposal_created_activity()
  from public, anon, authenticated;

create trigger proposals_record_created_activity
after insert on public.proposals
for each row
execute function private.record_proposal_created_activity();

create or replace function private.record_proposal_status_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_profile_id uuid := private.current_profile_id();
  activity_type_value text;
  activity_title text;
begin
  if old.status is distinct from new.status and new.lead_id is not null then
    activity_type_value := case new.status
      when 'sent' then 'proposal_sent'
      when 'viewed' then 'proposal_viewed'
      when 'accepted' then 'proposal_accepted'
      when 'changes_requested' then 'proposal_changes_requested'
      when 'declined' then 'proposal_declined'
      else null
    end;

    if activity_type_value is not null then
      activity_title := case new.status
        when 'sent' then 'Proposal sent'
        when 'viewed' then 'Proposal viewed'
        when 'accepted' then 'Proposal accepted'
        when 'changes_requested' then 'Client requested changes'
        when 'declined' then 'Proposal declined'
        else 'Proposal status changed'
      end;

      insert into public.lead_activities (
        organization_id,
        lead_id,
        activity_type,
        title,
        description,
        created_by
      )
      values (
        new.organization_id,
        new.lead_id,
        activity_type_value,
        activity_title,
        case
          when new.status = 'changes_requested'
            then new.requested_changes_message
          else null
        end,
        actor_profile_id
      );
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function private.record_proposal_status_activity()
  from public, anon, authenticated;

create trigger proposals_record_status_activity
after update on public.proposals
for each row
execute function private.record_proposal_status_activity();

-- ---------------------------------------------------------------------------
-- Official proposal number generation: race-safe atomic upsert-and-increment
-- counter per (organization, year). Internal helper only; never granted
-- directly to any role.
-- ---------------------------------------------------------------------------

create or replace function private.next_proposal_number(
  target_organization_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_year integer := extract(year from pg_catalog.now())::integer;
  assigned_value integer;
begin
  insert into private.proposal_number_counters (
    organization_id,
    number_year,
    last_value
  )
  values (target_organization_id, current_year, 1)
  on conflict (organization_id, number_year)
  do update set last_value = private.proposal_number_counters.last_value + 1
  returning last_value into assigned_value;

  return 'NXF-PROP-' || current_year || '-'
    || lpad(assigned_value::text, 4, '0');
end;
$function$;

revoke all on function private.next_proposal_number(uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- public.send_proposal: the atomic send transaction.
--
-- Assigns the official number only on first send (reuses the existing number
-- on a changes-requested resend), creates an immutable version snapshot,
-- revokes any previously issued access tokens, issues a new one, and only
-- then flips status to 'sent'. All in one PL/pgSQL call, so a raised
-- exception rolls back every write together.
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

  select coalesce(max(version_number), 0) + 1
  into next_version
  from public.proposal_versions
  where proposal_id = target_proposal_id;

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

-- ---------------------------------------------------------------------------
-- public.reissue_proposal_access_token: resend-email-only path.
--
-- Used when the DB-side send already succeeded but the outbound email
-- failed, or when an admin explicitly asks to resend the link. Revokes the
-- old token and issues a new one without touching versions, numbers, or
-- status, so a retried email can never create a duplicate version snapshot.
-- ---------------------------------------------------------------------------

create or replace function public.reissue_proposal_access_token(
  target_proposal_id uuid,
  p_token_hash text,
  p_token_expires_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_organization_id uuid;
  actor_role text;
  active_membership_count integer;
  target_exists boolean;
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
    min(membership.role),
    count(*)::integer
  into actor_organization_id, actor_role, active_membership_count
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
      message = 'You do not have permission to resend this proposal.';
  end if;

  select exists (
    select 1
    from public.proposals
    where id = target_proposal_id
      and organization_id = actor_organization_id
      and status in ('sent', 'viewed', 'changes_requested')
  )
  into target_exists;

  if not target_exists then
    raise exception using
      errcode = 'P0001',
      message = 'This proposal cannot be resent right now.';
  end if;

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
end;
$function$;

revoke all on function public.reissue_proposal_access_token(
  uuid, text, timestamptz
) from public, anon, authenticated;

grant execute on function public.reissue_proposal_access_token(
  uuid, text, timestamptz
) to authenticated;

-- ---------------------------------------------------------------------------
-- Secure client access: token-hash lookup functions callable by anon.
-- Never accept a raw proposal id, proposal number, or session as the sole
-- authorization; every call requires a valid, unexpired, unrevoked token
-- hash. Invalid/expired/revoked tokens return null uniformly (no
-- distinguishing detail), reducing token-enumeration value beyond what the
-- 256-bit token entropy already provides.
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

create or replace function public.accept_proposal_by_token(
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
  where proposal.id = target_token.proposal_id
  for update;

  if not found then
    return null;
  end if;

  if target_proposal.status = 'accepted' then
    return pg_catalog.jsonb_build_object(
      'status', 'accepted', 'already_accepted', true
    );
  end if;

  if target_proposal.status not in ('sent', 'viewed') then
    raise exception using
      errcode = 'P0001',
      message = 'This proposal can no longer be accepted.';
  end if;

  if target_proposal.valid_until is not null
    and target_proposal.valid_until < current_date
  then
    raise exception using
      errcode = 'P0001',
      message = 'This proposal has expired and can no longer be accepted.';
  end if;

  update public.proposals
  set status = 'accepted', accepted_at = pg_catalog.now()
  where id = target_proposal.id;

  return pg_catalog.jsonb_build_object(
    'status', 'accepted', 'already_accepted', false
  );
end;
$function$;

revoke all on function public.accept_proposal_by_token(text)
  from public, anon, authenticated;

grant execute on function public.accept_proposal_by_token(text)
  to anon, authenticated;

create or replace function public.decline_proposal_by_token(
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
  where proposal.id = target_token.proposal_id
  for update;

  if not found then
    return null;
  end if;

  if target_proposal.status = 'declined' then
    return pg_catalog.jsonb_build_object(
      'status', 'declined', 'already_declined', true
    );
  end if;

  if target_proposal.status not in ('sent', 'viewed', 'changes_requested')
  then
    raise exception using
      errcode = 'P0001',
      message = 'This proposal can no longer be declined.';
  end if;

  update public.proposals
  set status = 'declined', declined_at = pg_catalog.now()
  where id = target_proposal.id;

  return pg_catalog.jsonb_build_object(
    'status', 'declined', 'already_declined', false
  );
end;
$function$;

revoke all on function public.decline_proposal_by_token(text)
  from public, anon, authenticated;

grant execute on function public.decline_proposal_by_token(text)
  to anon, authenticated;

create or replace function public.request_proposal_changes_by_token(
  p_token_hash text,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_token public.proposal_access_tokens%rowtype;
  target_proposal public.proposals%rowtype;
  normalized_message text := btrim(coalesce(p_message, ''));
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return null;
  end if;

  if normalized_message = '' or char_length(normalized_message) > 3000 then
    raise exception using
      errcode = 'P0001',
      message = 'A requested-changes message is required.';
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

  if target_proposal.status not in ('sent', 'viewed') then
    raise exception using
      errcode = 'P0001',
      message = 'Changes can only be requested on a sent proposal.';
  end if;

  update public.proposals
  set status = 'changes_requested', requested_changes_message = normalized_message
  where id = target_proposal.id;

  return pg_catalog.jsonb_build_object('status', 'changes_requested');
end;
$function$;

revoke all on function public.request_proposal_changes_by_token(text, text)
  from public, anon, authenticated;

grant execute on function public.request_proposal_changes_by_token(text, text)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.proposals enable row level security;
alter table public.proposal_items enable row level security;
alter table public.proposal_versions enable row level security;
alter table public.proposal_access_tokens enable row level security;

create policy proposals_select_internal_members
on public.proposals
for select
to authenticated
using (
  (select private.is_internal_member(proposals.organization_id))
);

create policy proposals_insert_proposal_managers
on public.proposals
for insert
to authenticated
with check (
  (
    select private.has_internal_role(
      proposals.organization_id,
      array['super_admin', 'admin']
    )
  )
  and created_by = (select private.current_profile_id())
  and (
    proposals.lead_id is null
    or exists (
      select 1
      from public.leads as lead
      where lead.id = proposals.lead_id
        and lead.organization_id = proposals.organization_id
    )
  )
  and (
    proposals.client_id is null
    or exists (
      select 1
      from public.clients as client
      where client.id = proposals.client_id
        and client.organization_id = proposals.organization_id
    )
  )
);

create policy proposals_update_proposal_managers
on public.proposals
for update
to authenticated
using (
  (
    select private.has_internal_role(
      proposals.organization_id,
      array['super_admin', 'admin']
    )
  )
  and proposals.status in ('draft', 'changes_requested')
)
with check (
  (
    select private.has_internal_role(
      proposals.organization_id,
      array['super_admin', 'admin']
    )
  )
);

create policy proposal_items_select_internal_members
on public.proposal_items
for select
to authenticated
using (
  exists (
    select 1
    from public.proposals as proposal
    where proposal.id = proposal_items.proposal_id
      and (select private.is_internal_member(proposal.organization_id))
  )
);

create policy proposal_items_insert_proposal_managers
on public.proposal_items
for insert
to authenticated
with check (
  exists (
    select 1
    from public.proposals as proposal
    where proposal.id = proposal_items.proposal_id
      and proposal.status in ('draft', 'changes_requested')
      and (
        select private.has_internal_role(
          proposal.organization_id,
          array['super_admin', 'admin']
        )
      )
  )
);

create policy proposal_items_update_proposal_managers
on public.proposal_items
for update
to authenticated
using (
  exists (
    select 1
    from public.proposals as proposal
    where proposal.id = proposal_items.proposal_id
      and proposal.status in ('draft', 'changes_requested')
      and (
        select private.has_internal_role(
          proposal.organization_id,
          array['super_admin', 'admin']
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.proposals as proposal
    where proposal.id = proposal_items.proposal_id
      and (
        select private.has_internal_role(
          proposal.organization_id,
          array['super_admin', 'admin']
        )
      )
  )
);

create policy proposal_items_delete_proposal_managers
on public.proposal_items
for delete
to authenticated
using (
  exists (
    select 1
    from public.proposals as proposal
    where proposal.id = proposal_items.proposal_id
      and proposal.status in ('draft', 'changes_requested')
      and (
        select private.has_internal_role(
          proposal.organization_id,
          array['super_admin', 'admin']
        )
      )
  )
);

create policy proposal_versions_select_internal_members
on public.proposal_versions
for select
to authenticated
using (
  exists (
    select 1
    from public.proposals as proposal
    where proposal.id = proposal_versions.proposal_id
      and (select private.is_internal_member(proposal.organization_id))
  )
);

-- proposal_access_tokens has no policies: it is only ever read or written by
-- the SECURITY DEFINER functions above, which run as the table owner and
-- bypass RLS. No authenticated or anon policy exists, and (see grants below)
-- no table privileges are granted to either role, so RLS being enabled here
-- is a defense-in-depth backstop rather than the primary control.

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all privileges
  on table
    public.proposals,
    public.proposal_items,
    public.proposal_versions,
    public.proposal_access_tokens
  from public, anon, authenticated;

grant select on table public.proposals to authenticated;
grant insert (
  organization_id,
  lead_id,
  client_id,
  title,
  summary,
  scope,
  deliverables,
  timeline_text,
  payment_terms_text,
  terms_text,
  discount,
  tax,
  valid_until,
  created_by
) on public.proposals to authenticated;
grant update (
  title,
  summary,
  scope,
  deliverables,
  timeline_text,
  payment_terms_text,
  terms_text,
  discount,
  tax,
  valid_until
) on public.proposals to authenticated;

grant select on table public.proposal_items to authenticated;
grant insert (
  proposal_id,
  name,
  description,
  quantity,
  unit_price,
  sort_order
) on public.proposal_items to authenticated;
grant update (
  name,
  description,
  quantity,
  unit_price,
  sort_order
) on public.proposal_items to authenticated;
grant delete on public.proposal_items to authenticated;

grant select on table public.proposal_versions to authenticated;

grant all privileges
  on table
    public.proposals,
    public.proposal_items,
    public.proposal_versions,
    public.proposal_access_tokens
  to service_role;
