-- Phase 12A (part 1 of 2): reporting. Five read-only aggregate RPCs over
-- data Phases 3-11 already own. Additive only: two private helpers, five
-- public functions, and twelve indexes. Creates no table, alters no column,
-- changes no existing function signature, and touches no RLS policy.
--
-- Design notes a reviewer should not have to reconstruct:
--
-- 1. Every report is SECURITY DEFINER and re-checks the caller's role
--    itself, exactly as public.list_audit_logs does. The UI gate and the
--    route gate are conveniences; this is the boundary. A caller who
--    navigates straight to the RPC still fails here.
--
--    Note the layer above it: these functions are granted to `authenticated`
--    only, so an `anon` caller is rejected by PostgreSQL with SQLSTATE 42501
--    ("permission denied for function") BEFORE the body runs. anon never
--    reaches the role check and never receives its P0001 message -- do not
--    write tests or documentation that expect it to.
--
-- 1b. Date-window inputs are validated in the database, not trusted from the
--    caller. private.resolve_report_window rejects a null, reversed, or
--    over-long range with a user-safe P0001 before any query runs, so a
--    direct RPC call that bypasses the route and its Zod schema is still
--    bounded. The UI helpers narrow the input; they do not protect it.
--
-- 2. Reports return jsonb rather than `returns table`. Each report mixes
--    scalars with heterogeneous breakdown lists (a status funnel, a monthly
--    series, per-currency totals, per-source rows). Flattening those into
--    one relational shape would either need several round trips or a wide
--    sparse row. The application validates the payload at the query
--    boundary rather than trusting it.
--
-- 3. All bucketing is Asia/Manila, fixed. profiles.timezone exists but is
--    deliberately NOT used: a per-viewer timezone would make two admins see
--    different numbers for the same report, which is a reporting defect
--    rather than a personalization feature.
--
-- 4. Every ratio divides by nullif(denominator, 0) and yields null, never
--    zero. "No data" and "zero percent" are different answers and the UI
--    renders them differently.
--
-- 5. Every money aggregate is grouped by currency. invoices.currency,
--    proposals.currency and payments.currency are free text defaulted to
--    'PHP'; summing across currencies would be silently wrong the first
--    time a non-PHP row appears.
--
-- 6. public.get_project_delivery_report deliberately does NOT use
--    private.can_manage_project(). That helper also returns true for an
--    ordinary project_members row, which is correct for access but wrong
--    for accountability: it would inflate a project manager's on-time rate
--    with projects they merely contribute to. The narrow rule
--    (projects.project_manager_id = actor profile) is used instead, and a
--    unit test asserts can_manage_project never appears in that function.

-- ---------------------------------------------------------------------------
-- SECTION 0: preflight. Abort loudly rather than guess if the foundation
-- this migration reads from does not look like what it expects.
-- ---------------------------------------------------------------------------

do $preflight$
begin
  if to_regclass('public.organizations') is null
    or to_regclass('public.profiles') is null
    or to_regclass('public.organization_members') is null
    or to_regclass('public.leads') is null
    or to_regclass('public.clients') is null
    or to_regclass('public.projects') is null
    or to_regclass('public.project_members') is null
    or to_regclass('public.milestones') is null
    or to_regclass('public.tasks') is null
    or to_regclass('public.proposals') is null
    or to_regclass('public.invoices') is null
    or to_regclass('public.invoice_items') is null
    or to_regclass('public.payments') is null
    or to_regclass('public.subscriptions') is null
    or to_regclass('public.support_tickets') is null
  then
    raise exception using
      errcode = '55000',
      message = 'Phase 12A reporting preflight aborted: one or more required Phase 1-11 tables are missing.';
  end if;

  if to_regprocedure('private.current_profile_id()') is null
    or to_regprocedure('private.is_internal_member(uuid)') is null
    or to_regprocedure('private.has_internal_role(uuid, text[])') is null
    or to_regprocedure('private.effective_invoice_status(text, date, numeric)') is null
  then
    raise exception using
      errcode = '55000',
      message = 'Phase 12A reporting preflight aborted: one or more required private helper functions are missing.';
  end if;

  if to_regprocedure('public.get_lead_conversion_report(date, date, text, uuid)') is not null
    or to_regprocedure('public.get_revenue_report(date, date, uuid)') is not null
  then
    raise exception using
      errcode = '55000',
      message = 'Phase 12A reporting preflight aborted: a Phase 12A reporting function already exists. This migration must not run twice.';
  end if;
end;
$preflight$;

-- ---------------------------------------------------------------------------
-- SECTION 1: indexes. Every filter and every bucket key below is covered.
-- All are partial where the report only ever reads a subset, so the index
-- stays small and the write cost stays proportional to the rows that
-- actually matter.
-- ---------------------------------------------------------------------------

create index if not exists leads_organization_converted_idx
  on public.leads (organization_id, converted_at desc)
  where converted_at is not null;

create index if not exists leads_organization_source_created_idx
  on public.leads (organization_id, source, created_at desc);

create index if not exists proposals_organization_sent_idx
  on public.proposals (organization_id, sent_at desc)
  where sent_at is not null;

