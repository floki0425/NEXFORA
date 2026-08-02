-- Phase 9: invoices and payments (manual + PayMongo).
-- Adds invoices, invoice_items, payments, and a race-safe official invoice
-- numbering counter. Support tickets, maintenance subscriptions, AI,
-- accounting integrations, automatic tax filing, and payroll remain out of
-- scope. Does not modify any already-applied migration.

-- ---------------------------------------------------------------------------
-- public.invoices
-- ---------------------------------------------------------------------------

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_id uuid not null,
  project_id uuid,
  invoice_number text,
  status text not null default 'draft',
  currency text not null default 'PHP',
  subtotal numeric(14, 2) not null default 0,
  discount numeric(14, 2) not null default 0,
  tax numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  -- amount_paid is trigger-maintained from payments (see
  -- private.recalculate_invoice_amount_paid below) — never directly written
  -- by the application. balance_due is a generated column so it can never
  -- drift from total/amount_paid: it is recomputed by Postgres itself on
  -- every read, not cached by application or trigger logic.
  amount_paid numeric(14, 2) not null default 0,
  balance_due numeric(14, 2) generated always as (total - amount_paid) stored,
  issue_date date,
  due_date date,
  sent_at timestamptz,
  -- Additional field beyond DATABASE.md's suggested schema: USER_FLOWS.md's
  -- portal invoice view and this phase's "idempotent viewed marking"
  -- requirement need a place to record the client's first open, mirroring
  -- proposals.viewed_at exactly. Unlike proposals, this never changes
  -- `status` — invoices has no distinct "viewed" status value.
  viewed_at timestamptz,
  paid_at timestamptz,
  voided_at timestamptz,
  -- Internal-only admin notes. Never exposed through get_client_invoices /
  -- get_client_invoice_detail below.
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint invoices_organization_id_fkey
    foreign key (organization_id)
    references public.organizations (id)
    on delete cascade,
  -- Matches DATABASE.md's explicit "invoices -> clients: on delete restrict"
  -- example: a client with billing history can never be deleted outright.
  constraint invoices_client_id_fkey
    foreign key (client_id)
    references public.clients (id)
    on delete restrict,
  constraint invoices_created_by_fkey
    foreign key (created_by)
    references public.profiles (id)
    on delete set null,
  -- A linked project must genuinely belong to the same organization and
  -- client as the invoice itself. Reuses the composite uniqueness Phase 8
  -- added on projects; project_id is nullable, and a composite foreign key
  -- with any null member is not enforced by Postgres, so this is only
  -- checked once a project is actually linked.
  constraint invoices_project_org_client_fkey
    foreign key (project_id, organization_id, client_id)
    references public.projects (id, organization_id, client_id),
  -- Lets payments reference (invoice_id, organization_id, client_id)
  -- together and have Postgres guarantee they genuinely describe one
  -- consistent invoice row, the same technique Phase 8 used for
  -- project_files/revisions against projects.
  constraint invoices_id_organization_id_client_id_key
    unique (id, organization_id, client_id),
  constraint invoices_organization_number_key
    unique (organization_id, invoice_number),
  constraint invoices_status_check
    check (
      status in ('draft', 'sent', 'partial', 'paid', 'overdue', 'void')
    ),
  constraint invoices_currency_not_blank
    check (btrim(currency) <> ''),
  constraint invoices_subtotal_check
    check (subtotal >= 0),
  constraint invoices_discount_check
    check (discount >= 0),
  constraint invoices_tax_check
    check (tax >= 0),
  constraint invoices_total_check
    check (total >= 0),
  constraint invoices_amount_paid_check
    check (amount_paid >= 0),
  constraint invoices_invoice_number_format
    check (
      invoice_number is null
      or invoice_number ~ '^NXF-INV-[0-9]{4}-[0-9]{4,}$'
    ),
  constraint invoices_invoice_number_presence_check
    check ((status = 'draft') = (invoice_number is null)),
  constraint invoices_due_date_presence_check
    check (status = 'draft' or due_date is not null),
  constraint invoices_notes_length
    check (notes is null or char_length(notes) <= 5000)
);

create index invoices_organization_updated_idx
  on public.invoices (organization_id, updated_at desc);

create index invoices_organization_status_idx
  on public.invoices (organization_id, status);

create index invoices_client_idx
  on public.invoices (client_id);

create index invoices_project_idx
  on public.invoices (project_id);

create index invoices_organization_due_date_idx
  on public.invoices (organization_id, due_date)
  where status in ('sent', 'partial');