create index if not exists proposals_organization_accepted_idx
  on public.proposals (organization_id, accepted_at desc)
  where accepted_at is not null;

create index if not exists invoices_organization_issue_date_idx
  on public.invoices (organization_id, issue_date desc)
  where status not in ('draft', 'void');

create index if not exists payments_organization_paid_at_idx
  on public.payments (organization_id, paid_at desc)
  where status = 'paid';

-- Drives the invoice-cohort collection rate: for a set of cohort invoices,
-- find their settled payments regardless of when those payments landed.
create index if not exists payments_invoice_paid_idx
  on public.payments (invoice_id)
  where status = 'paid';

create index if not exists projects_organization_completed_idx
  on public.projects (organization_id, completed_at desc)
  where completed_at is not null;

create index if not exists projects_organization_target_open_idx
  on public.projects (organization_id, target_date)
  where completed_at is null;

-- Serves both the project manager's delivery-report scope and the
-- project-manager branch of Phase 12A global search (part 2), which resolves
-- a manager's clients through the projects they own.
create index if not exists projects_organization_manager_client_idx
  on public.projects (organization_id, project_manager_id, client_id);

create index if not exists milestones_project_due_open_idx
  on public.milestones (project_id, due_date)
  where status <> 'completed';

create index if not exists tasks_project_completed_idx
  on public.tasks (project_id, completed_at desc)
  where completed_at is not null;

-- ---------------------------------------------------------------------------
-- SECTION 2: private helpers.
-- ---------------------------------------------------------------------------

-- Resolves the caller's single active internal membership. Returns zero rows
-- -- never an arbitrary pick -- when the caller has none or more than one,
-- matching private.active_client_id()'s fail-closed `having count(*) = 1`
-- and src/lib/auth/server.ts's `membershipData.length !== 1` guard.
create or replace function private.current_internal_actor()
returns table (
  organization_id uuid,
  profile_id uuid,
  role text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    min(membership.organization_id::text)::uuid,
    min(membership.user_id::text)::uuid,
    min(membership.role)
  from public.organization_members as membership
  inner join public.profiles as profile
    on profile.id = membership.user_id
  inner join public.organizations as organization
    on organization.id = membership.organization_id
  where profile.auth_user_id = (select auth.uid())
    and membership.status = 'active'
    and organization.status = 'active'
  having count(*) = 1;
$function$;

revoke all on function private.current_internal_actor()
  from public, anon, authenticated;

grant execute on function private.current_internal_actor()
  to authenticated;

-- Validates a report window and returns the half-open timestamptz interval
-- the callers bucket on: window_start inclusive, window_end exclusive.
--
-- This is the server-side input boundary for all five reports. It rejects
-- rather than repairs: a null, reversed, or over-long range raises a
-- user-safe P0001 instead of quietly substituting a default. A caller
-- invoking the RPC directly -- bypassing the route and its Zod schema --
-- therefore cannot obtain an unbounded or nonsensical window. Silently
-- defaulting a null would hand a broken caller a plausible-looking 30-day
-- report instead of telling it that it sent nothing.
create or replace function private.resolve_report_window(
  p_from date,
  p_to date
)
returns table (
  report_from date,
  report_to date,
  window_start timestamptz,
  window_end timestamptz
)
language plpgsql
stable
set search_path = ''
as $function$
begin
  if p_from is null or p_to is null then
    raise exception using
      errcode = 'P0001',
      message = 'A report start date and end date are both required.';
  end if;

  if p_to < p_from then
    raise exception using
      errcode = 'P0001',
      message = 'The report end date must not be before the start date.';
  end if;

  -- 365 days of difference is 366 days inclusive.
  if p_to - p_from > 365 then
    raise exception using
      errcode = 'P0001',
      message = 'The report date range must not exceed 366 days.';
  end if;

  return query
    select
      p_from,
      p_to,
      (p_from::timestamp at time zone 'Asia/Manila'),
      ((p_to + 1)::timestamp at time zone 'Asia/Manila');
end;
$function$;

revoke all on function private.resolve_report_window(date, date)
  from public, anon, authenticated;

grant execute on function private.resolve_report_window(date, date)
  to authenticated;

-- ---------------------------------------------------------------------------
-- SECTION 3: F-099 lead conversion report.
--
-- Two cohorts, reported separately and never blended:
--   * created cohort -- leads created inside the window, of which some have
--     since converted. This is the conversion RATE's denominator.
--   * conversion cohort -- leads that converted inside the window, whatever
--     date they arrived. This is throughput.
--
-- "Converted" means leads.converted_at is not null, set by
-- public.convert_lead_to_client. It is NOT status = 'won': a lead can be
-- marked won without a client record ever being created, and
-- won_not_converted exists to surface exactly that gap rather than bury it.
-- ---------------------------------------------------------------------------

create or replace function public.get_lead_conversion_report(
  p_from date default null,
  p_to date default null,
  p_source text default null,
  p_assigned_to uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  actor_organization_id uuid;
  actor_role text;
  window_from date;
  window_to date;
  window_start timestamptz;
  window_end timestamptz;
  report_payload jsonb;
begin
  select actor.organization_id, actor.role
    into actor_organization_id, actor_role
  from private.current_internal_actor() as actor;

  if actor_organization_id is null
    or actor_role not in ('super_admin', 'admin')
  then
    raise exception using
      errcode = 'P0001',
      message = 'You do not have permission to view this report.';
  end if;

  select resolved.report_from, resolved.report_to, resolved.window_start, resolved.window_end
    into window_from, window_to, window_start, window_end
  from private.resolve_report_window(p_from, p_to) as resolved;

  with created_cohort as (
    select
      lead.id,
      lead.status,
      lead.created_at,
      lead.converted_at
    from public.leads as lead
    where lead.organization_id = actor_organization_id
      and lead.created_at >= window_start
      and lead.created_at < window_end
      and (p_source is null or lead.source = p_source)
      and (p_assigned_to is null or lead.assigned_to = p_assigned_to)
  ),
  created_totals as (
    select
      count(*)::integer as leads_created,
      count(*) filter (where cohort.converted_at is not null)::integer as leads_converted,
      count(*) filter (where cohort.status = 'won')::integer as won,
      count(*) filter (where cohort.status = 'lost')::integer as lost,
      count(*) filter (
        where cohort.status = 'won' and cohort.converted_at is null
      )::integer as won_not_converted,
      avg(
        extract(epoch from (cohort.converted_at - cohort.created_at)) / 86400.0
      ) filter (where cohort.converted_at is not null) as avg_days_to_convert,
      percentile_cont(0.5) within group (
        order by extract(epoch from (cohort.converted_at - cohort.created_at)) / 86400.0
      ) filter (where cohort.converted_at is not null) as median_days_to_convert
    from created_cohort as cohort
  ),
  funnel as (
    select
      known.status,
      coalesce(counted.total, 0)::integer as total
    from (
      values ('new'), ('contacted'), ('discovery'), ('qualified'),
             ('proposal'), ('negotiation'), ('won'), ('lost')
    ) as known(status)
    left join (
      select cohort.status, count(*) as total
      from created_cohort as cohort
      group by cohort.status
    ) as counted on counted.status = known.status
  ),
  conversions_in_window as (
    select count(*)::integer as total
    from public.leads as lead
    where lead.organization_id = actor_organization_id
      and lead.converted_at is not null
      and lead.converted_at >= window_start
      and lead.converted_at < window_end
      and (p_source is null or lead.source = p_source)
      and (p_assigned_to is null or lead.assigned_to = p_assigned_to)
  )
  select jsonb_build_object(
    'report_from', window_from,
    'report_to', window_to,
    'timezone', 'Asia/Manila',
    'leads_created', totals.leads_created,
    'leads_converted_from_cohort', totals.leads_converted,
    'conversion_rate',
      round(totals.leads_converted::numeric / nullif(totals.leads_created, 0), 4),
    'conversions_in_period', (select total from conversions_in_window),
    'won', totals.won,
    'lost', totals.lost,
    'win_rate',
      round(totals.won::numeric / nullif(totals.won + totals.lost, 0), 4),
    'won_not_converted', totals.won_not_converted,
    'avg_days_to_convert', round(totals.avg_days_to_convert, 2),
    'median_days_to_convert', round(totals.median_days_to_convert::numeric, 2),
    'funnel', (
      select coalesce(
        jsonb_agg(jsonb_build_object('status', funnel.status, 'total', funnel.total)),
        '[]'::jsonb
      )
      from funnel
    )
  )
  into report_payload
  from created_totals as totals;

  return coalesce(report_payload, '{}'::jsonb);
end;
$function$;

revoke all on function public.get_lead_conversion_report(date, date, text, uuid)
  from public, anon, authenticated;

grant execute on function public.get_lead_conversion_report(date, date, text, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- SECTION 4: F-100 lead source report.
--
-- All nine source values are returned zero-filled, so a channel that
-- produced nothing this window is visibly dead rather than silently absent.
--
-- attributed_paid_total is FIRST-TOUCH attribution: it credits every peso a
-- client has ever settled to the channel of the lead that originated them.
-- That is a useful channel signal and a wrong revenue split, so the UI must
-- label it as first-touch.
-- ---------------------------------------------------------------------------

create or replace function public.get_lead_source_report(
  p_from date default null,
  p_to date default null,
  p_assigned_to uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  actor_organization_id uuid;
  actor_role text;
  window_from date;
  window_to date;
  window_start timestamptz;
  window_end timestamptz;
  report_payload jsonb;
begin
  select actor.organization_id, actor.role
    into actor_organization_id, actor_role
  from private.current_internal_actor() as actor;

  if actor_organization_id is null
    or actor_role not in ('super_admin', 'admin')
  then
    raise exception using
      errcode = 'P0001',
      message = 'You do not have permission to view this report.';
  end if;

  select resolved.report_from, resolved.report_to, resolved.window_start, resolved.window_end
    into window_from, window_to, window_start, window_end
  from private.resolve_report_window(p_from, p_to) as resolved;

  with created_cohort as (
    select
      lead.id,
      lead.source,
      lead.status,
      lead.lead_score,
      lead.converted_at
    from public.leads as lead
    where lead.organization_id = actor_organization_id
      and lead.created_at >= window_start
      and lead.created_at < window_end
      and (p_assigned_to is null or lead.assigned_to = p_assigned_to)
  ),
  per_source as (
    select
      cohort.source,
      count(*)::integer as lead_count,
      count(*) filter (
        where cohort.status in ('qualified', 'proposal', 'negotiation', 'won')
      )::integer as qualified_count,
      count(*) filter (where cohort.status = 'won')::integer as won_count,
      count(*) filter (where cohort.status = 'lost')::integer as lost_count,
      count(*) filter (where cohort.converted_at is not null)::integer as converted_count,
      avg(cohort.lead_score) as avg_lead_score
    from created_cohort as cohort
    group by cohort.source
  ),
  attribution as (
    select
      cohort.source,
      payment.currency,
      sum(payment.amount) as paid_total
    from created_cohort as cohort
    inner join public.clients as client
      on client.source_lead_id = cohort.id
      and client.organization_id = actor_organization_id
    inner join public.invoices as invoice
      on invoice.client_id = client.id
      and invoice.organization_id = actor_organization_id
      and invoice.status not in ('draft', 'void')
    inner join public.payments as payment
      on payment.invoice_id = invoice.id
      and payment.status = 'paid'
    group by cohort.source, payment.currency
  )
  select jsonb_build_object(
    'report_from', window_from,
    'report_to', window_to,
    'timezone', 'Asia/Manila',
    'attribution_model', 'first_touch',
    'sources', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'source', known.source,
            'lead_count', coalesce(per_source.lead_count, 0),
            'qualified_count', coalesce(per_source.qualified_count, 0),
            'won_count', coalesce(per_source.won_count, 0),
            'lost_count', coalesce(per_source.lost_count, 0),
            'converted_count', coalesce(per_source.converted_count, 0),
            'conversion_rate', round(
              coalesce(per_source.converted_count, 0)::numeric
                / nullif(coalesce(per_source.lead_count, 0), 0),
              4
            ),
            'avg_lead_score', round(per_source.avg_lead_score, 1),
            'attributed_paid_total', coalesce(
              (
                select jsonb_agg(
                  jsonb_build_object(
                    'currency', attribution.currency,
                    'total', attribution.paid_total
                  )
                  order by attribution.currency
                )
                from attribution
                where attribution.source = known.source
              ),
              '[]'::jsonb
            )
          )
          order by known.source
        )
        from (
          values ('website'), ('facebook'), ('messenger'), ('email'),
                 ('referral'), ('networking'), ('manual'),
                 ('existing_client'), ('other')
        ) as known(source)
        left join per_source on per_source.source = known.source
      ),
      '[]'::jsonb
    )
  )
  into report_payload;

  return coalesce(report_payload, '{}'::jsonb);