create trigger invoices_set_updated_at
before update on public.invoices
for each row
execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- public.invoice_items
--
-- A single `description` label field (not proposal_items' separate
-- name/description pair) and a stored, generated `line_total` column: both
-- deliberately match this phase's own task specification's exact field list
-- rather than DATABASE.md's suggested name+description split. line_total is
-- `generated always as` rather than trigger-maintained so it can never drift
-- from quantity * unit_price.
-- ---------------------------------------------------------------------------

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null,
  description text not null,
  quantity numeric(10, 2) not null default 1,
  unit_price numeric(14, 2) not null default 0,
  line_total numeric(14, 2) generated always as (quantity * unit_price) stored,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),

  constraint invoice_items_invoice_id_fkey
    foreign key (invoice_id)
    references public.invoices (id)
    on delete cascade,
  constraint invoice_items_description_not_blank
    check (btrim(description) <> '' and char_length(description) <= 2000),
  constraint invoice_items_quantity_check
    check (quantity > 0),
  constraint invoice_items_unit_price_check
    check (unit_price >= 0),
  constraint invoice_items_sort_order_check
    check (sort_order >= 0)
);

create index invoice_items_invoice_sort_idx
  on public.invoice_items (invoice_id, sort_order);

-- ---------------------------------------------------------------------------
-- public.payments
--
-- organization_id/client_id are denormalized from the parent invoice (never
-- accepted as parameters from the application — every write path re-derives
-- them server-side) purely so RLS/read policies can filter directly on this
-- table without an extra join, mirroring project_files' identical
-- organization_id/client_id denormalization from projects in Phase 8.
--
-- Additional fields beyond DATABASE.md's suggested schema, each genuinely
-- required by this phase's own requirements:
--   - idempotency_key: lets a retried "record manual payment" submission
--     (double-click, refresh-and-resubmit) return the original result
--     instead of creating a duplicate payment.
--   - provider_event_id: the PayMongo webhook event id that finalized this
--     row, so a retried webhook delivery is a safe, detectable no-op.
--     DATABASE.md section 86 already anticipates this exact column.
--   - metadata: non-sensitive provider details only (e.g. a checkout URL or
--     PayMongo's own payment-method-type label) — never raw webhook
--     payloads, headers, or secrets.
-- ---------------------------------------------------------------------------

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_id uuid not null,
  invoice_id uuid not null,
  amount numeric(14, 2) not null,
  currency text not null default 'PHP',
  payment_method text,
  provider text not null default 'manual',
  provider_reference text,
  status text not null default 'pending',
  paid_at timestamptz,
  recorded_by uuid,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  idempotency_key text,
  provider_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint payments_invoice_id_fkey
    foreign key (invoice_id)
    references public.invoices (id)
    on delete restrict,
  constraint payments_invoice_org_client_fkey
    foreign key (invoice_id, organization_id, client_id)
    references public.invoices (id, organization_id, client_id),
  constraint payments_recorded_by_fkey
    foreign key (recorded_by)
    references public.profiles (id)
    on delete set null,
  constraint payments_idempotency_key_key
    unique (idempotency_key),
  constraint payments_provider_event_id_key
    unique (provider_event_id),
  constraint payments_amount_check
    check (amount > 0),
  constraint payments_currency_not_blank
    check (btrim(currency) <> ''),
  constraint payments_provider_check
    check (provider in ('manual', 'paymongo')),
  constraint payments_payment_method_check
    check (
      payment_method is null
      or payment_method in ('bank_transfer', 'gcash', 'card', 'cash', 'other')
    ),
  constraint payments_status_check
    check (
      status in
        ('pending', 'processing', 'paid', 'failed', 'refunded', 'cancelled')
    ),
  constraint payments_paid_at_presence_check
    check ((status = 'paid') = (paid_at is not null)),
  constraint payments_notes_length
    check (notes is null or char_length(notes) <= 2000),
  constraint payments_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create index payments_invoice_created_idx
  on public.payments (invoice_id, created_at desc);

create index payments_organization_idx
  on public.payments (organization_id);

create index payments_client_idx
  on public.payments (client_id);

create index payments_organization_status_idx
  on public.payments (organization_id, status);

-- At most one PayMongo attempt may be in flight per invoice at a time. A
-- failed/cancelled/refunded/paid row falls outside this partial index, so a
-- fresh retry is always possible once the prior attempt resolves.
create unique index payments_invoice_active_paymongo_session_unique
  on public.payments (invoice_id)
  where provider = 'paymongo' and status in ('pending', 'processing');

create trigger payments_set_updated_at
before update on public.payments
for each row
execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- private.invoice_number_counters
--
-- Mirrors private.proposal_number_counters exactly: one row per
-- organization per calendar year, incremented atomically by
-- next_invoice_number() below. Kept independent from proposal numbering —
-- an organization's invoice and proposal sequences never share counters.
-- ---------------------------------------------------------------------------

create table private.invoice_number_counters (
  organization_id uuid not null,
  number_year integer not null,
  last_value integer not null default 1,

  constraint invoice_number_counters_pkey
    primary key (organization_id, number_year),
  constraint invoice_number_counters_organization_id_fkey
    foreign key (organization_id)
    references public.organizations (id)
    on delete cascade,
  constraint invoice_number_counters_last_value_check
    check (last_value > 0)
);

revoke all on table private.invoice_number_counters
  from public, anon, authenticated;

create or replace function private.next_invoice_number(
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
  insert into private.invoice_number_counters (
    organization_id,
    number_year,
    last_value
  )
  values (target_organization_id, current_year, 1)
  on conflict (organization_id, number_year)
  do update set last_value = private.invoice_number_counters.last_value + 1
  returning last_value into assigned_value;

  return 'NXF-INV-' || current_year || '-'
    || lpad(assigned_value::text, 4, '0');
end;
$function$;

revoke all on function private.next_invoice_number(uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Totals and payment-status derivation: entirely server-computed, never
-- trusted from the browser. Mirrors proposals' subtotal-from-items /
-- derive-total trigger pair, extended one step further to also derive
-- amount_paid from payments and, from that, the invoice's own payment
-- status.
-- ---------------------------------------------------------------------------

create or replace function private.recalculate_invoice_subtotal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  affected_invoice_id uuid := coalesce(new.invoice_id, old.invoice_id);
begin
  update public.invoices
  set subtotal = coalesce((
    select sum(item.line_total)
    from public.invoice_items as item
    where item.invoice_id = affected_invoice_id
  ), 0)
  where id = affected_invoice_id;

  return coalesce(new, old);
end;
$function$;

revoke all on function private.recalculate_invoice_subtotal()
  from public, anon, authenticated;

create trigger invoice_items_recalculate_subtotal
after insert or update or delete on public.invoice_items
for each row
execute function private.recalculate_invoice_subtotal();

create or replace function private.derive_invoice_total()
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

create trigger invoices_derive_total
before insert or update on public.invoices
for each row
execute function private.derive_invoice_total();

create or replace function private.recalculate_invoice_amount_paid()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  affected_invoice_id uuid := coalesce(new.invoice_id, old.invoice_id);
begin
  update public.invoices
  set amount_paid = coalesce((
    select sum(payment.amount)
    from public.payments as payment
    where payment.invoice_id = affected_invoice_id
      and payment.status = 'paid'
  ), 0)
  where id = affected_invoice_id;

  return coalesce(new, old);
end;
$function$;

revoke all on function private.recalculate_invoice_amount_paid()
  from public, anon, authenticated;

create trigger payments_recalculate_invoice_amount_paid
after insert or update or delete on public.payments
for each row
execute function private.recalculate_invoice_amount_paid();

-- Fires only as a consequence of the trigger above (or any other write that
-- touches amount_paid). 'paid' is treated as a stable terminal status here —
-- a later 'refunded' payment does not automatically reopen a paid invoice;
-- refund handling is a documented, deferred Phase 10+ concern (see the
-- payments_status_check value list, kept for schema completeness).
create or replace function private.derive_invoice_payment_status()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if new.status in ('sent', 'partial', 'overdue') then
    if new.total - new.amount_paid <= 0 then
      new.status := 'paid';
      new.paid_at := coalesce(new.paid_at, pg_catalog.now());
    elsif new.amount_paid > 0 then
      new.status := 'partial';
    end if;
  end if;

  return new;
end;
$function$;

create trigger invoices_derive_payment_status
before update of amount_paid on public.invoices
for each row
execute function private.derive_invoice_payment_status();

-- ---------------------------------------------------------------------------
-- private.effective_invoice_status: the single place "is this actually
-- overdue right now" is computed, used by the client-facing read functions
-- below so a portal user always sees an accurate status even if
-- refresh_overdue_invoices() (which persists the same transition for the
-- admin-facing stored column) has not run yet in this session.
-- ---------------------------------------------------------------------------

create or replace function private.effective_invoice_status(
  p_status text,
  p_due_date date,
  p_balance_due numeric
)
returns text
language sql
stable
set search_path = ''
as $function$
  select case
    when p_status in ('sent', 'partial')
      and p_due_date is not null
      and p_due_date < current_date
      and p_balance_due > 0
    then 'overdue'
    else p_status
  end;
$function$;

revoke all on function private.effective_invoice_status(text, date, numeric)
  from public, anon, authenticated;

grant execute on function private.effective_invoice_status(text, date, numeric)
  to authenticated;

-- ---------------------------------------------------------------------------
-- public.refresh_overdue_invoices: called at the top of the admin invoice
-- list/detail queries (see src/features/invoices/queries.ts). A cheap,
-- idempotent, organization-scoped UPDATE — no scheduler/cron required. Never
-- raises for an unauthenticated or non-internal caller; it simply does
-- nothing, since it is a best-effort maintenance step, not a security
-- boundary.
-- ---------------------------------------------------------------------------

create or replace function public.refresh_overdue_invoices()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_organization_id uuid;
  active_membership_count integer;
begin
  if (select auth.uid()) is null then
    return;
  end if;

  select
    min(membership.organization_id::text)::uuid,
    count(*)::integer
  into actor_organization_id, active_membership_count
  from public.organization_members as membership
  inner join public.profiles as profile
    on profile.id = membership.user_id
  inner join public.organizations as organization
    on organization.id = membership.organization_id
  where profile.auth_user_id = (select auth.uid())
    and membership.status = 'active'
    and organization.status = 'active';

  if active_membership_count <> 1 then
    return;
  end if;

  update public.invoices
  set status = 'overdue'
  where organization_id = actor_organization_id
    and status in ('sent', 'partial')
    and due_date is not null
    and due_date < current_date
    and total - amount_paid > 0;
end;
$function$;

revoke all on function public.refresh_overdue_invoices()
  from public, anon, authenticated;

grant execute on function public.refresh_overdue_invoices() to authenticated;

-- ---------------------------------------------------------------------------
-- public.send_invoice: the atomic send transaction. super_admin/admin only.
-- Assigns the official number, sets issue_date to today and requires
-- due_date to already be present and not in the past, then flips status to
-- 'sent'. A raised exception rolls every write back together.
-- ---------------------------------------------------------------------------

create or replace function public.send_invoice(
  target_invoice_id uuid
)
returns table (
  invoice_number text,
  issue_date date
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_organization_id uuid;
  actor_role text;
  active_membership_count integer;
  target_invoice public.invoices%rowtype;
  item_count integer;
  assigned_number text;
  resolved_issue_date date := current_date;
begin
  if (select auth.uid()) is null then
    raise exception using
      errcode = 'P0001',
      message = 'Authentication is required.';
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
      message = 'You do not have permission to send this invoice.';
  end if;

  select invoice.*
  into target_invoice
  from public.invoices as invoice
  where invoice.id = target_invoice_id
    and invoice.organization_id = actor_organization_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'This invoice could not be found.';
  end if;

  if target_invoice.status <> 'draft' then
    raise exception using
      errcode = 'P0001',
      message = 'Only draft invoices can be sent.';
  end if;

  if target_invoice.due_date is null then
    raise exception using
      errcode = 'P0001',
      message = 'A due date is required before sending.';
  end if;

  if target_invoice.due_date < resolved_issue_date then
    raise exception using
      errcode = 'P0001',
      message = 'The due date cannot be in the past.';
  end if;

  select count(*)::integer
  into item_count
  from public.invoice_items
  where invoice_id = target_invoice_id;

  if item_count = 0 then
    raise exception using
      errcode = 'P0001',
      message = 'At least one line item is required before sending.';
  end if;

  if target_invoice.total <= 0 then
    raise exception using
      errcode = 'P0001',
      message = 'The invoice total must be greater than zero before sending.';
  end if;

  assigned_number := private.next_invoice_number(actor_organization_id);

  update public.invoices
  set
    invoice_number = assigned_number,
    status = 'sent',
    issue_date = resolved_issue_date,
    sent_at = pg_catalog.now()
  where id = target_invoice_id;

  return query select assigned_number, resolved_issue_date;
end;
$function$;

revoke all on function public.send_invoice(uuid)
  from public, anon, authenticated;

grant execute on function public.send_invoice(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- public.void_invoice: super_admin/admin only. Allowed from any status
-- except 'paid' (a fully paid invoice is not voidable — see the deferred
-- refund note above) and except an already-'void' invoice (idempotent
-- protection via a clear error rather than a silent no-op, matching how
-- send_invoice/send_proposal reject re-sends of a terminal state).
-- ---------------------------------------------------------------------------

create or replace function public.void_invoice(
  target_invoice_id uuid
)
returns table (status text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_organization_id uuid;
  actor_role text;
  active_membership_count integer;
  target_invoice public.invoices%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception using
      errcode = 'P0001',
      message = 'Authentication is required.';
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
      message = 'You do not have permission to void this invoice.';
  end if;

  select invoice.*
  into target_invoice
  from public.invoices as invoice
  where invoice.id = target_invoice_id
    and invoice.organization_id = actor_organization_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'This invoice could not be found.';
  end if;

  if target_invoice.status = 'paid' then
    raise exception using
      errcode = 'P0001',
      message = 'A fully paid invoice cannot be voided.';
  end if;

  if target_invoice.status = 'void' then
    raise exception using
      errcode = 'P0001',
      message = 'This invoice has already been voided.';
  end if;

  update public.invoices
  set status = 'void', voided_at = pg_catalog.now()
  where id = target_invoice_id;

  return query select 'void'::text;
end;
$function$;

revoke all on function public.void_invoice(uuid)
  from public, anon, authenticated;

grant execute on function public.void_invoice(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- public.record_manual_payment: super_admin/admin only. p_idempotency_key
-- makes a retried submission (double-click, refresh-resubmit) return the
-- original payment instead of creating a duplicate — the same "check first,
-- short-circuit to the existing result" shape already used by
-- accept_proposal_by_token's already_accepted branch. Overpayment is
-- rejected outright (no partial application, no negative balance) since
-- this phase does not implement overpayment/credit handling.
-- ---------------------------------------------------------------------------

create or replace function public.record_manual_payment(
  target_invoice_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_paid_date date,
  p_provider_reference text,
  p_notes text,
  p_idempotency_key text
)
returns table (
  payment_id uuid,
  invoice_status text,
  balance_due numeric
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
  target_invoice public.invoices%rowtype;
  existing_payment_id uuid;
  existing_payment_invoice_id uuid;
  new_payment_id uuid;
  normalized_reference text := nullif(btrim(coalesce(p_provider_reference, '')), '');
  normalized_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  normalized_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  resolved_paid_at timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception using
      errcode = 'P0001',
      message = 'Authentication is required.';
  end if;

  select
    min(membership.organization_id::text)::uuid,
    min(membership.user_id::text)::uuid,
    min(membership.role),
    count(*)::integer
  into
    actor_organization_id, actor_profile_id, actor_role,
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
      message = 'You do not have permission to record payments.';
  end if;

  if normalized_key is not null then
    select payment.id, payment.invoice_id
    into existing_payment_id, existing_payment_invoice_id
    from public.payments as payment
    where payment.idempotency_key = normalized_key;

    if found then
      -- The key must refer back to the same invoice this call named. A
      -- mismatch means the caller reused a key across two different
      -- logical requests, which is a caller bug, not a legitimate retry —
      -- reject it rather than either leaking another invoice's balance or
      -- silently proceeding to a duplicate insert.
      if existing_payment_invoice_id <> target_invoice_id then
        raise exception using
          errcode = 'P0001',
          message = 'This request could not be processed. Please try again.';
      end if;

      -- Re-checking organization ownership here (rather than trusting the
      -- earlier match) keeps this short-circuit branch just as
      -- org-scoped as the normal path below.
      select invoice.status, invoice.balance_due
      into target_invoice.status, target_invoice.balance_due
      from public.invoices as invoice
      where invoice.id = target_invoice_id
        and invoice.organization_id = actor_organization_id;

      if not found then
        raise exception using
          errcode = 'P0001',
          message = 'This invoice could not be found.';
      end if;

      return query select existing_payment_id, target_invoice.status, target_invoice.balance_due;
      return;
    end if;
  end if;

  select invoice.*
  into target_invoice
  from public.invoices as invoice
  where invoice.id = target_invoice_id
    and invoice.organization_id = actor_organization_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'This invoice could not be found.';
  end if;

  if target_invoice.status not in ('sent', 'partial', 'overdue') then
    raise exception using
      errcode = 'P0001',
      message = 'Payments can only be recorded on a sent, partially paid, or overdue invoice.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception using
      errcode = 'P0001',
      message = 'Enter a payment amount greater than zero.';
  end if;

  if p_amount > target_invoice.balance_due then
    raise exception using
      errcode = 'P0001',
      message = 'This payment would exceed the remaining balance on this invoice.';
  end if;

  if p_payment_method is null or p_payment_method not in
    ('bank_transfer', 'gcash', 'card', 'cash', 'other')
  then
    raise exception using
      errcode = 'P0001',
      message = 'Choose a valid payment method.';
  end if;

  resolved_paid_at := coalesce(p_paid_date, current_date)::timestamptz;

  insert into public.payments (
    organization_id,
    client_id,
    invoice_id,
    amount,
    currency,
    payment_method,
    provider,
    provider_reference,
    status,
    paid_at,
    recorded_by,
    notes,
    idempotency_key
  )
  values (
    actor_organization_id,
    target_invoice.client_id,
    target_invoice_id,
    p_amount,
    target_invoice.currency,
    p_payment_method,
    'manual',
    normalized_reference,
    'paid',
    resolved_paid_at,
    actor_profile_id,
    normalized_notes,
    normalized_key
  )
  returning payments.id
  into new_payment_id;

  select invoice.status, invoice.balance_due
  into target_invoice.status, target_invoice.balance_due
  from public.invoices as invoice
  where invoice.id = target_invoice_id;

  return query select new_payment_id, target_invoice.status, target_invoice.balance_due;
end;
$function$;

revoke all on function public.record_manual_payment(
  uuid, numeric, text, date, text, text, text
) from public, anon, authenticated;

grant execute on function public.record_manual_payment(
  uuid, numeric, text, date, text, text, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- public.start_paymongo_checkout: portal-only (client owner/manager). The
-- application layer creates the actual PayMongo checkout session (an
-- external HTTP call, which can only happen server-side in Node) using an
-- amount it already read from an authenticated, RLS-protected invoice
-- lookup, then calls this function to persist it. This function
-- independently recomputes the expected amount from the invoice row itself
-- and rejects the call outright if it does not match p_amount, rather than
-- silently trusting or silently overwriting — if the invoice changed
-- between the read and this call, the caller must refresh and retry.
-- ---------------------------------------------------------------------------

create or replace function public.start_paymongo_checkout(
  target_invoice_id uuid,
  p_amount numeric,
  p_currency text,
  p_provider_reference text,
  p_checkout_url text
)
returns table (payment_id uuid)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  resolved_client_id uuid := private.active_client_id();
  resolved_role text := private.active_client_role();
  target_invoice public.invoices%rowtype;
  new_payment_id uuid;
  normalized_reference text := nullif(btrim(coalesce(p_provider_reference, '')), '');
begin
  if resolved_client_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'An active client membership is required.';
  end if;

  if resolved_role not in ('owner', 'manager') then
    raise exception using
      errcode = 'P0001',
      message = 'You do not have permission to pay this invoice.';
  end if;

  if normalized_reference is null then
    raise exception using
      errcode = 'P0001',
      message = 'A provider reference is required.';
  end if;

  select invoice.*
  into target_invoice
  from public.invoices as invoice
  where invoice.id = target_invoice_id
    and invoice.client_id = resolved_client_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'This invoice could not be found.';
  end if;

  if target_invoice.status not in ('sent', 'partial', 'overdue') then
    raise exception using
      errcode = 'P0001',
      message = 'This invoice is not currently payable online.';
  end if;

  if p_amount is distinct from target_invoice.balance_due
    or p_currency is distinct from target_invoice.currency
  then
    raise exception using
      errcode = 'P0001',
      message = 'This invoice has changed. Please refresh the page and try again.';
  end if;

  -- A client who simply abandons PayMongo's hosted checkout page (closes
  -- the tab without paying) never triggers any webhook event — there is no
  -- "abandoned" notification to reconcile against. Without this, that one
  -- stale 'pending' row would permanently satisfy
  -- payments_invoice_active_paymongo_session_unique and block every future
  -- payment attempt on this invoice. PayMongo checkout sessions are
  -- documented to expire 24 hours after creation, so a pending/processing
  -- attempt older than that is treated as abandoned and superseded here,
  -- before the "already in progress" check below runs. A webhook that
  -- arrives later for this now-superseded row is still handled safely:
  -- reconcile_paymongo_webhook_event's "already_resolved" branch is a
  -- no-op once status has left pending/processing.
  update public.payments
  set status = 'cancelled'
  where invoice_id = target_invoice_id
    and provider = 'paymongo'
    and status in ('pending', 'processing')
    and created_at < pg_catalog.now() - interval '24 hours';

  -- Friendlier than letting a genuinely still-active session fall through
  -- to payments_invoice_active_paymongo_session_unique's raw constraint
  -- violation. The partial unique index remains the actual guarantee; this
  -- is only a nicer error message for the common case.
  if exists (
    select 1
    from public.payments as payment
    where payment.invoice_id = target_invoice_id
      and payment.provider = 'paymongo'
      and payment.status in ('pending', 'processing')
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'A payment for this invoice is already in progress.';
  end if;

  insert into public.payments (
    organization_id,
    client_id,
    invoice_id,
    amount,
    currency,
    provider,
    provider_reference,
    status,
    metadata
  )
  values (
    target_invoice.organization_id,
    resolved_client_id,
    target_invoice_id,
    p_amount,
    p_currency,
    'paymongo',
    normalized_reference,
    'pending',
    pg_catalog.jsonb_build_object('checkout_url', p_checkout_url)
  )
  returning payments.id
  into new_payment_id;

  return query select new_payment_id;
end;
$function$;

revoke all on function public.start_paymongo_checkout(
  uuid, numeric, text, text, text
) from public, anon, authenticated;

grant execute on function public.start_paymongo_checkout(
  uuid, numeric, text, text, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- public.reconcile_paymongo_webhook_event: called only from the
-- /api/webhooks/paymongo route handler, using the service-role client — a
-- webhook request carries no Supabase Auth session at all, so this is the
-- one legitimate Phase 9 use of the admin client (mirrors the narrow,
-- documented exception already established for client-invitation
-- onboarding in Phase 7). Not reachable by `authenticated` or `anon` at all.
--
-- Idempotent: a provider_event_id already recorded on any payment is treated
-- as already-processed and returns success without changing anything.
-- Amount/currency are verified against what start_paymongo_checkout
-- recorded at session-creation time; a mismatch marks the payment failed
-- instead of ever silently settling the invoice.
-- ---------------------------------------------------------------------------

create or replace function public.reconcile_paymongo_webhook_event(
  p_provider_reference text,
  p_provider_event_id text,
  p_amount numeric,
  p_currency text,
  p_event_status text
)
returns table (outcome text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_payment public.payments%rowtype;
  already_processed boolean;
begin
  if p_provider_reference is null or p_provider_event_id is null then
    return query select 'invalid_input'::text;
    return;
  end if;

  select exists (
    select 1 from public.payments
    where provider_event_id = p_provider_event_id
  )
  into already_processed;

  if already_processed then
    return query select 'already_processed'::text;
    return;
  end if;

  select payment.*
  into target_payment
  from public.payments as payment
  where payment.provider = 'paymongo'
    and payment.provider_reference = p_provider_reference
  for update;

  if not found then
    return query select 'payment_not_found'::text;
    return;
  end if;

  if target_payment.status not in ('pending', 'processing') then
    -- Already resolved (paid/failed/cancelled) by an earlier event; record
    -- nothing further so history is never overwritten, but acknowledge the
    -- event as handled so the provider does not keep retrying it.
    return query select 'already_resolved'::text;
    return;
  end if;

  if p_event_status = 'paid' then
    if p_amount is distinct from target_payment.amount
      or p_currency is distinct from target_payment.currency
    then
      update public.payments
      set
        status = 'failed',
        provider_event_id = p_provider_event_id,
        metadata = metadata || pg_catalog.jsonb_build_object(
          'reconciliation_note', 'amount_or_currency_mismatch'
        )
      where id = target_payment.id;

      return query select 'amount_mismatch'::text;
      return;
    end if;

    update public.payments
    set
      status = 'paid',
      paid_at = pg_catalog.now(),
      provider_event_id = p_provider_event_id
    where id = target_payment.id;

    return query select 'settled'::text;
    return;
  end if;

  if p_event_status in ('failed', 'cancelled', 'expired') then
    update public.payments
    set
      status = case when p_event_status = 'expired' then 'cancelled' else p_event_status end,
      provider_event_id = p_provider_event_id
    where id = target_payment.id;

    return query select 'closed'::text;
    return;
  end if;

  -- An intermediate/unknown provider status (e.g. still processing): record
  -- the event id was seen without changing payment status, so a later
  -- terminal event for the same session is not treated as a duplicate.
  update public.payments
  set provider_event_id = p_provider_event_id
  where id = target_payment.id;

  return query select 'acknowledged'::text;
end;
$function$;

revoke all on function public.reconcile_paymongo_webhook_event(
  text, text, numeric, text, text
) from public, anon, authenticated;

grant execute on function public.reconcile_paymongo_webhook_event(
  text, text, numeric, text, text
) to service_role;

-- ---------------------------------------------------------------------------
-- public.get_client_invoices / public.get_client_invoice_detail: the only
-- client-facing read path, mirroring get_client_projects()'s "no
-- client-facing RLS policy on the base table" design — table-level SELECT
-- cannot be column-limited per role, so internal-only fields (organization
-- id, notes, created_by) are only ever kept out of reach by never being
-- selected here, not by a policy.
-- ---------------------------------------------------------------------------

create or replace function public.get_client_invoices()
returns table (
  id uuid,
  invoice_number text,
  status text,
  currency text,
  subtotal numeric,
  discount numeric,
  tax numeric,
  total numeric,
  amount_paid numeric,
  balance_due numeric,
  issue_date date,
  due_date date,
  sent_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    invoice.id,
    invoice.invoice_number,
    private.effective_invoice_status(
      invoice.status, invoice.due_date, invoice.balance_due
    ),
    invoice.currency,
    invoice.subtotal,
    invoice.discount,
    invoice.tax,
    invoice.total,
    invoice.amount_paid,
    invoice.balance_due,
    invoice.issue_date,
    invoice.due_date,
    invoice.sent_at,
    invoice.paid_at,
    invoice.created_at
  from public.invoices as invoice
  where invoice.client_id = (select private.active_client_id())
    and invoice.status <> 'draft'
  order by invoice.created_at desc
  limit 100;
$function$;

revoke all on function public.get_client_invoices()
  from public, anon, authenticated;

grant execute on function public.get_client_invoices() to authenticated;

create or replace function public.get_client_invoice_detail(
  target_invoice_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  resolved_client_id uuid := private.active_client_id();
  target_invoice public.invoices%rowtype;
begin
  if resolved_client_id is null then
    return null;
  end if;

  select invoice.*
  into target_invoice
  from public.invoices as invoice
  where invoice.id = target_invoice_id
    and invoice.client_id = resolved_client_id
    and invoice.status <> 'draft';

  if not found then
    return null;
  end if;

  if target_invoice.status = 'sent' and target_invoice.viewed_at is null then
    update public.invoices
    set viewed_at = pg_catalog.now()
    where id = target_invoice.id;

    target_invoice.viewed_at := pg_catalog.now();
  end if;

  return pg_catalog.jsonb_build_object(
    'id', target_invoice.id,
    'invoice_number', target_invoice.invoice_number,
    'status', private.effective_invoice_status(
      target_invoice.status, target_invoice.due_date, target_invoice.balance_due
    ),
    'currency', target_invoice.currency,
    'subtotal', target_invoice.subtotal,
    'discount', target_invoice.discount,
    'tax', target_invoice.tax,
    'total', target_invoice.total,
    'amount_paid', target_invoice.amount_paid,
    'balance_due', target_invoice.balance_due,
    'issue_date', target_invoice.issue_date,
    'due_date', target_invoice.due_date,
    'sent_at', target_invoice.sent_at,
    'viewed_at', target_invoice.viewed_at,
    'paid_at', target_invoice.paid_at,
    'items', (
      select coalesce(pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', item.id,
          'description', item.description,
          'quantity', item.quantity,
          'unit_price', item.unit_price,
          'line_total', item.line_total,
          'sort_order', item.sort_order
        )
        order by item.sort_order
      ), '[]'::jsonb)
      from public.invoice_items as item
      where item.invoice_id = target_invoice.id
    ),
    'payments', (
      select coalesce(pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', payment.id,
          'amount', payment.amount,
          'currency', payment.currency,
          'payment_method', payment.payment_method,
          'provider', payment.provider,
          'status', payment.status,
          'paid_at', payment.paid_at
        )
        order by payment.created_at desc
      ), '[]'::jsonb)
      from public.payments as payment
      where payment.invoice_id = target_invoice.id
        and payment.status = 'paid'
    )
  );
end;
$function$;

revoke all on function public.get_client_invoice_detail(uuid)
  from public, anon, authenticated;

grant execute on function public.get_client_invoice_detail(uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;

create policy invoices_select_internal_members
on public.invoices
for select
to authenticated
using (
  (select private.is_internal_member(invoices.organization_id))
);

create policy invoices_insert_invoice_managers
on public.invoices
for insert
to authenticated
with check (
  (
    select private.has_internal_role(
      invoices.organization_id,
      array['super_admin', 'admin']
    )
  )
  and created_by = (select private.current_profile_id())
  and exists (
    select 1
    from public.clients as client
    where client.id = invoices.client_id
      and client.organization_id = invoices.organization_id
  )
  and (
    invoices.project_id is null
    or exists (
      select 1
      from public.projects as project
      where project.id = invoices.project_id
        and project.organization_id = invoices.organization_id
        and project.client_id = invoices.client_id
    )
  )
);

create policy invoices_update_invoice_managers
on public.invoices
for update
to authenticated
using (
  (
    select private.has_internal_role(
      invoices.organization_id,
      array['super_admin', 'admin']
    )
  )
  and invoices.status = 'draft'
)
with check (
  (
    select private.has_internal_role(
      invoices.organization_id,
      array['super_admin', 'admin']
    )
  )
);

create policy invoice_items_select_internal_members
on public.invoice_items
for select
to authenticated
using (
  exists (
    select 1
    from public.invoices as invoice
    where invoice.id = invoice_items.invoice_id
      and (select private.is_internal_member(invoice.organization_id))
  )
);

create policy invoice_items_insert_invoice_managers
on public.invoice_items
for insert
to authenticated
with check (
  exists (
    select 1
    from public.invoices as invoice
    where invoice.id = invoice_items.invoice_id
      and invoice.status = 'draft'
      and (
        select private.has_internal_role(
          invoice.organization_id,
          array['super_admin', 'admin']
        )
      )
  )
);

create policy invoice_items_update_invoice_managers
on public.invoice_items
for update
to authenticated
using (
  exists (
    select 1
    from public.invoices as invoice
    where invoice.id = invoice_items.invoice_id
      and invoice.status = 'draft'
      and (
        select private.has_internal_role(
          invoice.organization_id,
          array['super_admin', 'admin']
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.invoices as invoice
    where invoice.id = invoice_items.invoice_id
      and (
        select private.has_internal_role(
          invoice.organization_id,
          array['super_admin', 'admin']
        )
      )
  )
);

create policy invoice_items_delete_invoice_managers
on public.invoice_items
for delete
to authenticated
using (
  exists (
    select 1
    from public.invoices as invoice
    where invoice.id = invoice_items.invoice_id
      and invoice.status = 'draft'
      and (
        select private.has_internal_role(
          invoice.organization_id,
          array['super_admin', 'admin']
        )
      )
  )
);

create policy payments_select_internal_members
on public.payments
for select
to authenticated
using (
  (select private.is_internal_member(payments.organization_id))
);

-- No INSERT/UPDATE/DELETE policy or grant exists for `authenticated` or
-- `anon` on payments: every write happens exclusively through
-- record_manual_payment / start_paymongo_checkout (both SECURITY DEFINER)
-- or reconcile_paymongo_webhook_event (service_role only), which is what
-- makes "payment status can never be set directly from the browser" true
-- regardless of how the row is written.

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all privileges
  on table public.invoices, public.invoice_items, public.payments
  from public, anon, authenticated;

grant select on table public.invoices to authenticated;
grant insert (
  organization_id,
  client_id,
  project_id,
  currency,
  discount,
  tax,
  due_date,
  notes,
  created_by
) on public.invoices to authenticated;
grant update (
  currency,
  discount,
  tax,
  due_date,
  notes
) on public.invoices to authenticated;

grant select on table public.invoice_items to authenticated;
grant insert (
  invoice_id,
  description,
  quantity,
  unit_price,
  sort_order
) on public.invoice_items to authenticated;
grant update (
  description,
  quantity,
  unit_price,
  sort_order
) on public.invoice_items to authenticated;
grant delete on public.invoice_items to authenticated;

grant select on table public.payments to authenticated;

grant all privileges
  on table public.invoices, public.invoice_items, public.payments
  to service_role;