end;
$function$;

revoke all on function public.get_lead_source_report(date, date, uuid)
  from public, anon, authenticated;

grant execute on function public.get_lead_source_report(date, date, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- SECTION 5: F-101 proposal win rate.
--
-- The cohort is proposals SENT inside the window (sent_at is not null), not
-- proposals created: a proposal's performance belongs to when it went out.
--
-- Two rates, both reported, because the denominator is a genuine business
-- question rather than a technical one:
--   * win_rate_decided (headline) -- accepted / (accepted + declined).
--     EXPIRED IS NOT A DECLINE and is excluded from this denominator
--     entirely; it is reported as its own count.
--   * win_rate_sent (secondary) -- accepted / everything sent. Expired and
--     still-open proposals do dilute this one, correctly: they were sent and
--     did not close.
--
-- accepted/declined are keyed on their timestamps for consistency with the
-- sent_at rule. `expired` has no timestamp column, so it is status-derived.
-- ---------------------------------------------------------------------------

create or replace function public.get_proposal_win_rate_report(
  p_from date default null,
  p_to date default null,
  p_created_by uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  actor_organization_id uuid;
  actor_role text;
  window_from date;
  window_to date;
  window_start timestamptz;
  window_end timestamptz;
  report_payload jsonb;
begin
  select actor.organization_id, actor.role
    into actor_organization_id, actor_role
  from private.current_internal_actor() as actor;

  if actor_organization_id is null
    or actor_role not in ('super_admin', 'admin')
  then
    raise exception using
      errcode = 'P0001',
      message = 'You do not have permission to view this report.';
  end if;

  select resolved.report_from, resolved.report_to, resolved.window_start, resolved.window_end
    into window_from, window_to, window_start, window_end
  from private.resolve_report_window(p_from, p_to) as resolved;

  with sent_cohort as (
    select
      proposal.id,
      proposal.status,
      proposal.currency,
      proposal.total,
      proposal.sent_at,
      proposal.viewed_at,
      proposal.accepted_at,
      proposal.declined_at
    from public.proposals as proposal
    where proposal.organization_id = actor_organization_id
      and proposal.sent_at is not null
      and proposal.sent_at >= window_start
      and proposal.sent_at < window_end
      and (p_created_by is null or proposal.created_by = p_created_by)
  ),
  cohort_totals as (
    select
      count(*)::integer as sent,
      count(*) filter (where cohort.viewed_at is not null)::integer as viewed,
      count(*) filter (where cohort.accepted_at is not null)::integer as accepted,
      count(*) filter (where cohort.declined_at is not null)::integer as declined,
      count(*) filter (where cohort.status = 'expired')::integer as expired,
      count(*) filter (where cohort.status = 'changes_requested')::integer as changes_requested,
      avg(
        extract(
          epoch from (coalesce(cohort.accepted_at, cohort.declined_at) - cohort.sent_at)
        ) / 86400.0
      ) filter (
        where coalesce(cohort.accepted_at, cohort.declined_at) is not null
      ) as avg_days_to_decision
    from sent_cohort as cohort
  ),
  per_currency as (
    select
      cohort.currency,
      sum(cohort.total) as pipeline_total,
      sum(cohort.total) filter (where cohort.accepted_at is not null) as won_total,
      avg(cohort.total) filter (where cohort.accepted_at is not null) as avg_won_total
    from sent_cohort as cohort
    group by cohort.currency
  ),
  accepted_in_window as (
    select count(*)::integer as total
    from public.proposals as proposal
    where proposal.organization_id = actor_organization_id
      and proposal.accepted_at is not null
      and proposal.accepted_at >= window_start
      and proposal.accepted_at < window_end
      and (p_created_by is null or proposal.created_by = p_created_by)
  )
  select jsonb_build_object(
    'report_from', window_from,
    'report_to', window_to,
    'timezone', 'Asia/Manila',
    'sent', totals.sent,
    'viewed', totals.viewed,
    'accepted', totals.accepted,
    'declined', totals.declined,
    'expired', totals.expired,
    'changes_requested', totals.changes_requested,
    'accepted_in_period', (select total from accepted_in_window),
    'win_rate_decided',
      round(totals.accepted::numeric / nullif(totals.accepted + totals.declined, 0), 4),
    'win_rate_sent',
      round(totals.accepted::numeric / nullif(totals.sent, 0), 4),
    'view_rate',
      round(totals.viewed::numeric / nullif(totals.sent, 0), 4),
    'avg_days_to_decision', round(totals.avg_days_to_decision, 2),
    'value_by_currency', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'currency', per_currency.currency,
            'pipeline_total', per_currency.pipeline_total,
            'won_total', coalesce(per_currency.won_total, 0),
            'avg_won_total', round(per_currency.avg_won_total, 2)
          )
          order by per_currency.currency
        )
        from per_currency
      ),
      '[]'::jsonb
    )
  )
  into report_payload
  from cohort_totals as totals;

  return coalesce(report_payload, '{}'::jsonb);
end;
$function$;

revoke all on function public.get_proposal_win_rate_report(date, date, uuid)
  from public, anon, authenticated;

grant execute on function public.get_proposal_win_rate_report(date, date, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- SECTION 6: F-102 revenue dashboard. super_admin/admin only.
--
-- Two bases, never blended:
--
--   * collected_in_period -- cash. Settled payments whose paid_at falls in
--     the window. Sourced from payments, never from invoices.status='paid':
--     only a payment row is evidence that money moved.
--
--   * the invoice cohort -- accrual. Non-draft, non-void invoices ISSUED in
--     the window. cohort_collected counts settled payments against those
--     invoices REGARDLESS of when the payment landed, so
--     cohort_collection_rate answers "of what we billed that month, how much
--     have we since been paid". It is therefore retroactive: it rises over
--     time as older invoices settle. The payload carries
--     cohort_collection_rate_basis = 'as_of_today' so the UI must say so.
--
-- collected_in_period / cohort_billed is a cash numerator over an accrual
-- denominator across mismatched cohorts. It is deliberately computed
-- NOWHERE, and a unit test asserts it stays that way.
--
-- Outstanding and overdue are point-in-time facts about the ledger now, not
-- properties of the window, so they ignore the date range entirely. Overdue
-- is derived through private.effective_invoice_status rather than read from
-- invoices.status, because that status is only refreshed by a sweep and a
-- genuinely overdue invoice can still read 'sent'.
--
-- Refunds are counted, never netted: payments carries no signed refund
-- amount, so subtracting them would be a guess.
-- ---------------------------------------------------------------------------

create or replace function public.get_revenue_report(
  p_from date default null,
  p_to date default null,
  p_client_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  actor_organization_id uuid;
  actor_role text;
  window_from date;
  window_to date;
  window_start timestamptz;
  window_end timestamptz;
  report_payload jsonb;
begin
  select actor.organization_id, actor.role
    into actor_organization_id, actor_role
  from private.current_internal_actor() as actor;

  if actor_organization_id is null
    or actor_role not in ('super_admin', 'admin')
  then
    raise exception using
      errcode = 'P0001',
      message = 'You do not have permission to view this report.';
  end if;

  select resolved.report_from, resolved.report_to, resolved.window_start, resolved.window_end
    into window_from, window_to, window_start, window_end
  from private.resolve_report_window(p_from, p_to) as resolved;

  with settled_in_window as (
    select
      payment.id,
      payment.client_id,
      payment.currency,
      payment.amount,
      payment.provider,
      payment.paid_at
    from public.payments as payment
    where payment.organization_id = actor_organization_id
      and payment.status = 'paid'
      and payment.paid_at >= window_start
      and payment.paid_at < window_end
      and (p_client_id is null or payment.client_id = p_client_id)
  ),
  -- Non-draft, non-void invoices issued inside the window. issue_date is a
  -- date column, so it is compared against the Manila-native date bounds
  -- directly -- no timezone conversion is involved or wanted.
  invoice_cohort as (
    select
      invoice.id,
      invoice.currency,
      invoice.total
    from public.invoices as invoice
    where invoice.organization_id = actor_organization_id
      and invoice.status not in ('draft', 'void')
      and invoice.issue_date is not null
      and invoice.issue_date >= window_from
      and invoice.issue_date <= window_to
      and (p_client_id is null or invoice.client_id = p_client_id)
  ),
  cohort_settlement as (
    select
      cohort.currency,
      sum(cohort.total) as cohort_billed,
      coalesce(
        sum(
          (
            select sum(payment.amount)
            from public.payments as payment
            where payment.invoice_id = cohort.id
              and payment.status = 'paid'
          )
        ),
        0
      ) as cohort_collected
    from invoice_cohort as cohort
    group by cohort.currency
  ),
  ledger_open as (
    select
      invoice.currency,
      sum(invoice.balance_due) as outstanding,
      sum(invoice.balance_due) filter (
        where private.effective_invoice_status(
          invoice.status, invoice.due_date, invoice.balance_due
        ) = 'overdue'
      ) as overdue
    from public.invoices as invoice
    where invoice.organization_id = actor_organization_id
      and invoice.status in ('sent', 'partial', 'overdue')
      and (p_client_id is null or invoice.client_id = p_client_id)
    group by invoice.currency
  ),
  monthly as (
    select
      to_char(
        date_trunc('month', settled.paid_at at time zone 'Asia/Manila'),
        'YYYY-MM'
      ) as month_key,
      settled.currency,
      sum(settled.amount) as collected
    from settled_in_window as settled
    group by 1, settled.currency
  ),
  by_client as (
    select
      settled.client_id,
      settled.currency,
      sum(settled.amount) as collected
    from settled_in_window as settled
    group by settled.client_id, settled.currency
  ),
  subscription_mrr as (
    select
      subscription.currency,
      sum(
        case subscription.billing_cycle
          when 'monthly' then subscription.amount
          when 'quarterly' then subscription.amount / 3
          when 'yearly' then subscription.amount / 12
          else 0
        end
      ) as mrr
    from public.subscriptions as subscription
    where subscription.organization_id = actor_organization_id
      and subscription.status in ('trial', 'active', 'past_due')
      and subscription.billing_cycle <> 'custom'
      and (p_client_id is null or subscription.client_id = p_client_id)
    group by subscription.currency
  )
  select jsonb_build_object(
    'report_from', window_from,
    'report_to', window_to,
    'timezone', 'Asia/Manila',
    'cohort_collection_rate_basis', 'as_of_today',
    'collected_in_period', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('currency', grouped.currency, 'total', grouped.total)
          order by grouped.currency
        )
        from (
          select settled.currency, sum(settled.amount) as total
          from settled_in_window as settled
          group by settled.currency
        ) as grouped
      ),
      '[]'::jsonb
    ),
    'invoice_cohort', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'currency', cohort_settlement.currency,
            'cohort_billed', cohort_settlement.cohort_billed,
            'cohort_collected', cohort_settlement.cohort_collected,
            'cohort_outstanding',
              cohort_settlement.cohort_billed - cohort_settlement.cohort_collected,
            'cohort_collection_rate', round(
              cohort_settlement.cohort_collected
                / nullif(cohort_settlement.cohort_billed, 0),
              4
            )
          )
          order by cohort_settlement.currency
        )
        from cohort_settlement
      ),
      '[]'::jsonb
    ),
    'ledger_open', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'currency', ledger_open.currency,
            'outstanding', ledger_open.outstanding,
            'overdue', coalesce(ledger_open.overdue, 0)
          )
          order by ledger_open.currency
        )
        from ledger_open
      ),
      '[]'::jsonb
    ),
    'monthly_series', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'month', monthly.month_key,
            'currency', monthly.currency,
            'collected', monthly.collected
          )
          order by monthly.month_key, monthly.currency
        )
        from monthly
      ),
      '[]'::jsonb
    ),
    'top_clients', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'client_id', ranked.client_id,
            'business_name', ranked.business_name,
            'currency', ranked.currency,
            'collected', ranked.collected
          )
          order by ranked.collected desc
        )
        from (
          select
            by_client.client_id,
            client.business_name,
            by_client.currency,
            by_client.collected
          from by_client
          left join public.clients as client on client.id = by_client.client_id
          order by by_client.collected desc
          limit 10
        ) as ranked
      ),
      '[]'::jsonb
    ),
    'provider_split', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'provider', grouped.provider,
            'currency', grouped.currency,
            'collected', grouped.collected
          )
          order by grouped.provider, grouped.currency
        )
        from (
          select settled.provider, settled.currency, sum(settled.amount) as collected
          from settled_in_window as settled
          group by settled.provider, settled.currency
        ) as grouped
      ),
      '[]'::jsonb
    ),
    'refunded_count', (
      select count(*)::integer
      from public.payments as payment
      where payment.organization_id = actor_organization_id
        and payment.status = 'refunded'
        and payment.created_at >= window_start
        and payment.created_at < window_end
        and (p_client_id is null or payment.client_id = p_client_id)
    ),
    'mrr', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('currency', subscription_mrr.currency, 'total', round(subscription_mrr.mrr, 2))
          order by subscription_mrr.currency
        )
        from subscription_mrr
      ),
      '[]'::jsonb
    ),
    'mrr_excluded_custom_cycle_count', (
      select count(*)::integer
      from public.subscriptions as subscription
      where subscription.organization_id = actor_organization_id
        and subscription.status in ('trial', 'active', 'past_due')
        and subscription.billing_cycle = 'custom'
        and (p_client_id is null or subscription.client_id = p_client_id)
    )
  )
  into report_payload;

  return coalesce(report_payload, '{}'::jsonb);
end;
$function$;

revoke all on function public.get_revenue_report(date, date, uuid)
  from public, anon, authenticated;

grant execute on function public.get_revenue_report(date, date, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- SECTION 7: F-103 project delivery report.
--
-- SCHEDULE ON-TIME RATE, not a team performance rate. This measures schedule
-- adherence only. The current schema cannot distinguish a client-caused
-- delay from an internal one: there is no client-dependency field, no
-- blocked-reason field, and no timestamped hold/resume ledger
-- (projects.status can be 'on_hold' but carries no history and no cause). A
-- project delayed three weeks waiting on client content is indistinguishable
-- here from one delayed three weeks by the team. THIS METRIC MUST NOT BE
-- USED FOR PERFORMANCE REVIEW. Delay attribution is tracked as F-111 and is
-- explicitly out of scope for Phase 12A.
--
-- Role scope:
--   super_admin / admin -- organization-wide.
--   project_manager     -- only projects where project_manager_id is the
--                          actor's profile. See design note 6 in the header
--                          for why private.can_manage_project() is not used.
--   everyone else       -- denied above.
--
-- Projects with no target_date cannot be on or off schedule; they are
-- excluded from the rate and surfaced as no_target_date_count so the rate's
-- coverage is visible rather than assumed.
--
-- progress_drift compares each project's stored progress_percent against
-- progress derived from its tasks. It REPORTS the discrepancy and never
-- writes progress_percent: silently overwriting a human-set column from a
-- read-only report is not this phase's mandate.
-- ---------------------------------------------------------------------------

create or replace function public.get_project_delivery_report(
  p_from date default null,
  p_to date default null,
  p_status text default null,
  p_project_manager_id uuid default null,
  p_client_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  actor_organization_id uuid;
  actor_profile_id uuid;
  actor_role text;
  window_from date;
  window_to date;
  window_start timestamptz;
  window_end timestamptz;
  manila_today date;
  report_payload jsonb;
begin
  select actor.organization_id, actor.profile_id, actor.role
    into actor_organization_id, actor_profile_id, actor_role
  from private.current_internal_actor() as actor;

  if actor_organization_id is null
    or actor_role not in ('super_admin', 'admin', 'project_manager')
  then
    raise exception using
      errcode = 'P0001',
      message = 'You do not have permission to view this report.';
  end if;

  select resolved.report_from, resolved.report_to, resolved.window_start, resolved.window_end
    into window_from, window_to, window_start, window_end
  from private.resolve_report_window(p_from, p_to) as resolved;

  manila_today := (pg_catalog.now() at time zone 'Asia/Manila')::date;

  with scoped_projects as (
    select
      project.id,
      project.name,
      project.status,
      project.start_date,
      project.target_date,
      project.completed_at,
      project.progress_percent
    from public.projects as project
    where project.organization_id = actor_organization_id
      and (
        actor_role in ('super_admin', 'admin')
        or project.project_manager_id = actor_profile_id
      )
      and (p_status is null or project.status = p_status)
      and (p_project_manager_id is null or project.project_manager_id = p_project_manager_id)
      and (p_client_id is null or project.client_id = p_client_id)
  ),
  completed_in_window as (
    select
      scoped.id,
      scoped.start_date,
      scoped.target_date,
      scoped.completed_at
    from scoped_projects as scoped
    where scoped.completed_at is not null
      and scoped.completed_at >= window_start
      and scoped.completed_at < window_end
  ),
  delivery_totals as (
    select
      count(*)::integer as completed_in_period,
      count(*) filter (where completed.target_date is null)::integer as no_target_date_count,
      count(*) filter (
        where completed.target_date is not null
          and (completed.completed_at at time zone 'Asia/Manila')::date <= completed.target_date
      )::integer as on_schedule_count,
      count(*) filter (where completed.target_date is not null)::integer as rated_count,
      avg(
        (completed.completed_at at time zone 'Asia/Manila')::date - completed.start_date
      ) filter (where completed.start_date is not null) as avg_delivery_days
    from completed_in_window as completed
  ),
  active_by_status as (
    select
      known.status,
      coalesce(counted.total, 0)::integer as total
    from (
      values ('planning'), ('design'), ('development'), ('integration'),
             ('testing'), ('client_review'), ('deployment'), ('on_hold')
    ) as known(status)
    left join (
      select scoped.status, count(*) as total
      from scoped_projects as scoped
      where scoped.status not in ('completed', 'cancelled')
      group by scoped.status
    ) as counted on counted.status = known.status
  ),
  task_rollup as (
    select
      task.project_id,
      count(*)::integer as total_tasks,
      count(*) filter (where task.status = 'done')::integer as done_tasks
    from public.tasks as task
    where task.project_id in (select scoped.id from scoped_projects as scoped)
    group by task.project_id
  )
  select jsonb_build_object(
    'report_from', window_from,
    'report_to', window_to,
    'timezone', 'Asia/Manila',
    'metric_label', 'Schedule On-Time Rate',
    'metric_caveat',
      'Measures schedule adherence only. The current schema cannot distinguish client-caused delays from internal delays. Do not use for performance review.',
    'completed_in_period', totals.completed_in_period,
    'schedule_on_time_rate',
      round(totals.on_schedule_count::numeric / nullif(totals.rated_count, 0), 4),
    'on_schedule_count', totals.on_schedule_count,
    'rated_count', totals.rated_count,
    'no_target_date_count', totals.no_target_date_count,
    'avg_delivery_days', round(totals.avg_delivery_days, 2),
    'active_by_status', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object('status', active_by_status.status, 'total', active_by_status.total)
          order by active_by_status.status
        ),
        '[]'::jsonb
      )
      from active_by_status
    ),
    'overdue_active_count', (
      select count(*)::integer
      from scoped_projects as scoped
      where scoped.status not in ('completed', 'cancelled')
        and scoped.target_date is not null
        and scoped.target_date < manila_today
    ),
    'milestone_completion_rate', (
      select round(
        count(*) filter (where milestone.status = 'completed')::numeric
          / nullif(count(*), 0),
        4
      )
      from public.milestones as milestone
      where milestone.project_id in (select scoped.id from scoped_projects as scoped)
    ),
    'overdue_milestone_count', (
      select count(*)::integer
      from public.milestones as milestone
      where milestone.project_id in (select scoped.id from scoped_projects as scoped)
        and milestone.status <> 'completed'
        and milestone.due_date is not null
        and milestone.due_date < manila_today
    ),
    'tasks_completed_in_period', (
      select count(*)::integer
      from public.tasks as task
      where task.project_id in (select scoped.id from scoped_projects as scoped)
        and task.completed_at is not null
        and task.completed_at >= window_start
        and task.completed_at < window_end
    ),
    'open_tasks_by_status', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object('status', known.status, 'total', coalesce(counted.total, 0))
          order by known.status
        ),
        '[]'::jsonb
      )
      from (
        values ('todo'), ('in_progress'), ('blocked'), ('review')
      ) as known(status)
      left join (
        select task.status, count(*)::integer as total
        from public.tasks as task
        where task.project_id in (select scoped.id from scoped_projects as scoped)
          and task.status <> 'done'
        group by task.status
      ) as counted on counted.status = known.status
    ),
    'progress_drift', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'project_id', drift.id,
            'project_name', drift.name,
            'stored_progress_percent', drift.progress_percent,
            'derived_progress_percent', drift.derived_percent,
            'drift', drift.progress_percent - drift.derived_percent
          )
          order by abs(drift.progress_percent - drift.derived_percent) desc
        ),
        '[]'::jsonb
      )
      from (
        select
          scoped.id,
          scoped.name,
          scoped.progress_percent,
          round(
            100 * task_rollup.done_tasks::numeric / nullif(task_rollup.total_tasks, 0)
          )::integer as derived_percent
        from scoped_projects as scoped
        inner join task_rollup on task_rollup.project_id = scoped.id
        where scoped.status not in ('completed', 'cancelled')
          and task_rollup.total_tasks > 0
          and scoped.progress_percent <> round(
            100 * task_rollup.done_tasks::numeric / nullif(task_rollup.total_tasks, 0)
          )::integer
        order by abs(
          scoped.progress_percent - round(
            100 * task_rollup.done_tasks::numeric / nullif(task_rollup.total_tasks, 0)
          )::integer
        ) desc
        limit 20
      ) as drift
    )
  )
  into report_payload
  from delivery_totals as totals;

  return coalesce(report_payload, '{}'::jsonb);
end;
$function$;

revoke all on function public.get_project_delivery_report(date, date, text, uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.get_project_delivery_report(date, date, text, uuid, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- SECTION 8: make PostgREST aware of the new functions immediately.
-- ---------------------------------------------------------------------------

notify pgrst, 'reload schema';
